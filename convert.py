#!/usr/bin/env python3
"""Split combined stock data into individual ticker parquet files."""

import os
import shutil
from pathlib import Path

try:
    import polars as pl
except ImportError:
    os.system("pip install polars")
    import polars as pl

data_dir = Path("./data/ohlcv")
combined_parquet = data_dir / "all_stock_data.parquet"
combined_csv = data_dir / "all_stock_data.csv"

# Prefer parquet if it exists (faster to read)
if combined_parquet.exists():
    print(f"Reading {combined_parquet} (~962MB, this may take a moment)...")
    df = pl.read_parquet(combined_parquet)
elif combined_csv.exists():
    print(f"Reading {combined_csv} (~3.5GB, this may take a few minutes)...")
    df = pl.read_csv(combined_csv)
else:
    print("Error: No data file found. Expected all_stock_data.parquet or all_stock_data.csv")
    exit(1)

print(f"Loaded {len(df):,} rows")
print(f"Columns: {df.columns}")

# Normalize column names to lowercase
df = df.rename({col: col.lower() for col in df.columns})

# Get unique tickers
tickers = df["ticker"].unique().to_list()
print(f"Found {len(tickers):,} unique tickers")

# Split and save each ticker directly to data_dir
saved = 0
skipped = 0

for i, ticker in enumerate(tickers):
    if not ticker or str(ticker).strip() == "":
        continue

    ticker_df = df.filter(pl.col("ticker") == ticker)

    # Only save tickers with enough history (200+ days)
    if len(ticker_df) < 200:
        skipped += 1
        continue

    # Select and rename columns to match expected format
    ticker_df = ticker_df.select([
        pl.col("date"),
        pl.col("open"),
        pl.col("high"),
        pl.col("low"),
        pl.col("close"),
        pl.col("volume"),
    ]).sort("date")

    # Save as parquet directly to data/ohlcv/
    output_path = data_dir / f"{str(ticker).upper()}.parquet"
    ticker_df.write_parquet(output_path, compression="zstd")
    saved += 1

    if (i + 1) % 500 == 0:
        print(f"Progress: {i + 1}/{len(tickers)} tickers processed ({saved} saved, {skipped} skipped)")

print(f"\nDone! Saved {saved} tickers to {data_dir}")
print(f"Skipped {skipped} tickers with < 200 days of data")

# Move combined files to backup
backup_dir = data_dir / "_combined_backup"
backup_dir.mkdir(exist_ok=True)

if combined_parquet.exists():
    print(f"Moving {combined_parquet.name} to {backup_dir}/")
    shutil.move(combined_parquet, backup_dir / combined_parquet.name)

if combined_csv.exists():
    print(f"Moving {combined_csv.name} to {backup_dir}/")
    shutil.move(combined_csv, backup_dir / combined_csv.name)

print(f"\nReady! Run: cargo run --release")
