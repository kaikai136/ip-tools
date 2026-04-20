use std::future::Future;
use std::fs;
use std::io::Cursor;
use std::net::IpAddr;
use std::process::Command;
use std::sync::Arc;

use arboard::{Clipboard, Error as ClipboardError};
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
use image::{DynamicImage, ImageBuffer, ImageFormat, Rgba};
use tauri::{AppHandle, Manager};
use tokio::net::lookup_host;

use crate::error::AppError;
use crate::network_utils::{generate_ip_range, get_local_ip as resolve_local_ip, parse_ports_input};
use crate::ping_engine::PingResult;
use crate::scan_engine::{
    HostScanResult, PortQuickTestResult, PortToolProgress, PortToolScanResult, ScanStats,
};
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

fn spawn_port_tool_scan<F>(
    app_handle: AppHandle,
    task_manager: Arc<TaskManager>,
    scan_future: F,
) where
    F: Future<Output = Result<PortToolScanResult, AppError>> + Send + 'static,
{
    tokio::spawn(async move {
        let result = scan_future.await;

        task_manager.clear_scan().await;

        match result {
            Ok(summary) => {
                let _ = app_handle.emit_all("port-tool-complete", &summary);
            }
            Err(err) => {
                let _ = app_handle.emit_all(
                    "port-tool-error",
                    &serde_json::json!({
                        "error": err.to_user_message()
                    }),
                );
            }
        }
    });
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

#[tauri::command]
pub async fn ping_host_with_timeout(
    host: String,
    timeout_ms: u64,
    state: tauri::State<'_, AppState>,
) -> Result<PingResult, String> {
    let ip = resolve_ping_target(&host)
        .await
        .map_err(|e| e.to_user_message())?;

    Ok(state
        .scan_engine
        .ping_host_with_timeout(ip, timeout_ms)
        .await)
}

#[tauri::command]
pub async fn open_ping_in_terminal(host: String) -> Result<(), String> {
    let ip = resolve_ping_target(&host)
        .await
        .map_err(|e| e.to_user_message())?;
    let ping_target = ip.to_string();

    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "", "cmd", "/K", "ping", ping_target.as_str()])
            .spawn()
            .map_err(|error| format!("打开 CMD Ping 窗口失败: {}", error))?;

        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    {
        Command::new("ping")
            .arg(&ping_target)
            .spawn()
            .map_err(|error| format!("打开 Ping 窗口失败: {}", error))?;

        Ok(())
    }
}

#[tauri::command]
pub async fn start_port_tool_scan(
    host: String,
    ports_input: String,
    timeout_ms: u64,
    concurrency: usize,
    state: tauri::State<'_, AppState>,
    app_handle: AppHandle,
) -> Result<(), String> {
    let cancel_token = state.task_manager.start_scan().await?;
    let ip = resolve_ping_target(&host)
        .await
        .map_err(|e| e.to_user_message())?;
    let ports = parse_ports_input(&ports_input).map_err(|e| e.to_user_message())?;

    let scan_engine = state.scan_engine.clone();
    let task_manager = state.task_manager.clone();
    let event_handle = app_handle.clone();

    let scan_future = async move {
        scan_engine
            .scan_custom_port_range(
                ip,
                ports,
                timeout_ms,
                concurrency,
                cancel_token,
                move |progress: PortToolProgress| {
                    let _ = event_handle.emit_all("port-tool-progress", &progress);
                },
            )
            .await
    };

    spawn_port_tool_scan(app_handle, task_manager, scan_future);

    Ok(())
}

#[tauri::command]
pub async fn quick_port_test(
    host: String,
    port: u16,
    timeout_ms: u64,
    state: tauri::State<'_, AppState>,
) -> Result<PortQuickTestResult, String> {
    let ip = resolve_ping_target(&host)
        .await
        .map_err(|e| e.to_user_message())?;

    state
        .scan_engine
        .test_single_port(ip, port, timeout_ms)
        .await
        .map_err(|e| e.to_user_message())
}

#[tauri::command]
pub fn write_text_file(
    file_path: String,
    content: String,
) -> Result<String, String> {
    fs::write(&file_path, content).map_err(|error| format!("保存失败: {}", error))?;
    Ok(file_path)
}

#[tauri::command]
pub async fn start_screen_clip() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg("ms-screenclip:")
            .spawn()
            .map_err(|error| format!("打开系统截图失败: {}", error))?;

        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("当前系统暂不支持屏幕框选扫码。".to_string())
    }
}

#[tauri::command]
pub fn read_clipboard_image_data_url() -> Result<Option<String>, String> {
    let mut clipboard =
        Clipboard::new().map_err(|error| format!("读取剪贴板失败: {}", error))?;

    let image = match clipboard.get_image() {
        Ok(image) => image,
        Err(ClipboardError::ContentNotAvailable) => return Ok(None),
        Err(error) => return Err(format!("读取剪贴板图片失败: {}", error)),
    };

    let rgba_image = ImageBuffer::<Rgba<u8>, Vec<u8>>::from_raw(
        image.width as u32,
        image.height as u32,
        image.bytes.into_owned(),
    )
    .ok_or_else(|| "剪贴板图片数据无效。".to_string())?;

    let dynamic_image = DynamicImage::ImageRgba8(rgba_image);
    let mut buffer = Cursor::new(Vec::new());

    dynamic_image
        .write_to(&mut buffer, ImageFormat::Png)
        .map_err(|error| format!("编码截图失败: {}", error))?;

    let encoded = BASE64_STANDARD.encode(buffer.into_inner());
    Ok(Some(format!("data:image/png;base64,{}", encoded)))
}
