//! Scanner - parallel execution engine for stock queries

use crate::data::TickerData;
use crate::generated;
use crate::indicators::*;
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;

/// A single match from a scan
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanMatch {
    pub ticker: String,
    pub date: String,
    pub close: f64,
    pub volume: f64,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    #[serde(flatten)]
    pub indicators: HashMap<String, f64>,
}

/// Scan query definition
#[derive(Debug, Clone, Deserialize)]
pub struct ScanQuery {
    pub scan_type: String,
    pub params: HashMap<String, serde_json::Value>,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
}

/// Scan result with stats
#[derive(Debug, Clone, Serialize)]
pub struct ScanResult {
    pub matches: Vec<ScanMatch>,
    pub total_tickers_scanned: usize,
    pub tickers_with_matches: usize,
    pub scan_time_ms: u64,
}

/// Run a scan across all tickers in parallel
pub fn run_scan(
    data: &HashMap<String, Arc<TickerData>>,
    query: &ScanQuery,
) -> ScanResult {
    let start = std::time::Instant::now();
    
    let tickers: Vec<_> = data.keys().cloned().collect();
    let total_tickers = tickers.len();
    
    // Parallel scan
    let results: Vec<Vec<ScanMatch>> = tickers
        .par_iter()
        .filter_map(|ticker| {
            let ticker_data = data.get(ticker)?;
            scan_single_ticker(ticker, ticker_data, query)
        })
        .collect();
    
    let tickers_with_matches = results.len();
    let matches: Vec<ScanMatch> = results.into_iter().flatten().collect();
    
    let scan_time_ms = start.elapsed().as_millis() as u64;
    
    tracing::info!(
        "Scan complete: {} matches across {} tickers in {}ms",
        matches.len(),
        tickers_with_matches,
        scan_time_ms
    );
    
    ScanResult {
        matches,
        total_tickers_scanned: total_tickers,
        tickers_with_matches,
        scan_time_ms,
    }
}

/// Scan a single ticker
fn scan_single_ticker(
    ticker: &str,
    data: &TickerData,
    query: &ScanQuery,
) -> Option<Vec<ScanMatch>> {
    let mask = match query.scan_type.as_str() {
        "golden_cross" => scan_golden_cross(data),
        "death_cross" => scan_death_cross(data),
        "ema_cross" => scan_ema_cross(data, &query.params),
        "rsi_oversold" => scan_rsi_oversold(data, &query.params),
        "rsi_overbought" => scan_rsi_overbought(data, &query.params),
        "obv_breakout" => scan_obv_breakout(data, &query.params),
        "volume_spike" => scan_volume_spike(data, &query.params),
        "bollinger_squeeze" => scan_bollinger_squeeze(data, &query.params),
        "macd_cross_up" => scan_macd_cross_up(data, &query.params),
        "macd_cross_down" => scan_macd_cross_down(data, &query.params),
        "price_breakout" => scan_price_breakout(data, &query.params),
        "bullish_divergence" => scan_bullish_divergence(data, &query.params),
        "bearish_divergence" => scan_bearish_divergence(data, &query.params),
        "consolidation_breakout" => scan_consolidation_breakout(data, &query.params),
        "bullish_engulfing_oversold" => scan_bullish_engulfing_oversold(data, &query.params),
        "monthly_gap_drop" => scan_monthly_gap_drop(data, &query.params),
        "custom" => scan_custom(data, &query.params),
        _ => {
            if let Some(scan_fn) = generated::get_scan(&query.scan_type) {
                scan_fn(data, &query.params)
            } else {
                return None;
            }
        }
    };
    
    // Filter by date range if specified
    let mut matches = Vec::new();
    
    for (i, &matched) in mask.iter().enumerate() {
        if !matched {
            continue;
        }
        
        let date = &data.date[i];
        
        // Check date range
        if let Some(ref from) = query.date_from {
            if date < from {
                continue;
            }
        }
        if let Some(ref to) = query.date_to {
            if date > to {
                continue;
            }
        }
        
        matches.push(ScanMatch {
            ticker: ticker.to_string(),
            date: date.clone(),
            close: data.close[i],
            volume: data.volume[i],
            open: data.open[i],
            high: data.high[i],
            low: data.low[i],
            indicators: HashMap::new(),
        });
    }
    
    if matches.is_empty() {
        None
    } else {
        Some(matches)
    }
}

// ============================================
// SCAN IMPLEMENTATIONS
// ============================================

