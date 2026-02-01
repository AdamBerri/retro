//! Data loading and storage

use polars::prelude::*;
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::sync::Arc;

/// Raw ticker data in memory-efficient format
#[derive(Debug, Clone)]
pub struct TickerData {
    pub date: Vec<String>,
    pub open: Vec<f64>,
    pub high: Vec<f64>,
    pub low: Vec<f64>,
    pub close: Vec<f64>,
    pub volume: Vec<f64>,
}

impl TickerData {
    pub fn len(&self) -> usize {
        self.close.len()
    }
    
    pub fn is_empty(&self) -> bool {
        self.close.is_empty()
    }
}

/// Load a single parquet file
pub fn load_parquet(path: &Path) -> anyhow::Result<TickerData> {
    let df = LazyFrame::scan_parquet(path, Default::default())?
        .collect()?;
    
    let date = df
        .column("date")?
        .cast(&DataType::String)?
        .str()?
        .into_iter()
        .map(|s| s.unwrap_or("").to_string())
        .collect();
    
    let open = extract_f64_column(&df, "open")?;
    let high = extract_f64_column(&df, "high")?;
    let low = extract_f64_column(&df, "low")?;
    let close = extract_f64_column(&df, "close")?;
    let volume = extract_f64_column(&df, "volume")?;
    
    Ok(TickerData {
        date,
        open,
        high,
        low,
        close,
        volume,
    })
}

fn extract_f64_column(df: &DataFrame, name: &str) -> anyhow::Result<Vec<f64>> {
    let col = df.column(name)?;
    
    // Try to cast to f64
    let f64_col = col.cast(&DataType::Float64)?;
    let chunked = f64_col.f64()?;
    
    Ok(chunked.into_iter().map(|v| v.unwrap_or(0.0)).collect())
}

/// Load a single CSV file
pub fn load_csv(path: &Path) -> anyhow::Result<TickerData> {
    let df = CsvReadOptions::default()
        .with_has_header(true)
        .try_into_reader_with_file_path(Some(path.to_path_buf()))?
        .finish()?;
    
    // Normalize column names to lowercase
    let col_names: Vec<String> = df.get_column_names().iter().map(|s| s.to_lowercase()).collect();
    
    let date_col = if col_names.contains(&"date".to_string()) {
        "date"
    } else if col_names.contains(&"Date".to_string()) {
        "Date"
    } else {
        df.get_column_names()[0] // Assume first column is date
    };
    
    let date = df
        .column(date_col)?
        .cast(&DataType::String)?
        .str()?
        .into_iter()
        .map(|s| s.unwrap_or("").to_string())
        .collect();
    
    let open = extract_f64_column_flexible(&df, &["open", "Open", "OPEN"])?;
    let high = extract_f64_column_flexible(&df, &["high", "High", "HIGH"])?;
    let low = extract_f64_column_flexible(&df, &["low", "Low", "LOW"])?;
    let close = extract_f64_column_flexible(&df, &["close", "Close", "CLOSE"])?;
    let volume = extract_f64_column_flexible(&df, &["volume", "Volume", "VOLUME"])?;
    
    Ok(TickerData {
        date,
        open,
        high,
        low,
        close,
        volume,
    })
}

fn extract_f64_column_flexible(df: &DataFrame, names: &[&str]) -> anyhow::Result<Vec<f64>> {
    for name in names {
        if let Ok(col) = df.column(*name) {
            let f64_col = col.cast(&DataType::Float64)?;
            let chunked = f64_col.f64()?;
            return Ok(chunked.into_iter().map(|v| v.unwrap_or(0.0)).collect());
        }
    }
    
    anyhow::bail!("Could not find column with names: {:?}", names)
}

/// Data store - holds all loaded ticker data in memory
pub struct DataStore {
    pub data: HashMap<String, Arc<TickerData>>,
    pub tickers: Vec<String>,
}

impl DataStore {
    pub fn new() -> Self {
        Self {
            data: HashMap::new(),
            tickers: Vec::new(),
        }
    }
    
