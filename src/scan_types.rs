//! Shared scan type metadata

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct ScanType {
    pub id: String,
    pub name: String,
    pub description: String,
    pub params: Vec<ScanParam>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ScanParam {
    pub name: String,
    pub param_type: String,
    pub default: serde_json::Value,
    pub description: String,
}
