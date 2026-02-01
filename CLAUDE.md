# RETRO - Claude Project Guide

## Overview

RETRO is a high-performance stock market scanner built with Rust (backend) and vanilla JS (frontend). It scans 8,000+ tickers in under 2 seconds and displays results in a keyboard-navigable interface.

**Core value prop:** Retail traders can query 70 years of market history with the same power hedge funds have.

## Architecture
```
Browser (Frontend)                    Rust (Backend)
┌─────────────────────┐              ┌─────────────────────┐
│ Canvas2D Chart      │              │ Axum Web Server     │
│ Command Bar (Ctrl+K)│◄── JSON ────►│ Parallel Scanner    │
│ Results List (J/K)  │              │ Indicator Engine    │
└─────────────────────┘              └─────────────────────┘
                                              │
                                     ┌────────▼────────┐
                                     │ Parquet Files   │
                                     │ ./data/ohlcv/   │
                                     └─────────────────┘
```

## File Structure
```
retro/
├── Cargo.toml              # Rust dependencies
├── src/
│   ├── main.rs             # Entry point, starts server
│   ├── server.rs           # HTTP routes, API handlers
│   ├── scanner.rs          # Parallel scan engine, scan implementations
│   ├── indicators.rs       # Technical indicators (SMA, EMA, RSI, OBV, etc.)
│   └── data.rs             # Parquet/CSV loading, data structures
├── frontend/
│   ├── index.html          # Main HTML structure
│   ├── css/style.css       # Dark theme styling
│   └── js/
│       ├── app.js          # Main app logic, command bar, results navigation
│       ├── chart.js        # CandlestickChart class, Canvas2D rendering
│       └── indicators.js   # Client-side indicator calculations
├── scripts/
│   └── load_data.py        # Downloads Kaggle data, converts to Parquet
└── data/
    └── ohlcv/              # Stock data files (*.parquet or *.csv)
```

## Running the Project
```bash
# Development
cargo run

# Production (optimized)
cargo build --release
cargo run --release

# Server runs at http://localhost:3000
```

## Data Format

Files in `./data/ohlcv/` should be named `{TICKER}.parquet` or `{TICKER}.csv` with columns:
- `date` (string: YYYY-MM-DD)
- `open` (float)
- `high` (float)
- `low` (float)
- `close` (float)
- `volume` (float)

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/tickers` | GET | List all available tickers |
| `/api/ticker/:ticker` | GET | Get OHLCV data for a ticker |
| `/api/scan` | POST | Run a scan query |
| `/api/scan-types` | GET | List available scan types |

### Scan Request Body
```json
{
  "scan_type": "golden_cross",
  "params": {},
  "date_from": "2022-01-01",
  "date_to": "2025-01-01"
}
```

## Adding a New Scan Type

### 1. Add scan function in `src/scanner.rs`:
```rust
fn scan_my_pattern(data: &TickerData, params: &HashMap<String, serde_json::Value>) -> Vec<bool> {
    let period = params.get("period").and_then(|v| v.as_u64()).unwrap_or(20) as usize;
    
    // Use indicators from indicators.rs
    let sma_val = sma(&data.close, period);
    let rsi_val = rsi(&data.close, 14);
    
    // Return Vec<bool> where true = match at that index
    and(&above(&rsi_val, 70.0), &crossed_above(&data.close, &sma_val))
}
```

### 2. Register in `scan_single_ticker()` match statement:
```rust
"my_pattern" => scan_my_pattern(data, &query.params),
```

### 3. Add to `get_scan_types()` in `src/server.rs`:
```rust
ScanType {
    id: "my_pattern".into(),
    name: "My Pattern".into(),
    description: "Description here".into(),
    params: vec![
        ScanParam {
            name: "period".into(),
            param_type: "number".into(),
            default: 20.into(),
            description: "Lookback period".into(),
        },
    ],
},
```

## Available Indicators (src/indicators.rs)

**Moving Averages:**
- `sma(data, period)` - Simple Moving Average
- `ema(data, period)` - Exponential Moving Average

**Oscillators:**
- `rsi(data, period)` - Relative Strength Index
- `macd(data, fast, slow)` - MACD line
- `macd_signal(data, fast, slow, signal)` - MACD signal line

**Volume:**
- `obv(close, volume)` - On-Balance Volume
- `volume_ratio(volume, period)` - Volume vs average

**Volatility:**
- `atr(high, low, close, period)` - Average True Range
- `bollinger(data, period, std)` - Returns (middle, upper, lower)
- `stddev(data, period)` - Standard Deviation

**Conditions:**
- `crossed_above(a, b)` - A crosses above B
- `crossed_below(a, b)` - A crosses below B
- `higher_high(data, lookback)` - New high vs lookback period
- `lower_low(data, lookback)` - New low vs lookback period
- `above(data, threshold)` - Data > threshold
- `below(data, threshold)` - Data < threshold
- `and(a, b)` - Combine boolean vectors
- `or(a, b)` - Combine boolean vectors

## Frontend Key Points

### Command Bar (Ctrl+K)
- Opens search modal
- Searches tickers and scan types
- Arrow keys to navigate, Enter to select

### Results Navigation
- J = next result
- K = previous result
- Clicking result loads ticker and scrolls chart to event date

### Chart (chart.js)
- Canvas2D rendering at 60fps
- Scroll to pan, Ctrl+Scroll to zoom
- Hover shows crosshair + updates info panel
- `chart.setData(ohlcvArray)` to load data
- `chart.scrollToDate(dateString)` to scroll to specific date

## Performance Notes

- Scanner uses Rayon for parallel processing across all CPU cores
- Indicators are O(n) single-pass algorithms
- Chart uses requestAnimationFrame with dirty flag (only renders when needed)
- Data is loaded once at startup and kept in memory (~500MB for 8000 tickers)

## Common Tasks

### Add a new API endpoint
Edit `src/server.rs`, add route in `run()` function:
```rust
.route("/api/my-endpoint", get(my_handler))
```

### Change chart colors
Edit `frontend/js/chart.js`, modify `this.colors` object in constructor.

### Add keyboard shortcut
Edit `frontend/js/app.js`, add to `document.addEventListener('keydown', ...)`.

### Modify scan parameters UI
Edit `frontend/js/app.js`, `updateScanParams()` function.

## Debugging
```bash
# Rust logs
RUST_LOG=debug cargo run

# Check if data loaded
curl http://localhost:3000/api/tickers

# Test a scan
curl -X POST http://localhost:3000/api/scan \
  -H "Content-Type: application/json" \
  -d '{"scan_type":"golden_cross","params":{}}'
```

## Dependencies

**Rust (Cargo.toml):**
- axum - Web framework
- tokio - Async runtime
- polars - DataFrame/Parquet
- rayon - Parallelism
- serde - Serialization

**Frontend:**
- No dependencies, vanilla JS
- No build step required

## Future Enhancements to Consider

1. **LLM Query Parser** - Natural language → scan code generation
2. **WebSocket** - Stream scan results as they're found
3. **WASM Scanner** - Run scans client-side for instant results
4. **Custom Indicators** - User-defined indicator builder
5. **Alerts** - Save scans and get notified on new matches
6. **Screener** - Real-time scanning with live data