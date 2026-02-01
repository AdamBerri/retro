//! Technical indicators - optimized for speed
//! All functions operate on slices and return Vec<f64> or Vec<bool>

/// Simple Moving Average - O(n) using rolling sum
#[inline]
pub fn sma(data: &[f64], period: usize) -> Vec<f64> {
    let n = data.len();
    let mut result = vec![f64::NAN; n];
    
    if n < period || period == 0 {
        return result;
    }
    
    let mut sum: f64 = data[..period].iter().sum();
    result[period - 1] = sum / period as f64;
    
    for i in period..n {
        sum += data[i] - data[i - period];
        result[i] = sum / period as f64;
    }
    
    result
}

/// Exponential Moving Average
#[inline]
pub fn ema(data: &[f64], period: usize) -> Vec<f64> {
    let n = data.len();
    let mut result = vec![f64::NAN; n];
    
    if n < period || period == 0 {
        return result;
    }
    
    let multiplier = 2.0 / (period as f64 + 1.0);
    
    // First EMA = SMA
    let first_sma: f64 = data[..period].iter().sum::<f64>() / period as f64;
    result[period - 1] = first_sma;
    
    for i in period..n {
        result[i] = (data[i] - result[i - 1]) * multiplier + result[i - 1];
    }
    
    result
}

/// Relative Strength Index
#[inline]
pub fn rsi(data: &[f64], period: usize) -> Vec<f64> {
    let n = data.len();
    let mut result = vec![f64::NAN; n];
    
    if n < period + 1 || period == 0 {
        return result;
    }
    
    // Calculate gains and losses
    let mut gains = vec![0.0; n];
    let mut losses = vec![0.0; n];
    
    for i in 1..n {
        let change = data[i] - data[i - 1];
        if change > 0.0 {
            gains[i] = change;
        } else {
            losses[i] = -change;
        }
    }
    
    // First average (SMA)
    let mut avg_gain: f64 = gains[1..=period].iter().sum::<f64>() / period as f64;
    let mut avg_loss: f64 = losses[1..=period].iter().sum::<f64>() / period as f64;
    
    result[period] = if avg_loss == 0.0 {
        100.0
    } else {
        100.0 - (100.0 / (1.0 + avg_gain / avg_loss))
    };
    
    // Smoothed average (Wilder's method)
    for i in (period + 1)..n {
        avg_gain = (avg_gain * (period - 1) as f64 + gains[i]) / period as f64;
        avg_loss = (avg_loss * (period - 1) as f64 + losses[i]) / period as f64;
        
        result[i] = if avg_loss == 0.0 {
            100.0
        } else {
            100.0 - (100.0 / (1.0 + avg_gain / avg_loss))
        };
    }
    
    result
}

/// On-Balance Volume
#[inline]
pub fn obv(close: &[f64], volume: &[f64]) -> Vec<f64> {
    let n = close.len();
    let mut result = vec![0.0; n];
    
    for i in 1..n {
        if close[i] > close[i - 1] {
            result[i] = result[i - 1] + volume[i];
        } else if close[i] < close[i - 1] {
            result[i] = result[i - 1] - volume[i];
        } else {
            result[i] = result[i - 1];
        }
    }
    
    result
}

/// MACD Line
#[inline]
pub fn macd(data: &[f64], fast: usize, slow: usize) -> Vec<f64> {
    let ema_fast = ema(data, fast);
    let ema_slow = ema(data, slow);
    
    ema_fast
        .iter()
        .zip(ema_slow.iter())
        .map(|(f, s)| f - s)
        .collect()
}

/// MACD Signal Line
#[inline]
pub fn macd_signal(data: &[f64], fast: usize, slow: usize, signal: usize) -> Vec<f64> {
    let macd_line = macd(data, fast, slow);
    ema(&macd_line, signal)
}

/// MACD Histogram
#[inline]
pub fn macd_histogram(data: &[f64], fast: usize, slow: usize, signal: usize) -> Vec<f64> {
    let macd_line = macd(data, fast, slow);
    let signal_line = ema(&macd_line, signal);
    
    macd_line
        .iter()
        .zip(signal_line.iter())
        .map(|(m, s)| m - s)
        .collect()
}

/// Average True Range
#[inline]
pub fn atr(high: &[f64], low: &[f64], close: &[f64], period: usize) -> Vec<f64> {
    let n = high.len();
    let mut tr = vec![0.0; n];
    
    tr[0] = high[0] - low[0];
    
    for i in 1..n {
        let hl = high[i] - low[i];
        let hc = (high[i] - close[i - 1]).abs();
        let lc = (low[i] - close[i - 1]).abs();
        tr[i] = hl.max(hc).max(lc);
    }
    
    sma(&tr, period)
}

/// Bollinger Bands - returns (middle, upper, lower)
#[inline]
pub fn bollinger(data: &[f64], period: usize, num_std: f64) -> (Vec<f64>, Vec<f64>, Vec<f64>) {
    let n = data.len();
    let middle = sma(data, period);
    let mut upper = vec![f64::NAN; n];
    let mut lower = vec![f64::NAN; n];
    
    for i in (period - 1)..n {
        let slice = &data[(i + 1 - period)..=i];
        let mean = middle[i];
        let variance: f64 = slice.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / period as f64;
        let std_dev = variance.sqrt();
        
        upper[i] = mean + num_std * std_dev;
        lower[i] = mean - num_std * std_dev;
    }
    
    (middle, upper, lower)
}

/// Rolling Maximum
#[inline]
pub fn rolling_max(data: &[f64], period: usize) -> Vec<f64> {
    let n = data.len();
    let mut result = vec![f64::NAN; n];
    
    for i in (period - 1)..n {
        result[i] = data[(i + 1 - period)..=i]
            .iter()
            .fold(f64::NEG_INFINITY, |a, &b| a.max(b));
    }
    
    result
}

