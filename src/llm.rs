//! LLM bridge for clarifications and code generation.

use crate::generated_store::GeneratedScanSpec;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::env;

const DEFAULT_MODEL: &str = "claude-opus-4-6";
const DEFAULT_VERSION: &str = "2023-06-01";
const DEFAULT_API_URL: &str = "https://api.anthropic.com/v1/messages";
const DEFAULT_INFERENCE_GEO: &str = "us";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClarifyQuestion {
    pub id: String,
    pub label: Option<String>,
    #[serde(rename = "type")]
    pub qtype: String,
    pub options: Option<Vec<String>>,
    pub default: Option<Value>,
    pub min: Option<f64>,
    pub max: Option<f64>,
    pub step: Option<f64>,
    pub placeholder: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClarifyResponse {
    pub title: Option<String>,
    pub message: Option<String>,
    pub questions: Vec<ClarifyQuestion>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompileResponse {
    pub scan: GeneratedScanSpec,
}

pub fn clarify(query: &str) -> anyhow::Result<ClarifyResponse> {
    let prompt = clarify_prompt();
    let user = format!("Query:\n{}", query);
    let raw = anthropic_call(&prompt, &user)?;
    let value = parse_json_from_text(&raw)?;
    let resp: ClarifyResponse = serde_json::from_value(value)?;
    Ok(resp)
}

pub fn compile(query: &str, answers: &HashMap<String, Value>) -> anyhow::Result<GeneratedScanSpec> {
    let prompt = compile_prompt();
    let answers_json = if answers.is_empty() {
        "none".to_string()
    } else {
        serde_json::to_string_pretty(answers)?
    };
    let user = format!("Query:\n{}\n\nAnswers (JSON):\n{}", query, answers_json);
    let raw = anthropic_call(&prompt, &user)?;
    let value = parse_json_from_text(&raw)?;
    let resp: CompileResponse = serde_json::from_value(value)?;
    Ok(resp.scan)
}

fn anthropic_call(system: &str, user: &str) -> anyhow::Result<String> {
    let api_key = env::var("ANTHROPIC_API_KEY")
        .map_err(|_| anyhow::anyhow!("ANTHROPIC_API_KEY is not set"))?;
    let model = env::var("ANTHROPIC_MODEL").unwrap_or_else(|_| DEFAULT_MODEL.to_string());
    let version = env::var("ANTHROPIC_VERSION").unwrap_or_else(|_| DEFAULT_VERSION.to_string());
    let url = env::var("ANTHROPIC_API_URL").unwrap_or_else(|_| DEFAULT_API_URL.to_string());

    let inference_geo = env::var("ANTHROPIC_INFERENCE_GEO")
        .unwrap_or_else(|_| DEFAULT_INFERENCE_GEO.to_string());

    let client = reqwest::blocking::Client::new();
    let payload = serde_json::json!({
        "model": model,
        "max_tokens": 4000,
        "temperature": 0.2,
        "inference_geo": inference_geo,
        "system": system,
        "messages": [
            {"role": "user", "content": user}
        ]
    });

    let response = client
        .post(url)
        .header("x-api-key", api_key)
        .header("anthropic-version", version)
        .header("content-type", "application/json")
        .json(&payload)
        .send()?;

    let status = response.status();
    let text = response.text()?;
    if !status.is_success() {
        return Err(anyhow::anyhow!("Anthropic API error ({}): {}", status, text));
    }

    let value: Value = serde_json::from_str(&text)?;
    extract_text_from_response(&value)
}

fn extract_text_from_response(value: &Value) -> anyhow::Result<String> {
    let content = value
        .get("content")
        .and_then(|v| v.as_array())
        .ok_or_else(|| anyhow::anyhow!("Unexpected Anthropic response: missing content array"))?;

    let mut out = String::new();
    for block in content {
        if block.get("type").and_then(|v| v.as_str()) == Some("text") {
            if let Some(text) = block.get("text").and_then(|v| v.as_str()) {
                out.push_str(text);
            }
        }
    }

    if out.trim().is_empty() {
        return Err(anyhow::anyhow!("Anthropic response contained no text blocks"));
    }

    Ok(out)
}

fn parse_json_from_text(text: &str) -> anyhow::Result<Value> {
    if let Ok(value) = serde_json::from_str(text.trim()) {
        return Ok(value);
    }

    let start = text.find('{').ok_or_else(|| anyhow::anyhow!("No JSON object found"))?;
    let end = text.rfind('}').ok_or_else(|| anyhow::anyhow!("No JSON object found"))?;
    if start >= end {
        return Err(anyhow::anyhow!("Invalid JSON bounds"));
    }

    let slice = &text[start..=end];
    let value: Value = serde_json::from_str(slice)?;
    Ok(value)
}

fn clarify_prompt() -> String {
    let mut prompt = String::new();
    prompt.push_str("You are a trading scan assistant. Convert a natural language query into clarifying questions.\n");
    prompt.push_str("Return ONLY JSON with the schema:\n");
    prompt.push_str("{\"title\": string, \"message\": string, \"questions\": [{\"id\": string, \"label\": string, \"type\": \"number|text|select\", \"options\"?: [string], \"default\"?: number|string, \"min\"?: number, \"max\"?: number, \"step\"?: number, \"placeholder\"?: string}]}\n");
    prompt.push_str("Rules:\n");
    prompt.push_str("- Ask only questions needed to fully specify the scan.\n");
    prompt.push_str("- Keep 0-6 questions.\n");
    prompt.push_str("- Use ids that can be used as param names in Rust.\n");
    prompt.push_str("- If no questions, return an empty questions array and still provide title/message.\n");
    prompt
}

fn compile_prompt() -> String {
    let mut prompt = String::new();
    prompt.push_str("You are a Rust scan code generator for a stock scanner.\n");
    prompt.push_str("Output ONLY JSON with schema:\n");
    prompt.push_str("{\"scan\": {\"id\": string, \"name\": string, \"description\": string, \"params\": [{\"name\": string, \"param_type\": \"number|text|select\", \"default\": any, \"description\": string}], \"function_body\": string, \"helpers\"?: string}}\n");
    prompt.push_str("The function_body must be valid Rust inside:\n");
    prompt.push_str("fn scan_<id>(data: &TickerData, params: &HashMap<String, Value>) -> Vec<bool> { ... }\n");
    prompt.push_str("Constraints:\n");
    prompt.push_str("- data has fields: date (YYYY-MM-DD), open, high, low, close, volume as Vec<f64>.\n");
    prompt.push_str("- Return Vec<bool> with length data.close.len().\n");
    prompt.push_str("- Use params by reading from the HashMap. Provide defaults if missing.\n");
    prompt.push_str("- Use functions from crate::indicators (sma, ema, rsi, obv, macd, macd_signal, macd_histogram, atr, bollinger, rolling_max, rolling_min, stddev, vwap, crossed_above, crossed_below, higher_high, lower_low, pct_change, volume_ratio, above, below, and, or).\n");
    prompt.push_str("- Avoid unsafe.\n");
    prompt.push_str("- helpers is optional extra Rust code; if used, prefix helper function names with scan_<id>_.\n");
    prompt
}
