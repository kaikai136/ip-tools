#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod error;
mod network_utils;
mod ping_engine;
mod scan_engine;
mod task_manager;

use std::sync::Arc;

use scan_engine::ScanEngine;
use task_manager::TaskManager;

pub struct AppState {
    pub scan_engine: Arc<ScanEngine>,
    pub task_manager: Arc<TaskManager>,
}

const DEFAULT_PING_TIMEOUT_MS: u64 = 700;
const DEFAULT_HOST_CONCURRENCY: usize = 128;
const DEFAULT_PORT_TIMEOUT_MS: u64 = 180;
const DEFAULT_PORT_CONCURRENCY: usize = 512;

fn main() {
    let scan_engine = Arc::new(ScanEngine::new(
        DEFAULT_PING_TIMEOUT_MS,
        DEFAULT_HOST_CONCURRENCY,
        DEFAULT_PORT_TIMEOUT_MS,
        DEFAULT_PORT_CONCURRENCY,
    ));
    let task_manager = Arc::new(TaskManager::new());

    let app_state = AppState {
        scan_engine,
        task_manager,
    };

    tauri::Builder::default()
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            commands::start_ip_scan,
            commands::start_port_scan,
            commands::stop_scan,
            commands::get_local_ip,
            commands::ping_host,
            commands::ping_host_with_timeout,
            commands::start_port_tool_scan,
            commands::quick_port_test,
            commands::write_text_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
