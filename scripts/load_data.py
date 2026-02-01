#!/usr/bin/env python3
"""
RETRO - Data Loader
Downloads Kaggle stock data and prepares it for the scanner
"""

import os
import sys
from pathlib import Path

def download_kaggle_data():
    """Download the Kaggle dataset"""
    print("=" * 60)
    print("RETRO Data Loader")
    print("=" * 60)
    
    try:
        import kagglehub
    except ImportError:
        print("Installing kagglehub...")
        os.system("pip install kagglehub")
        import kagglehub
    
    print("\nDownloading Kaggle dataset (this may take a few minutes)...")
    print("Dataset: borismarjanovic/price-volume-data-for-all-us-stocks-etfs")
    
    try:
        path = kagglehub.dataset_download("borismarjanovic/price-volume-data-for-all-us-stocks-etfs")
        print(f"\n✓ Downloaded to: {path}")
        return path
    except Exception as e:
        print(f"\n✗ Download failed: {e}")
        print("\nAlternative: Download manually from:")
        print("https://www.kaggle.com/datasets/borismarjanovic/price-volume-data-for-all-us-stocks-etfs")
        print("\nThen extract to ./data/ohlcv/")
        return None


def convert_to_parquet(source_dir: str, output_dir: str):
    """Convert CSVs to Parquet for faster loading"""
    try:
        import polars as pl
    except ImportError:
        print("Installing polars...")
        os.system("pip install polars")
        import polars as pl
    
    source_path = Path(source_dir)
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    
    # Find CSV files
    csv_files = list(source_path.rglob("*.txt")) + list(source_path.rglob("*.csv"))
    print(f"\nFound {len(csv_files)} files to convert")
    
    converted = 0
    failed = 0
    
    for i, csv_file in enumerate(csv_files):
        ticker = csv_file.stem.split('.')[0].upper()
        
        try:
            # Read CSV
            df = pl.read_csv(csv_file, try_parse_dates=True)
            
            # Normalize column names
            df = df.rename({col: col.lower() for col in df.columns})
            
            # Ensure we have required columns
            required = ['date', 'open', 'high', 'low', 'close', 'volume']
            if not all(col in df.columns for col in required):
                # Try alternative names
                col_map = {
                    'Date': 'date',
                    'Open': 'open',
                    'High': 'high',
                    'Low': 'low',
                    'Close': 'close',
                    'Volume': 'volume',
                    'Adj Close': 'adj_close',
                }
                for old, new in col_map.items():
                    if old.lower() in df.columns:
                        df = df.rename({old.lower(): new})
            
            # Select and order columns
            df = df.select(['date', 'open', 'high', 'low', 'close', 'volume'])
            
            # Skip if too little data
            if len(df) < 100:
                continue
            
            # Sort by date
            df = df.sort('date')
            
            # Write parquet
            output_file = output_path / f"{ticker}.parquet"
            df.write_parquet(output_file, compression='zstd')
            
            converted += 1
            
            if converted % 500 == 0:
                print(f"Progress: {converted}/{len(csv_files)} converted")
            
        except Exception as e:
            failed += 1
            if failed < 10:
                print(f"  Warning: Failed to convert {ticker}: {e}")
    
    print(f"\n✓ Converted {converted} files ({failed} failed)")
    print(f"Output directory: {output_path}")
    
    # Show total size
    total_size = sum(f.stat().st_size for f in output_path.glob("*.parquet"))
    print(f"Total size: {total_size / 1e6:.1f} MB")


def setup_directory():
    """Create the data directory structure"""
    data_dir = Path("./data/ohlcv")
    data_dir.mkdir(parents=True, exist_ok=True)
    print(f"✓ Created directory: {data_dir}")
    return data_dir


def main():
    print("\nThis script will:")
    print("1. Download stock market data from Kaggle (~1GB)")
    print("2. Convert CSV files to Parquet format (faster loading)")
    print("3. Place files in ./data/ohlcv/")
    print()
    
    response = input("Continue? [Y/n] ").strip().lower()
    if response == 'n':
        print("Aborted.")
        return
    
    # Setup
    output_dir = setup_directory()
    
    # Download
    source_dir = download_kaggle_data()
    
    if source_dir:
        # Find the actual data directory
        source_path = Path(source_dir)
        
        # Look for Stocks and ETFs subdirectories
        stocks_dir = None
        for subdir in ['Stocks', 'stocks', 'Data/Stocks', 'Data/stocks']:
            check_path = source_path / subdir
            if check_path.exists():
                stocks_dir = check_path
                break
        
        if stocks_dir is None:
            stocks_dir = source_path
        
        print(f"\nUsing source directory: {stocks_dir}")
        
        # Convert
        convert_to_parquet(stocks_dir, output_dir)
    
    print("\n" + "=" * 60)
    print("Setup complete!")
    print("=" * 60)
    print("\nNext steps:")
    print("1. Build the scanner: cargo build --release")
    print("2. Run the server:    cargo run --release")
    print("3. Open browser:      http://localhost:3000")
    print()


if __name__ == "__main__":
    main()
