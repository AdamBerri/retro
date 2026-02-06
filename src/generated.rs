//! Auto-generated scans (edit via generator only)

use crate::data::TickerData;
use crate::indicators::*;
use crate::scan_types::{ScanParam, ScanType};
use serde_json::Value;
use std::collections::HashMap;

pub type ScanFn = fn(&TickerData, &HashMap<String, Value>) -> Vec<bool>;

/// List generated scan types for the UI.
pub fn list_scan_types() -> Vec<ScanType> {
    Vec::new()
}

/// Get a generated scan by id.
pub fn get_scan(_id: &str) -> Option<ScanFn> {
    None
}