fn scan_golden_cross(data: &TickerData) -> Vec<bool> {
    let sma_50 = sma(&data.close, 50);
    let sma_200 = sma(&data.close, 200);
    crossed_above(&sma_50, &sma_200)
}

fn scan_death_cross(data: &TickerData) -> Vec<bool> {
    let sma_50 = sma(&data.close, 50);
    let sma_200 = sma(&data.close, 200);
    crossed_below(&sma_50, &sma_200)
}

fn scan_ema_cross(data: &TickerData, params: &HashMap<String, serde_json::Value>) -> Vec<bool> {
    let fast = params.get("fast").and_then(|v| v.as_u64()).unwrap_or(12) as usize;
    let slow = params.get("slow").and_then(|v| v.as_u64()).unwrap_or(26) as usize;
    let direction = params.get("direction").and_then(|v| v.as_str()).unwrap_or("up");
    
    let ema_fast = ema(&data.close, fast);
    let ema_slow = ema(&data.close, slow);
    
    if direction == "up" {
        crossed_above(&ema_fast, &ema_slow)
    } else {
        crossed_below(&ema_fast, &ema_slow)
    }
}

fn scan_rsi_oversold(data: &TickerData, params: &HashMap<String, serde_json::Value>) -> Vec<bool> {
    let period = params.get("period").and_then(|v| v.as_u64()).unwrap_or(14) as usize;
    let threshold = params.get("threshold").and_then(|v| v.as_f64()).unwrap_or(30.0);
    
    let rsi_vals = rsi(&data.close, period);
    
    // Entering oversold (crossing below threshold)
    let thresh_vec: Vec<f64> = vec![threshold; rsi_vals.len()];
    crossed_below(&rsi_vals, &thresh_vec)
}

fn scan_rsi_overbought(data: &TickerData, params: &HashMap<String, serde_json::Value>) -> Vec<bool> {
    let period = params.get("period").and_then(|v| v.as_u64()).unwrap_or(14) as usize;
    let threshold = params.get("threshold").and_then(|v| v.as_f64()).unwrap_or(70.0);
    
    let rsi_vals = rsi(&data.close, period);
    
    // Entering overbought (crossing above threshold)
    let thresh_vec: Vec<f64> = vec![threshold; rsi_vals.len()];
    crossed_above(&rsi_vals, &thresh_vec)
}

fn scan_obv_breakout(data: &TickerData, params: &HashMap<String, serde_json::Value>) -> Vec<bool> {
    let lookback = params.get("lookback").and_then(|v| v.as_u64()).unwrap_or(20) as usize;
    
    let obv_vals = obv(&data.close, &data.volume);
    higher_high(&obv_vals, lookback)
}

fn scan_volume_spike(data: &TickerData, params: &HashMap<String, serde_json::Value>) -> Vec<bool> {
    let period = params.get("period").and_then(|v| v.as_u64()).unwrap_or(20) as usize;
    let multiplier = params.get("multiplier").and_then(|v| v.as_f64()).unwrap_or(2.0);
    
    let vol_ratio = volume_ratio(&data.volume, period);
    above(&vol_ratio, multiplier)
}

fn scan_bollinger_squeeze(data: &TickerData, params: &HashMap<String, serde_json::Value>) -> Vec<bool> {
    let period = params.get("period").and_then(|v| v.as_u64()).unwrap_or(20) as usize;
    let std_mult = params.get("std").and_then(|v| v.as_f64()).unwrap_or(2.0);
    let squeeze_pct = params.get("squeeze_pct").and_then(|v| v.as_f64()).unwrap_or(5.0);
    
    let (middle, upper, lower) = bollinger(&data.close, period, std_mult);
    
    // Squeeze = bands narrow (upper - lower) / middle < squeeze_pct%
    middle
        .iter()
        .zip(upper.iter())
        .zip(lower.iter())
        .map(|((&m, &u), &l)| {
            if m.is_nan() || u.is_nan() || l.is_nan() || m == 0.0 {
                false
            } else {
                ((u - l) / m * 100.0) < squeeze_pct
            }
        })
        .collect()
}

fn scan_macd_cross_up(data: &TickerData, params: &HashMap<String, serde_json::Value>) -> Vec<bool> {
    let fast = params.get("fast").and_then(|v| v.as_u64()).unwrap_or(12) as usize;
    let slow = params.get("slow").and_then(|v| v.as_u64()).unwrap_or(26) as usize;
    let signal = params.get("signal").and_then(|v| v.as_u64()).unwrap_or(9) as usize;
    
    let macd_line = macd(&data.close, fast, slow);
    let signal_line = macd_signal(&data.close, fast, slow, signal);
    
    crossed_above(&macd_line, &signal_line)
}

