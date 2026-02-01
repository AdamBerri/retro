//! Web server - Axum with WebSocket support for streaming results

use crate::data::{DataStore, TickerData};
use crate::scanner::{run_scan, ScanQuery, ScanResult};
use axum::{
    extract::{Path, Query, State, WebSocketUpgrade},
    http::StatusCode,
    response::{Html, IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::ServeDir;

/// Application state
pub struct AppState {
    pub data_store: RwLock<DataStore>,
    pub data_dir: PathBuf,
}

/// Run the web server
pub async fn run() {
    // Initialize data store
    let data_dir = PathBuf::from("./data/ohlcv");
    let mut data_store = DataStore::new();
    
    // Try to load data if directory exists
    if data_dir.exists() {
        if let Err(e) = data_store.load_directory(&data_dir) {
            tracing::warn!("Could not load data: {}", e);
        }
    } else {
        tracing::info!("Data directory not found, starting with empty store");
        tracing::info!("Place parquet/csv files in ./data/ohlcv/ and restart");
        
        // Generate sample data for demo
        tracing::info!("Generating sample data for demo...");
        for ticker in &["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "SPY", "QQQ", "IWM"] {
            let data = crate::data::generate_sample_data(2520); // 10 years
            data_store.data.insert(ticker.to_string(), Arc::new(data));
            data_store.tickers.push(ticker.to_string());
        }
        data_store.tickers.sort();
        tracing::info!("Generated {} sample tickers", data_store.tickers.len());
    }
    
    let state = Arc::new(AppState {
        data_store: RwLock::new(data_store),
        data_dir,
    });
    
    // Build router
    let app = Router::new()
        // API routes
        .route("/api/health", get(health_check))
        .route("/api/tickers", get(get_tickers))
        .route("/api/ticker/:ticker", get(get_ticker_data))
        .route("/api/scan", post(run_scan_handler))
        .route("/api/scan-types", get(get_scan_types))
        // Static files (frontend)
        .nest_service("/", ServeDir::new("frontend").append_index_html_on_directories(true))
        // State
        .with_state(state)
        // CORS
        .layer(CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any));
    
    // Run server
    let addr = SocketAddr::from(([0, 0, 0, 0], 3000));
    tracing::info!("🚀 Server running at http://localhost:3000");
    
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

// ============================================
// HANDLERS
// ============================================

async fn health_check() -> &'static str {
    "OK"
}

async fn get_tickers(State(state): State<Arc<AppState>>) -> Json<Vec<String>> {
    let store = state.data_store.read().await;
    Json(store.get_tickers().to_vec())
}

#[derive(Deserialize)]
struct TickerQuery {
    from: Option<String>,
    to: Option<String>,
}

#[derive(Serialize)]
struct TickerResponse {
    ticker: String,
    data: Vec<OHLCVPoint>,
}

#[derive(Serialize)]
struct OHLCVPoint {
    date: String,
    open: f64,
    high: f64,
    low: f64,
    close: f64,
    volume: f64,
}

async fn get_ticker_data(
    State(state): State<Arc<AppState>>,
    Path(ticker): Path<String>,
    Query(query): Query<TickerQuery>,
) -> Result<Json<TickerResponse>, StatusCode> {
    let store = state.data_store.read().await;
    
    let data = store
        .get(&ticker)
        .ok_or(StatusCode::NOT_FOUND)?;
    
    let mut points: Vec<OHLCVPoint> = data
        .date
        .iter()
        .enumerate()
        .filter(|(_, date)| {
            if let Some(ref from) = query.from {
                if *date < from {
                    return false;
                }
            }
            if let Some(ref to) = query.to {
                if *date > to {
                    return false;
                }
            }
            true
        })
        .map(|(i, date)| OHLCVPoint {
            date: date.clone(),
            open: data.open[i],
            high: data.high[i],
            low: data.low[i],
            close: data.close[i],
            volume: data.volume[i],
        })
        .collect();
    
    // Sort by date
    points.sort_by(|a, b| a.date.cmp(&b.date));
    
    Ok(Json(TickerResponse {
        ticker: ticker.to_uppercase(),
        data: points,
    }))
}

async fn run_scan_handler(
    State(state): State<Arc<AppState>>,
    Json(query): Json<ScanQuery>,
) -> Json<ScanResult> {
    let store = state.data_store.read().await;
    let data = store.data.clone();

    // run_scan uses Rayon (blocking), so run it on the blocking thread pool
    let result = tokio::task::spawn_blocking(move || run_scan(&data, &query))
        .await
        .expect("scan task panicked");

    Json(result)
}

#[derive(Serialize)]
struct ScanType {
    id: String,
    name: String,
    description: String,
    params: Vec<ScanParam>,
}

#[derive(Serialize)]
struct ScanParam {
    name: String,
    param_type: String,
    default: serde_json::Value,
    description: String,
}

async fn get_scan_types() -> Json<Vec<ScanType>> {
    Json(vec![
        ScanType {
            id: "golden_cross".into(),
            name: "Golden Cross".into(),
            description: "50 SMA crosses above 200 SMA".into(),
            params: vec![],
        },
        ScanType {
            id: "death_cross".into(),
            name: "Death Cross".into(),
            description: "50 SMA crosses below 200 SMA".into(),
            params: vec![],
        },
        ScanType {
            id: "ema_cross".into(),
            name: "EMA Cross".into(),
            description: "Fast EMA crosses slow EMA".into(),
            params: vec![
                ScanParam {
                    name: "fast".into(),
                    param_type: "number".into(),
                    default: 12.into(),
                    description: "Fast EMA period".into(),
                },
                ScanParam {
                    name: "slow".into(),
                    param_type: "number".into(),
                    default: 26.into(),
                    description: "Slow EMA period".into(),
                },
                ScanParam {
                    name: "direction".into(),
                    param_type: "select".into(),
                    default: "up".into(),
                    description: "Cross direction".into(),
                },
            ],
        },
        ScanType {
            id: "rsi_oversold".into(),
            name: "RSI Oversold".into(),
            description: "RSI crosses below threshold".into(),
            params: vec![
                ScanParam {
                    name: "period".into(),
                    param_type: "number".into(),
                    default: 14.into(),
                    description: "RSI period".into(),
                },
                ScanParam {
                    name: "threshold".into(),
                    param_type: "number".into(),
                    default: 30.into(),
                    description: "Oversold threshold".into(),
                },
            ],
        },
        ScanType {
            id: "rsi_overbought".into(),
            name: "RSI Overbought".into(),
            description: "RSI crosses above threshold".into(),
            params: vec![
                ScanParam {
                    name: "period".into(),
                    param_type: "number".into(),
                    default: 14.into(),
                    description: "RSI period".into(),
                },
                ScanParam {
                    name: "threshold".into(),
                    param_type: "number".into(),
                    default: 70.into(),
                    description: "Overbought threshold".into(),
                },
            ],
        },
        ScanType {
            id: "obv_breakout".into(),
            name: "OBV Breakout".into(),
            description: "OBV breaks above recent high".into(),
            params: vec![ScanParam {
                name: "lookback".into(),
                param_type: "number".into(),
                default: 20.into(),
                description: "Lookback period for resistance".into(),
            }],
        },
        ScanType {
            id: "volume_spike".into(),
            name: "Volume Spike".into(),
            description: "Volume exceeds average by multiplier".into(),
            params: vec![
                ScanParam {
                    name: "period".into(),
                    param_type: "number".into(),
                    default: 20.into(),
                    description: "Average volume period".into(),
                },
                ScanParam {
                    name: "multiplier".into(),
                    param_type: "number".into(),
                    default: 2.0.into(),
                    description: "Volume multiplier".into(),
                },
            ],
        },
        ScanType {
            id: "macd_cross_up".into(),
            name: "MACD Cross Up".into(),
            description: "MACD crosses above signal line".into(),
            params: vec![
                ScanParam {
                    name: "fast".into(),
                    param_type: "number".into(),
                    default: 12.into(),
                    description: "Fast EMA period".into(),
                },
                ScanParam {
                    name: "slow".into(),
                    param_type: "number".into(),
                    default: 26.into(),
                    description: "Slow EMA period".into(),
                },
                ScanParam {
                    name: "signal".into(),
                    param_type: "number".into(),
                    default: 9.into(),
                    description: "Signal line period".into(),
                },
            ],
        },
        ScanType {
            id: "price_breakout".into(),
            name: "Price Breakout".into(),
            description: "Price breaks above N-day high".into(),
            params: vec![ScanParam {
                name: "lookback".into(),
                param_type: "number".into(),
                default: 252.into(),
                description: "Lookback period (252 = 52 weeks)".into(),
            }],
        },
        ScanType {
            id: "bullish_divergence".into(),
            name: "Bullish Divergence".into(),
            description: "Price lower low + OBV higher high".into(),
            params: vec![ScanParam {
                name: "lookback".into(),
                param_type: "number".into(),
                default: 20.into(),
                description: "Lookback period".into(),
            }],
        },
        ScanType {
            id: "consolidation_breakout".into(),
            name: "Consolidation Breakout".into(),
            description: "Breakout from tight range with volume".into(),
            params: vec![
                ScanParam {
                    name: "period".into(),
                    param_type: "number".into(),
                    default: 30.into(),
                    description: "Consolidation period".into(),
                },
                ScanParam {
                    name: "range_pct".into(),
                    param_type: "number".into(),
                    default: 5.0.into(),
                    description: "Max range percentage".into(),
                },
                ScanParam {
                    name: "volume_multiplier".into(),
                    param_type: "number".into(),
                    default: 1.5.into(),
                    description: "Volume multiplier for breakout".into(),
                },
            ],
        },
        ScanType {
            id: "bullish_engulfing_oversold".into(),
            name: "Bullish Engulfing (Oversold)".into(),
            description: "Green candle engulfs red candle after RSI < 30".into(),
            params: vec![
                ScanParam {
                    name: "rsi_period".into(),
                    param_type: "number".into(),
                    default: 14.into(),
                    description: "RSI period".into(),
                },
                ScanParam {
                    name: "rsi_threshold".into(),
                    param_type: "number".into(),
                    default: 30.into(),
                    description: "RSI oversold threshold".into(),
                },
                ScanParam {
                    name: "lookback".into(),
                    param_type: "number".into(),
                    default: 5.into(),
                    description: "Days to look back for oversold condition".into(),
                },
            ],
        },
    ])
}
