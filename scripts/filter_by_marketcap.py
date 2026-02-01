#!/usr/bin/env python3
"""
Filter tickers by market cap, keeping only:
- Stocks with market cap >= $5B
- ETFs (regardless of market cap)

Deletes parquet files for tickers that don't meet criteria.
"""

import logging
import sys
import time
from pathlib import Path

# Suppress yfinance logging
logging.getLogger("yfinance").setLevel(logging.CRITICAL)
logging.getLogger("urllib3").setLevel(logging.CRITICAL)
logging.getLogger("peewee").setLevel(logging.CRITICAL)

try:
    import yfinance as yf
except ImportError:
    print("Error: yfinance not installed. Run: pip install yfinance")
    exit(1)

# Configuration
DATA_DIR = Path(__file__).parent.parent / "data" / "ohlcv"
MIN_MARKET_CAP = 5_000_000_000  # $5 billion
BATCH_SIZE = 50  # Process in batches to avoid rate limiting
BATCH_DELAY = 1  # Seconds between batches


def log(msg):
    """Print with immediate flush."""
    print(msg, flush=True)


def get_all_tickers():
    """Get list of all tickers from parquet files."""
    parquet_files = list(DATA_DIR.glob("*.parquet"))
    return [(f.stem, f) for f in parquet_files]


def check_ticker(ticker: str) -> tuple[bool, str]:
    """
    Check if ticker should be kept.
    Returns (should_keep, reason).
    """
    try:
        # Suppress stdout/stderr from yfinance
        import io
        import contextlib

        with contextlib.redirect_stderr(io.StringIO()):
            info = yf.Ticker(ticker).info

        quote_type = info.get("quoteType", "")
        market_cap = info.get("marketCap")

        if quote_type == "ETF":
            return True, "ETF"
        elif market_cap and market_cap >= MIN_MARKET_CAP:
            cap_billions = market_cap / 1_000_000_000
            return True, f"${cap_billions:.1f}B"
        elif market_cap:
            cap_billions = market_cap / 1_000_000_000
            return False, f"${cap_billions:.1f}B (< $5B)"
        else:
            return False, "Not found"
    except Exception as e:
        return False, f"Error: {str(e)[:30]}"


def main():
    if not DATA_DIR.exists():
        log(f"Error: Data directory not found: {DATA_DIR}")
        exit(1)

    tickers = get_all_tickers()
    total = len(tickers)
    log(f"Found {total} tickers in {DATA_DIR}")
    log(f"Filtering for market cap >= ${MIN_MARKET_CAP / 1_000_000_000:.0f}B or ETFs\n")

    kept = []
    deleted = []

    for i, (ticker, filepath) in enumerate(tickers):
        should_keep, reason = check_ticker(ticker)

        status = "KEEP" if should_keep else "DEL "
        log(f"[{i+1:4d}/{total}] {ticker:8s} {status} ({reason})")

        if should_keep:
            kept.append((ticker, reason))
        else:
            deleted.append((ticker, reason))
            filepath.unlink()  # Delete the file

        # Rate limiting: pause between batches
        if (i + 1) % BATCH_SIZE == 0 and i + 1 < total:
            log(f"  ... pausing {BATCH_DELAY}s ...")
            time.sleep(BATCH_DELAY)

    # Summary
    log("\n" + "=" * 60)
    log("SUMMARY")
    log("=" * 60)
    log(f"Total tickers processed: {total}")
    log(f"Kept: {len(kept)}")
    log(f"Deleted: {len(deleted)}")

    log(f"\n--- Kept tickers ({len(kept)}) ---")
    for ticker, reason in sorted(kept):
        log(f"  {ticker}: {reason}")


if __name__ == "__main__":
    main()
