# RETRO 🚀

**Query the past. Trade the future.**

A blazing-fast stock market scanner that gives retail traders the same backtesting capabilities hedge funds have had for decades.

## Features

- ⚡ **Sub-second scans** across 8,000+ tickers using Rust + parallel processing
- 📈 **70 years of data** - query historical patterns back to the 1950s
- 🔍 **Natural queries** - "Find stocks with golden crosses while RSI was oversold"
- 📊 **Beautiful charts** - smooth 60fps candlestick charts with indicators
- ⌨️ **Keyboard-first** - Ctrl+K to search, J/K to navigate results
- 🆓 **Free data** - uses publicly available historical data

## Quick Start

### 1. Install Rust

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### 2. Clone and build

```bash
git clone <your-repo>
cd retro
cargo build --release
```

### 3. Get the data

```bash
# Option A: Use the Python loader script
pip install kagglehub polars
python scripts/load_data.py

# Option B: Manual download
# Go to: https://www.kaggle.com/datasets/borismarjanovic/price-volume-data-for-all-us-stocks-etfs
# Download and extract CSVs to ./data/ohlcv/
```

### 4. Run

```bash
cargo run --release
```

Open http://localhost:3000

## Usage

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl+K` | Open command bar |
| `J` | Next result |
| `K` | Previous result |
| `Escape` | Close command bar |
| `Scroll` | Pan chart |
| `Ctrl+Scroll` | Zoom chart |

### Available Scans

| Scan Type | Description |
|-----------|-------------|
| Golden Cross | 50 SMA crosses above 200 SMA |
| Death Cross | 50 SMA crosses below 200 SMA |
| EMA Cross | Configurable EMA crossover |
| RSI Oversold | RSI drops below threshold (default 30) |
| RSI Overbought | RSI rises above threshold (default 70) |
| OBV Breakout | OBV breaks above N-day high |
| Volume Spike | Volume exceeds N× average |
| MACD Cross | MACD crosses signal line |
| Price Breakout | Price breaks N-day high |
| Bullish Divergence | Price lower low + OBV higher high |
| Consolidation Breakout | Breakout from tight range with volume |

### Natural Language (LLM → Rust)

NL queries are clarified and compiled into Rust scans using Anthropic Claude.

Create a `.env` file with:

```
ANTHROPIC_API_KEY=your_key_here
ANTHROPIC_MODEL=claude-opus-4-6
ANTHROPIC_INFERENCE_GEO=us
```

Optional overrides:

```
ANTHROPIC_VERSION=2023-06-01
ANTHROPIC_API_URL=https://api.anthropic.com/v1/messages
```

The backend uses:

- `/api/nl/clarify` (clarifying questions)
- `/api/nl/compile` (generate Rust scan code)

Schemas and prompt rules live in `src/llm.rs`.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                       Frontend (Browser)                         │
│  Canvas2D Chart │ Keyboard Navigation │ Virtual Scroll Results  │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTP/JSON
┌───────────────────────────▼─────────────────────────────────────┐
│                    Backend (Rust + Axum)                         │
│  API Server │ Parallel Scanner (Rayon) │ Indicator Engine       │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│                    Data (Parquet Files)                          │
│  8000+ tickers │ 70 years daily OHLCV │ ~2GB compressed         │
└─────────────────────────────────────────────────────────────────┘
```

## Performance

| Metric | Value |
|--------|-------|
| Full market scan (8000 tickers) | <2 seconds |
| Single ticker load | <10ms |
| Chart render | 60fps |
| Memory usage | ~500MB |

## Project Structure

```
retro/
├── Cargo.toml              # Rust dependencies
├── src/
│   ├── main.rs             # Entry point
│   ├── server.rs           # Axum web server
│   ├── scanner.rs          # Parallel scan engine
│   ├── indicators.rs       # Technical indicators
│   └── data.rs             # Data loading
├── frontend/
│   ├── index.html          # Main page
│   ├── css/style.css       # Styling
│   └── js/
│       ├── app.js          # Application logic
│       ├── chart.js        # Candlestick renderer
│       └── indicators.js   # Client-side indicators
├── scripts/
│   └── load_data.py        # Data download script
└── data/
    └── ohlcv/              # Parquet files (gitignored)
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/tickers` | GET | List all tickers |
| `/api/ticker/:ticker` | GET | Get OHLCV data for ticker |
| `/api/scan` | POST | Run a scan |
| `/api/scan-types` | GET | List available scan types |

### Scan Request Example

```json
{
  "scan_type": "ema_cross",
  "params": {
    "fast": 13,
    "slow": 48,
    "direction": "up"
  },
  "date_from": "2022-01-01",
  "date_to": "2025-01-01"
}
```

## Adding Custom Scans

Edit `src/scanner.rs` and add a new scan function:

```rust
fn scan_my_custom_pattern(data: &TickerData, params: &HashMap<String, serde_json::Value>) -> Vec<bool> {
    let period = params.get("period").and_then(|v| v.as_u64()).unwrap_or(20) as usize;
    
    // Your logic here
    let sma = sma(&data.close, period);
    let rsi = rsi(&data.close, 14);
    
    // Return boolean mask
    and(&above(&rsi, 70.0), &crossed_above(&data.close, &sma))
}
```

Then register it in `scan_single_ticker()`.

## Data Sources

The default setup uses the Kaggle dataset which includes:
- All US stocks (NYSE, NASDAQ, AMEX)
- All US ETFs
- Daily OHLCV data back to 1962 (varies by ticker)

For additional data:
- [Stooq](https://stooq.com/db/h/) - Free bulk download
- [EOD Historical Data](https://eodhistoricaldata.com/) - $20/month, 30+ years
- [Yahoo Finance](https://finance.yahoo.com/) - via yfinance Python library

## Contributing

1. Fork the repo
2. Create a feature branch
3. Make your changes
4. Run `cargo test`
5. Submit a PR

## License

MIT

## Roadmap

- [ ] WebSocket streaming for live scans
- [ ] Custom indicator builder
- [ ] Pattern recognition (head & shoulders, etc.)
- [ ] Screener (live scanning)
- [ ] Portfolio tracking
- [ ] Mobile responsive
- [ ] Alerts
- [ ] Community shared scans

---

Built with ❤️ for retail traders.

*"The playing field should be level."*