    /// Load all data from a directory (parquet or CSV files)
    pub fn load_directory(&mut self, dir: &Path) -> anyhow::Result<()> {
        tracing::info!("Loading data from {:?}", dir);
        
        if !dir.exists() {
            anyhow::bail!("Data directory does not exist: {:?}", dir);
        }
        
        let entries: Vec<_> = fs::read_dir(dir)?
            .filter_map(|e| e.ok())
            .filter(|e| {
                let path = e.path();
                let ext = path.extension().and_then(|s| s.to_str());
                matches!(ext, Some("parquet") | Some("csv"))
            })
            .collect();
        
        tracing::info!("Found {} files to load", entries.len());
        
        let mut loaded = 0;
        let mut failed = 0;
        
        for entry in entries {
            let path = entry.path();
            let ticker = path
                .file_stem()
                .and_then(|s| s.to_str())
                .map(|s| s.split('.').next().unwrap_or(s)) // Handle "AAPL.us" format
                .map(|s| s.to_uppercase())
                .unwrap_or_default();
            
            if ticker.is_empty() {
                continue;
            }
            
            let result = if path.extension().and_then(|s| s.to_str()) == Some("parquet") {
                load_parquet(&path)
            } else {
                load_csv(&path)
            };
            
            match result {
                Ok(data) => {
                    if data.len() >= 200 {
                        // Only include tickers with enough history
                        self.data.insert(ticker.clone(), Arc::new(data));
                        self.tickers.push(ticker);
                        loaded += 1;
                    }
                }
                Err(e) => {
                    tracing::warn!("Failed to load {}: {}", ticker, e);
                    failed += 1;
                }
            }
            
            if (loaded + failed) % 500 == 0 {
                tracing::info!("Progress: {} loaded, {} failed", loaded, failed);
            }
        }
        
        self.tickers.sort();
        
        tracing::info!(
            "Loaded {} tickers ({} failed) with {} total data points",
            loaded,
            failed,
            self.data.values().map(|d| d.len()).sum::<usize>()
        );
        
        Ok(())
    }
    
    /// Get data for a single ticker
    pub fn get(&self, ticker: &str) -> Option<Arc<TickerData>> {
        self.data.get(&ticker.to_uppercase()).cloned()
    }
    
    /// Get all tickers
    pub fn get_tickers(&self) -> &[String] {
        &self.tickers
    }
}

impl Default for DataStore {
    fn default() -> Self {
        Self::new()
    }
}

/// Generate sample data for testing
pub fn generate_sample_data(num_days: usize) -> TickerData {
    use std::f64::consts::PI;
    
    let mut date = Vec::with_capacity(num_days);
    let mut open = Vec::with_capacity(num_days);
    let mut high = Vec::with_capacity(num_days);
    let mut low = Vec::with_capacity(num_days);
    let mut close = Vec::with_capacity(num_days);
    let mut volume = Vec::with_capacity(num_days);
    
    let mut price = 100.0;
    let start_date = chrono::NaiveDate::from_ymd_opt(2020, 1, 1).unwrap();
    
    for i in 0..num_days {
        let d = start_date + chrono::Duration::days(i as i64);
        date.push(d.format("%Y-%m-%d").to_string());
        
        // Random walk with trend
        let trend = 0.0005;
        let volatility = 0.02;
        let seasonal = (i as f64 * 2.0 * PI / 252.0).sin() * 0.01;
        
        let change = trend + volatility * (rand_float() - 0.5) + seasonal;
        price *= 1.0 + change;
        
        let day_open = price * (1.0 + 0.005 * (rand_float() - 0.5));
        let day_close = price;
        let day_high = day_open.max(day_close) * (1.0 + 0.01 * rand_float());
        let day_low = day_open.min(day_close) * (1.0 - 0.01 * rand_float());
        let day_volume = 1_000_000.0 * (0.5 + rand_float());
        
        open.push(day_open);
        high.push(day_high);
        low.push(day_low);
        close.push(day_close);
        volume.push(day_volume);
    }
    
    TickerData {
        date,
        open,
        high,
        low,
        close,
        volume,
    }
}

// Simple pseudo-random number generator (no external dependency)
fn rand_float() -> f64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    static mut SEED: u64 = 0;
    
    unsafe {
        if SEED == 0 {
            SEED = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos() as u64;
        }
        
        SEED = SEED.wrapping_mul(6364136223846793005).wrapping_add(1);
        (SEED >> 33) as f64 / (1u64 << 31) as f64
    }
}