fn scan_macd_cross_down(data: &TickerData, params: &HashMap<String, serde_json::Value>) -> Vec<bool> {
    let fast = params.get("fast").and_then(|v| v.as_u64()).unwrap_or(12) as usize;
    let slow = params.get("slow").and_then(|v| v.as_u64()).unwrap_or(26) as usize;
    let signal = params.get("signal").and_then(|v| v.as_u64()).unwrap_or(9) as usize;
    
    let macd_line = macd(&data.close, fast, slow);
    let signal_line = macd_signal(&data.close, fast, slow, signal);
    
    crossed_below(&macd_line, &signal_line)
}

fn scan_price_breakout(data: &TickerData, params: &HashMap<String, serde_json::Value>) -> Vec<bool> {
    let lookback = params.get("lookback").and_then(|v| v.as_u64()).unwrap_or(252) as usize; // 52 weeks
    higher_high(&data.close, lookback)
}

fn scan_bullish_divergence(data: &TickerData, params: &HashMap<String, serde_json::Value>) -> Vec<bool> {
    let lookback = params.get("lookback").and_then(|v| v.as_u64()).unwrap_or(20) as usize;
    
    let obv_vals = obv(&data.close, &data.volume);
    
    // Price lower low + OBV higher high
    let price_ll = lower_low(&data.close, lookback);
    let obv_hh = higher_high(&obv_vals, lookback);
    
    and(&price_ll, &obv_hh)
}

fn scan_bearish_divergence(data: &TickerData, params: &HashMap<String, serde_json::Value>) -> Vec<bool> {
    let lookback = params.get("lookback").and_then(|v| v.as_u64()).unwrap_or(20) as usize;
    
    let obv_vals = obv(&data.close, &data.volume);
    
    // Price higher high + OBV lower low
    let price_hh = higher_high(&data.close, lookback);
    let obv_ll = lower_low(&obv_vals, lookback);
    
    and(&price_hh, &obv_ll)
}

fn scan_consolidation_breakout(data: &TickerData, params: &HashMap<String, serde_json::Value>) -> Vec<bool> {
    let period = params.get("period").and_then(|v| v.as_u64()).unwrap_or(30) as usize;
    let range_pct = params.get("range_pct").and_then(|v| v.as_f64()).unwrap_or(5.0);
    let vol_mult = params.get("volume_multiplier").and_then(|v| v.as_f64()).unwrap_or(1.5);
    
    let n = data.close.len();
    let mut result = vec![false; n];
    
    let vol_ratio = volume_ratio(&data.volume, 20);
    
    for i in period..n {
        // Check if previous `period` days were in a tight range
        let slice = &data.close[(i - period)..i];
        let max_price = slice.iter().fold(f64::NEG_INFINITY, |a, &b| a.max(b));
        let min_price = slice.iter().fold(f64::INFINITY, |a, &b| a.min(b));
        
        if min_price == 0.0 {
            continue;
        }
        
        let range = (max_price - min_price) / min_price * 100.0;
        
        // Consolidation: tight range
        // Breakout: today's close > max_price AND volume spike
        if range < range_pct 
            && data.close[i] > max_price 
            && !vol_ratio[i].is_nan() 
            && vol_ratio[i] > vol_mult 
        {
            result[i] = true;
        }
    }
    
    result
}

/// Bullish engulfing after RSI oversold
fn scan_bullish_engulfing_oversold(data: &TickerData, params: &HashMap<String, serde_json::Value>) -> Vec<bool> {
    let rsi_period = params.get("rsi_period").and_then(|v| v.as_u64()).unwrap_or(14) as usize;
    let rsi_threshold = params.get("rsi_threshold").and_then(|v| v.as_f64()).unwrap_or(30.0);
    let lookback = params.get("lookback").and_then(|v| v.as_u64()).unwrap_or(5) as usize;

    let n = data.close.len();
    let mut result = vec![false; n];
    let rsi_vals = rsi(&data.close, rsi_period);

    for i in 1..n {
        // Check for bullish engulfing: prev red, current green, current body engulfs prev body
        let prev_red = data.close[i - 1] < data.open[i - 1];
        let curr_green = data.close[i] > data.open[i];
        let engulfs = data.open[i] <= data.close[i - 1] && data.close[i] >= data.open[i - 1];

        if prev_red && curr_green && engulfs {
            // Check if RSI was below threshold within lookback period
            let start = if i > lookback { i - lookback } else { 0 };
            let rsi_was_oversold = (start..i).any(|j| !rsi_vals[j].is_nan() && rsi_vals[j] < rsi_threshold);

            if rsi_was_oversold {
                result[i] = true;
            }
        }
    }

    result
}

