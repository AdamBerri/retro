//! Persistence + codegen for LLM-generated scans

use crate::scan_types::{ScanParam, ScanType};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};

pub const GENERATED_SCANS_PATH: &str = "./data/generated_scans.json";
pub const GENERATED_RS_PATH: &str = "./src/generated.rs";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeneratedParam {
    pub name: String,
    pub param_type: String,
    pub default: Value,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeneratedScanSpec {
    pub id: String,
    pub name: String,
    pub description: String,
    pub params: Vec<GeneratedParam>,
    pub function_body: String,
    pub helpers: Option<String>,
}

pub fn load_specs(path: &Path) -> anyhow::Result<Vec<GeneratedScanSpec>> {
    if !path.exists() {
        return Ok(Vec::new());
    }
    let raw = fs::read_to_string(path)?;
    let specs: Vec<GeneratedScanSpec> = serde_json::from_str(&raw)?;
    Ok(specs)
}

pub fn save_specs(path: &Path, specs: &[GeneratedScanSpec]) -> anyhow::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let raw = serde_json::to_string_pretty(specs)?;
    fs::write(path, raw)?;
    Ok(())
}

pub fn upsert_spec(specs: &mut Vec<GeneratedScanSpec>, mut new_spec: GeneratedScanSpec) {
    new_spec.id = normalize_scan_id(&new_spec.id);

    if let Some(existing) = specs.iter_mut().find(|s| s.id == new_spec.id) {
        *existing = new_spec;
    } else {
        specs.push(new_spec);
    }
}

pub fn write_generated_rs(path: &Path, specs: &[GeneratedScanSpec]) -> anyhow::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }

    let mut output = String::new();
    output.push_str("//! Auto-generated scans (edit via generator only)\n\n");
    output.push_str("use crate::data::TickerData;\n");
    output.push_str("use crate::indicators::*;\n");
    output.push_str("use crate::scan_types::{ScanParam, ScanType};\n");
    output.push_str("use serde_json::Value;\n");
    output.push_str("use std::collections::HashMap;\n\n");
    output.push_str("pub type ScanFn = fn(&TickerData, &HashMap<String, Value>) -> Vec<bool>;\n\n");

    output.push_str("pub fn list_scan_types() -> Vec<ScanType> {\n");
    output.push_str("    vec![\n");
    for spec in specs {
        output.push_str("        ScanType {\n");
        output.push_str(&format!("            id: {:?}.into(),\n", spec.id));
        output.push_str(&format!("            name: {:?}.into(),\n", spec.name));
        output.push_str(&format!("            description: {:?}.into(),\n", spec.description));
        output.push_str("            params: vec![\n");
        for param in &spec.params {
            output.push_str("                ScanParam {\n");
            output.push_str(&format!("                    name: {:?}.into(),\n", param.name));
            output.push_str(&format!("                    param_type: {:?}.into(),\n", param.param_type));
            output.push_str(&format!(
                "                    default: {},\n",
                json_value_expr(&param.default)?
            ));
            output.push_str(&format!(
                "                    description: {:?}.into(),\n",
                param.description
            ));
            output.push_str("                },\n");
        }
        output.push_str("            ],\n");
        output.push_str("        },\n");
    }
    output.push_str("    ]\n");
    output.push_str("}\n\n");

    output.push_str("pub fn get_scan(id: &str) -> Option<ScanFn> {\n");
    output.push_str("    match id {\n");
    for spec in specs {
        let fn_name = function_name_for(&spec.id);
        output.push_str(&format!("        {:?} => Some({}),\n", spec.id, fn_name));
    }
    output.push_str("        _ => None,\n");
    output.push_str("    }\n");
    output.push_str("}\n\n");

    for spec in specs {
        if let Some(helpers) = &spec.helpers {
            output.push_str(helpers);
            if !helpers.ends_with('\n') {
                output.push('\n');
            }
            output.push('\n');
        }

        let fn_name = function_name_for(&spec.id);
        output.push_str(&format!(
            "pub fn {}(data: &TickerData, params: &HashMap<String, Value>) -> Vec<bool> {{\n",
            fn_name
        ));
        output.push_str(&indent_block(&spec.function_body, 4));
        if !spec.function_body.ends_with('\n') {
            output.push('\n');
        }
        output.push_str("}\n\n");
    }

    fs::write(path, output)?;
    Ok(())
}

pub fn normalize_scan_id(id: &str) -> String {
    let mut out = String::new();
    let mut prev_underscore = false;

    for ch in id.to_lowercase().chars() {
        let valid = ch.is_ascii_alphanumeric() || ch == '_';
        if valid {
            out.push(ch);
            prev_underscore = false;
        } else if !prev_underscore {
            out.push('_');
            prev_underscore = true;
        }
    }

    let trimmed = out.trim_matches('_').to_string();
    if trimmed.is_empty() {
        "generated_scan".to_string()
    } else {
        trimmed
    }
}

fn function_name_for(id: &str) -> String {
    format!("scan_{}", normalize_scan_id(id))
}

fn indent_block(body: &str, spaces: usize) -> String {
    let pad = " ".repeat(spaces);
    body.lines()
        .map(|line| format!("{}{}\n", pad, line))
        .collect()
}

fn json_value_expr(value: &Value) -> anyhow::Result<String> {
    let json = serde_json::to_string(value)?;
    let literal = raw_string_literal(&json);
    Ok(format!("serde_json::from_str({}).unwrap()", literal))
}

fn raw_string_literal(s: &str) -> String {
    let mut hashes = 0usize;
    loop {
        let delim = "#".repeat(hashes);
        let end = format!("\"{delim}");
        if !s.contains(&end) {
            return format!("r{delim}\"{s}\"{delim}");
        }
        hashes += 1;
    }
}

pub fn generated_paths() -> (PathBuf, PathBuf) {
    (PathBuf::from(GENERATED_SCANS_PATH), PathBuf::from(GENERATED_RS_PATH))
}

pub fn spec_to_scan_type(spec: &GeneratedScanSpec) -> ScanType {
    ScanType {
        id: spec.id.clone(),
        name: spec.name.clone(),
        description: spec.description.clone(),
        params: spec
            .params
            .iter()
            .map(|p| ScanParam {
                name: p.name.clone(),
                param_type: p.param_type.clone(),
                default: p.default.clone(),
                description: p.description.clone(),
            })
            .collect(),
    }
}
