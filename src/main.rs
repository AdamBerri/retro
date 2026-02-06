mod indicators;
mod scanner;
mod server;
mod data;
mod generated;
mod generated_store;
mod scan_types;
mod llm;

use tracing_subscriber;

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();

    // Initialize logging
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .init();

    tracing::info!("🚀 RETRO Scanner starting...");

    // Start the server
    server::run().await;
}
