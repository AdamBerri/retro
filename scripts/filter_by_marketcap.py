#!/usr/bin/env python3
"""
Filter tickers by market cap, keeping only:
- Stocks with market cap >= $5B
- ETFs (regardless of market cap)

Deletes parquet files for tickers that don't meet criteria.
"""

import time
from pathlib import Path

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
            return False, "No market cap data"
    except Exception as e:
        return False, f"Error: {str(e)[:50]}"


def main():
    if not DATA_DIR.exists():
        print(f"Error: Data directory not found: {DATA_DIR}")
        exit(1)

    tickers = get_all_tickers()
    total = len(tickers)
    print(f"Found {total} tickers in {DATA_DIR}")
    print(f"Filtering for market cap >= ${MIN_MARKET_CAP / 1_000_000_000:.0f}B or ETFs\n")

    kept = []
    deleted = []

    for i, (ticker, filepath) in enumerate(tickers):
        should_keep, reason = check_ticker(ticker)

        status = "KEEP" if should_keep else "DELETE"
        print(f"[{i+1}/{total}] {ticker}: {status} ({reason})")

        if should_keep:
            kept.append((ticker, reason))
        else:
            deleted.append((ticker, reason))
            filepath.unlink()  # Delete the file

        # Rate limiting: pause between batches
        if (i + 1) % BATCH_SIZE == 0 and i + 1 < total:
            print(f"  ... pausing {BATCH_DELAY}s to avoid rate limiting ...")
            time.sleep(BATCH_DELAY)

    # Summary
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"Total tickers processed: {total}")
    print(f"Kept: {len(kept)}")
    print(f"Deleted: {len(deleted)}")

    print(f"\n--- Kept tickers ({len(kept)}) ---")
    for ticker, reason in sorted(kept):
        print(f"  {ticker}: {reason}")

    if deleted:
        print(f"\n--- Deleted tickers ({len(deleted)}) ---")
        for ticker, reason in sorted(deleted):
            print(f"  {ticker}: {reason}")


if __name__ == "__main__":
    main()