#[derive(Debug, Clone, Copy)]
struct MonthlyBar {
    start_idx: usize,
    end_idx: usize,
    open: f64,
    close: f64,
    high: f64,
    low: f64,
    volume: f64,
}

#[inline]
fn month_key(date: &str) -> &str {
    date.get(0..7).unwrap_or(date)
}

fn build_monthly_bars(data: &TickerData) -> Vec<MonthlyBar> {
    let n = data.close.len();
    if n == 0 {
        return Vec::new();
    }

    let mut bars = Vec::new();

    let mut current_month = month_key(&data.date[0]).to_string();
    let mut start_idx = 0usize;
    let mut open = data.open[0];
    let mut high = data.high[0];
    let mut low = data.low[0];
    let mut volume = data.volume[0];

    for i in 1..n {
        let month = month_key(&data.date[i]);
        if month != current_month {
            let end_idx = i - 1;
            let close = data.close[end_idx];
            bars.push(MonthlyBar {
                start_idx,
                end_idx,
                open,
                close,
                high,
                low,
                volume,
            });

            current_month = month.to_string();
            start_idx = i;
            open = data.open[i];
            high = data.high[i];
            low = data.low[i];
            volume = data.volume[i];
        } else {
            high = high.max(data.high[i]);
            low = low.min(data.low[i]);
            volume += data.volume[i];
        }
    }

    let end_idx = n - 1;
    let close = data.close[end_idx];
    bars.push(MonthlyBar {
        start_idx,
        end_idx,
        open,
        close,
        high,
        low,
        volume,
    });

    bars
}

/// Monthly gap-down (open below prior month's close by %), optionally filter by candle direction.
fn scan_monthly_gap_drop(data: &TickerData, params: &HashMap<String, serde_json::Value>) -> Vec<bool> {
    let gap_pct = params
        .get("gap_pct")
        .and_then(|v| v.as_f64())
        .unwrap_or(5.0)
        .abs();
    let candle = params
        .get("candle")
        .and_then(|v| v.as_str())
        .unwrap_or("any")
        .to_lowercase();
    let event_on = params
        .get("event_on")
        .and_then(|v| v.as_str())
        .unwrap_or("start")
        .to_lowercase();

    let n = data.close.len();
    let mut result = vec![false; n];

    let bars = build_monthly_bars(data);
    if bars.len() < 2 {
        return result;
    }

    for i in 1..bars.len() {
        let prev = bars[i - 1];
        let curr = bars[i];

        if prev.close == 0.0 {
            continue;
        }

        let gap = (curr.open - prev.close) / prev.close * 100.0;
        if gap > -gap_pct {
            continue;
        }

        let candle_ok = match candle.as_str() {
            "bullish" => curr.close > curr.open,
            "bearish" => curr.close < curr.open,
            _ => true,
        };

        if !candle_ok {
            continue;
        }

        let idx = if event_on == "end" || event_on == "close" {
            curr.end_idx
        } else {
            curr.start_idx
        };
        if idx < result.len() {
            result[idx] = true;
        }
    }

    result
}

/// Custom scan - interprets a simple expression
fn scan_custom(data: &TickerData, params: &HashMap<String, serde_json::Value>) -> Vec<bool> {
    // This is a simplified custom scan - in production you'd want a proper expression parser
    // For now, support combinations of predefined conditions
    
    let conditions: Vec<&str> = params
        .get("conditions")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str()).collect())
        .unwrap_or_default();
    
    if conditions.is_empty() {
        return vec![false; data.close.len()];
    }
    
    let mut result: Option<Vec<bool>> = None;
    
    for cond in conditions {
        let cond_result = match cond {
            "golden_cross" => scan_golden_cross(data),
            "death_cross" => scan_death_cross(data),
            "rsi_oversold" => scan_rsi_oversold(data, params),
            "rsi_overbought" => scan_rsi_overbought(data, params),
            "volume_spike" => scan_volume_spike(data, params),
            "price_breakout" => scan_price_breakout(data, params),
            _ => continue,
        };
        
        result = Some(match result {
            None => cond_result,
            Some(r) => and(&r, &cond_result),
        });
    }
    
    result.unwrap_or_else(|| vec![false; data.close.len()])
}