/// Rolling Minimum
#[inline]
pub fn rolling_min(data: &[f64], period: usize) -> Vec<f64> {
    let n = data.len();
    let mut result = vec![f64::NAN; n];
    
    for i in (period - 1)..n {
        result[i] = data[(i + 1 - period)..=i]
            .iter()
            .fold(f64::INFINITY, |a, &b| a.min(b));
    }
    
    result
}

/// Standard Deviation
#[inline]
pub fn stddev(data: &[f64], period: usize) -> Vec<f64> {
    let n = data.len();
    let mut result = vec![f64::NAN; n];
    let means = sma(data, period);
    
    for i in (period - 1)..n {
        let slice = &data[(i + 1 - period)..=i];
        let mean = means[i];
        let variance: f64 = slice.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / period as f64;
        result[i] = variance.sqrt();
    }
    
    result
}

/// Volume Weighted Average Price (intraday approximation)
#[inline]
pub fn vwap(high: &[f64], low: &[f64], close: &[f64], volume: &[f64]) -> Vec<f64> {
    let n = high.len();
    let mut result = vec![0.0; n];
    
    let mut cum_vol = 0.0;
    let mut cum_tp_vol = 0.0;
    
    for i in 0..n {
        let typical_price = (high[i] + low[i] + close[i]) / 3.0;
        cum_vol += volume[i];
        cum_tp_vol += typical_price * volume[i];
        
        result[i] = if cum_vol > 0.0 { cum_tp_vol / cum_vol } else { typical_price };
    }
    
    result
}

// ============================================
// CONDITION DETECTION
// ============================================

/// Crossed above: A crosses above B
#[inline]
pub fn crossed_above(a: &[f64], b: &[f64]) -> Vec<bool> {
    let n = a.len();
    let mut result = vec![false; n];
    
    for i in 1..n {
        if !a[i].is_nan() && !b[i].is_nan() && !a[i-1].is_nan() && !b[i-1].is_nan() {
            result[i] = a[i] > b[i] && a[i - 1] <= b[i - 1];
        }
    }
    
    result
}

/// Crossed below: A crosses below B
#[inline]
pub fn crossed_below(a: &[f64], b: &[f64]) -> Vec<bool> {
    let n = a.len();
    let mut result = vec![false; n];
    
    for i in 1..n {
        if !a[i].is_nan() && !b[i].is_nan() && !a[i-1].is_nan() && !b[i-1].is_nan() {
            result[i] = a[i] < b[i] && a[i - 1] >= b[i - 1];
        }
    }
    
    result
}

/// Higher high: value > rolling max of previous N periods
#[inline]
pub fn higher_high(data: &[f64], lookback: usize) -> Vec<bool> {
    let n = data.len();
    let mut result = vec![false; n];
    let prev_max = rolling_max(data, lookback);
    
    for i in lookback..n {
        if !data[i].is_nan() && !prev_max[i - 1].is_nan() {
            result[i] = data[i] > prev_max[i - 1];
        }
    }
    
    result
}

/// Lower low: value < rolling min of previous N periods
#[inline]
pub fn lower_low(data: &[f64], lookback: usize) -> Vec<bool> {
    let n = data.len();
    let mut result = vec![false; n];
    let prev_min = rolling_min(data, lookback);
    
    for i in lookback..n {
        if !data[i].is_nan() && !prev_min[i - 1].is_nan() {
            result[i] = data[i] < prev_min[i - 1];
        }
    }
    
    result
}

/// Percent change
#[inline]
pub fn pct_change(data: &[f64], periods: usize) -> Vec<f64> {
    let n = data.len();
    let mut result = vec![f64::NAN; n];
    
    for i in periods..n {
        if data[i - periods] != 0.0 {
            result[i] = (data[i] - data[i - periods]) / data[i - periods] * 100.0;
        }
    }
    
    result
}

/// Volume ratio: current volume / average volume
#[inline]
pub fn volume_ratio(volume: &[f64], period: usize) -> Vec<f64> {
    let avg = sma(volume, period);
    
    volume
        .iter()
        .zip(avg.iter())
        .map(|(v, a)| if *a > 0.0 && !a.is_nan() { v / a } else { f64::NAN })
        .collect()
}

/// Is above threshold
#[inline]
pub fn above(data: &[f64], threshold: f64) -> Vec<bool> {
    data.iter().map(|&v| !v.is_nan() && v > threshold).collect()
}

/// Is below threshold
#[inline]
pub fn below(data: &[f64], threshold: f64) -> Vec<bool> {
    data.iter().map(|&v| !v.is_nan() && v < threshold).collect()
}

/// AND two boolean vectors
#[inline]
pub fn and(a: &[bool], b: &[bool]) -> Vec<bool> {
    a.iter().zip(b.iter()).map(|(&x, &y)| x && y).collect()
}

/// OR two boolean vectors
#[inline]
pub fn or(a: &[bool], b: &[bool]) -> Vec<bool> {
    a.iter().zip(b.iter()).map(|(&x, &y)| x || y).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sma() {
        let data = vec![1.0, 2.0, 3.0, 4.0, 5.0];
        let result = sma(&data, 3);
        assert!((result[2] - 2.0).abs() < 0.001);
        assert!((result[4] - 4.0).abs() < 0.001);
    }

    #[test]
    fn test_crossed_above() {
        let a = vec![1.0, 2.0, 3.0, 4.0];
        let b = vec![2.0, 2.0, 2.0, 2.0];
        let result = crossed_above(&a, &b);
        assert!(!result[0]);
        assert!(!result[1]);
        assert!(result[2]);
        assert!(!result[3]);
    }
}
