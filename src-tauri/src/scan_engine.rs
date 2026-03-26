use std::net::{IpAddr, SocketAddr};
use std::sync::Arc;
use std::time::{Duration, Instant};

use futures::stream::{FuturesUnordered, StreamExt};
use serde::Serialize;
use tokio::net::TcpStream;
use tokio_util::sync::CancellationToken;

use crate::error::AppError;
use crate::ping_engine::{PingEngine, PingResult, PingStatus};

#[derive(Debug, Clone, Copy)]
enum ScanMode {
    IpOnly,
    PortOnly,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum HostStatus {
    Online,
    Offline,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostScanResult {
    pub ip: String,
    pub status: HostStatus,
    pub response_time: Option<u64>,
    pub open_ports: Vec<u16>,
    pub scanned_ports: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanStats {
    pub total_hosts: usize,
    pub active_hosts: usize,
    pub open_port_count: usize,
    pub duration: u64,
}

pub struct ScanEngine {
    ping_engine: Arc<PingEngine>,
    host_concurrency: usize,
    port_concurrency: usize,
    port_timeout: Duration,
}

impl ScanEngine {
    pub fn new(
        ping_timeout_ms: u64,
        host_concurrency: usize,
        port_timeout_ms: u64,
        port_concurrency: usize,
    ) -> Self {
        Self {
            ping_engine: Arc::new(PingEngine::new(ping_timeout_ms, host_concurrency)),
            host_concurrency: host_concurrency.max(1),
            port_concurrency: port_concurrency.max(1),
            port_timeout: Duration::from_millis(port_timeout_ms),
        }
    }

    pub async fn scan_ip_range<F>(
        &self,
        ips: Vec<IpAddr>,
        cancel_token: CancellationToken,
        on_result: F,
    ) -> Result<ScanStats, AppError>
    where
        F: Fn(HostScanResult) + Send + Sync + 'static,
    {
        self.scan_range(ScanMode::IpOnly, ips, Vec::new(), cancel_token, on_result)
            .await
    }

    pub async fn scan_port_range<F>(
        &self,
        ips: Vec<IpAddr>,
        ports: Vec<u16>,
        cancel_token: CancellationToken,
        on_result: F,
    ) -> Result<ScanStats, AppError>
    where
        F: Fn(HostScanResult) + Send + Sync + 'static,
    {
        self.scan_range(ScanMode::PortOnly, ips, ports, cancel_token, on_result)
            .await
    }

    pub async fn ping_host(&self, ip: IpAddr) -> PingResult {
        self.ping_engine.ping_ip(ip).await
    }

    async fn scan_range<F>(
        &self,
        mode: ScanMode,
        ips: Vec<IpAddr>,
        ports: Vec<u16>,
        cancel_token: CancellationToken,
        on_result: F,
    ) -> Result<ScanStats, AppError>
    where
        F: Fn(HostScanResult) + Send + Sync + 'static,
    {
        let started_at = Instant::now();
        let on_result = Arc::new(on_result);
        let ports = if matches!(mode, ScanMode::PortOnly) {
            Some(Arc::new(ports))
        } else {
            None
        };

        let mut total_hosts = 0;
        let mut active_hosts = 0;
        let mut open_port_count = 0;
        let mut pending_ips = ips.into_iter();
        let mut in_flight = FuturesUnordered::new();

        for _ in 0..self.host_concurrency {
            let Some(ip) = pending_ips.next() else {
                break;
            };

            in_flight.push(Self::scan_host(
                mode,
                ip,
                self.ping_engine.clone(),
                ports.clone(),
                self.port_timeout,
                self.port_concurrency,
                cancel_token.clone(),
            ));
        }

        while let Some(result) = in_flight.next().await {
            if let Some(host_result) = result? {
                total_hosts += 1;
                if matches!(host_result.status, HostStatus::Online) {
                    active_hosts += 1;
                }
                open_port_count += host_result.open_ports.len();
                on_result(host_result);
            }

            if cancel_token.is_cancelled() {
                continue;
            }

            if let Some(ip) = pending_ips.next() {
                in_flight.push(Self::scan_host(
                    mode,
                    ip,
                    self.ping_engine.clone(),
                    ports.clone(),
                    self.port_timeout,
                    self.port_concurrency,
                    cancel_token.clone(),
                ));
            }
        }

        Ok(ScanStats {
            total_hosts,
            active_hosts,
            open_port_count,
            duration: started_at.elapsed().as_millis() as u64,
        })
    }

    async fn scan_host(
        mode: ScanMode,
        ip: IpAddr,
        ping_engine: Arc<PingEngine>,
        ports: Option<Arc<Vec<u16>>>,
        port_timeout: Duration,
        port_concurrency: usize,
        cancel_token: CancellationToken,
    ) -> Result<Option<HostScanResult>, AppError> {
        if cancel_token.is_cancelled() {
            return Ok(None);
        }

        let ping_result = if matches!(mode, ScanMode::IpOnly) {
            Some(ping_engine.ping_ip(ip).await)
        } else {
            None
        };

        let open_ports = if let Some(ref ports) = ports {
            Self::scan_ports(
                ip,
                ports.clone(),
                port_timeout,
                port_concurrency,
                cancel_token.clone(),
            )
            .await?
        } else {
            Vec::new()
        };

        if cancel_token.is_cancelled() {
            return Ok(None);
        }

        let reachable_by_ping = ping_result
            .as_ref()
            .map(|result| matches!(result.status, PingStatus::Online))
            .unwrap_or(false);

        let response_time = ping_result.and_then(|result| {
            if matches!(result.status, PingStatus::Online) {
                result.response_time
            } else {
                None
            }
        });

        let status = match mode {
            ScanMode::IpOnly => {
                if reachable_by_ping {
                    HostStatus::Online
                } else {
                    HostStatus::Offline
                }
            }
            ScanMode::PortOnly => {
                if open_ports.is_empty() {
                    HostStatus::Offline
                } else {
                    HostStatus::Online
                }
            }
        };

        Ok(Some(HostScanResult {
            ip: ip.to_string(),
            status,
            response_time,
            scanned_ports: ports.as_ref().map_or(0, |items| items.len()),
            open_ports,
        }))
    }

    async fn scan_ports(
        ip: IpAddr,
        ports: Arc<Vec<u16>>,
        port_timeout: Duration,
        port_concurrency: usize,
        cancel_token: CancellationToken,
    ) -> Result<Vec<u16>, AppError> {
        if ports.is_empty() {
            return Ok(Vec::new());
        }

        let mut open_ports = Vec::new();
        let mut pending_ports = ports.iter().copied();
        let mut in_flight = FuturesUnordered::new();

        for _ in 0..port_concurrency {
            let Some(port) = pending_ports.next() else {
                break;
            };

            in_flight.push(Self::scan_single_port_future(
                ip,
                port,
                port_timeout,
                cancel_token.clone(),
            ));
        }

        while let Some(result) = in_flight.next().await {
            if let Some(port) = result? {
                open_ports.push(port);
            }

            if cancel_token.is_cancelled() {
                continue;
            }

            if let Some(port) = pending_ports.next() {
                in_flight.push(Self::scan_single_port_future(
                    ip,
                    port,
                    port_timeout,
                    cancel_token.clone(),
                ));
            }
        }

        open_ports.sort_unstable();
        Ok(open_ports)
    }

    async fn scan_single_port_future(
        ip: IpAddr,
        port: u16,
        timeout: Duration,
        cancel_token: CancellationToken,
    ) -> Result<Option<u16>, AppError> {
        if cancel_token.is_cancelled() {
            return Ok(None);
        }

        let socket = SocketAddr::new(ip, port);
        let is_open = Self::scan_single_port(socket, timeout, cancel_token).await?;

        if is_open {
            Ok(Some(port))
        } else {
            Ok(None)
        }
    }

    async fn scan_single_port(
        socket: SocketAddr,
        timeout: Duration,
        cancel_token: CancellationToken,
    ) -> Result<bool, AppError> {
        tokio::select! {
            _ = cancel_token.cancelled() => Ok(false),
            result = tokio::time::timeout(timeout, TcpStream::connect(socket)) => {
                match result {
                    Ok(Ok(stream)) => {
                        drop(stream);
                        Ok(true)
                    }
                    Ok(Err(_)) | Err(_) => Ok(false),
                }
            }
        }
    }
}
