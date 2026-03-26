use std::net::IpAddr;
use std::future::Future;
use std::sync::Arc;

use tauri::{AppHandle, Manager};
use tokio::net::lookup_host;

use crate::error::AppError;
use crate::network_utils::{generate_ip_range, get_local_ip as resolve_local_ip, parse_ports_input};
use crate::ping_engine::PingResult;
use crate::scan_engine::{HostScanResult, ScanStats};
use crate::task_manager::TaskManager;
use crate::AppState;

fn spawn_scan<F>(
    app_handle: AppHandle,
    task_manager: Arc<TaskManager>,
    scan_future: F,
) where
    F: Future<Output = Result<ScanStats, AppError>> + Send + 'static,
{
    tokio::spawn(async move {
        let result = scan_future.await;

        task_manager.clear_scan().await;

        match result {
            Ok(stats) => {
                let _ = app_handle.emit_all("scan-complete", &stats);
            }
            Err(err) => {
                let _ = app_handle.emit_all(
                    "scan-error",
                    &serde_json::json!({
                        "error": err.to_user_message()
                    }),
                );
            }
        }
    });
}

async fn resolve_ping_target(host: &str) -> Result<IpAddr, AppError> {
    let target = host.trim();
    if target.is_empty() {
        return Err(AppError::NetworkError("请输入要 Ping 的主机".to_string()));
    }

    if let Ok(ip) = target.parse::<IpAddr>() {
        return Ok(ip);
    }

    let mut resolved = lookup_host((target, 0))
        .await
        .map_err(|e| AppError::NetworkError(format!("无法解析主机: {}", e)))?;

    resolved
        .next()
        .map(|socket| socket.ip())
        .ok_or_else(|| AppError::NetworkError("无法解析主机".to_string()))
}

#[tauri::command]
pub async fn start_ip_scan(
    network_segment: String,
    host_start: u16,
    host_end: u16,
    state: tauri::State<'_, AppState>,
    app_handle: AppHandle,
) -> Result<(), String> {
    let cancel_token = state.task_manager.start_scan().await?;
    let ips = generate_ip_range(&network_segment, host_start, host_end)
        .map_err(|e| e.to_user_message())?;

    let scan_engine = state.scan_engine.clone();
    let task_manager = state.task_manager.clone();
    let event_handle = app_handle.clone();

    let scan_future = async move {
        let progress_handle = event_handle.clone();

        scan_engine
            .scan_ip_range(ips, cancel_token, move |scan_result: HostScanResult| {
                let _ = progress_handle.emit_all("host-scan-result", &scan_result);
            })
            .await
    };

    spawn_scan(app_handle, task_manager, scan_future);

    Ok(())
}

#[tauri::command]
pub async fn start_port_scan(
    network_segment: String,
    host_start: u16,
    host_end: u16,
    ports_input: String,
    state: tauri::State<'_, AppState>,
    app_handle: AppHandle,
) -> Result<(), String> {
    let cancel_token = state.task_manager.start_scan().await?;
    let ips = generate_ip_range(&network_segment, host_start, host_end)
        .map_err(|e| e.to_user_message())?;
    let ports = parse_ports_input(&ports_input).map_err(|e| e.to_user_message())?;

    let scan_engine = state.scan_engine.clone();
    let task_manager = state.task_manager.clone();
    let event_handle = app_handle.clone();

    let scan_future = async move {
        let progress_handle = event_handle.clone();

        scan_engine
            .scan_port_range(ips, ports, cancel_token, move |scan_result: HostScanResult| {
                let _ = progress_handle.emit_all("host-scan-result", &scan_result);
            })
            .await
    };

    spawn_scan(app_handle, task_manager, scan_future);

    Ok(())
}

#[tauri::command]
pub async fn stop_scan(state: tauri::State<'_, AppState>) -> Result<(), String> {
    state.task_manager.stop_scan().await
}

#[tauri::command]
pub async fn get_local_ip() -> Result<String, String> {
    resolve_local_ip().map_err(|e| e.to_user_message())
}

#[tauri::command]
pub async fn ping_host(
    host: String,
    state: tauri::State<'_, AppState>,
) -> Result<PingResult, String> {
    let ip = resolve_ping_target(&host)
        .await
        .map_err(|e| e.to_user_message())?;

    Ok(state.scan_engine.ping_host(ip).await)
}
