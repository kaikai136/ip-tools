use std::net::IpAddr;
use std::sync::OnceLock;
use std::time::Duration;

use serde::Serialize;
use surge_ping::{Client, Config, PingIdentifier, PingSequence};

use crate::error::AppError;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum PingStatus {
    Online,
    Timeout,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PingResult {
    pub ip: String,
    pub status: PingStatus,
    pub response_time: Option<u64>,
}

pub struct PingEngine {
    client: OnceLock<Result<Client, ()>>,
    timeout: Duration,
}

impl PingEngine {
    pub fn new(timeout_ms: u64, _max_concurrent: usize) -> Self {
        Self {
            client: OnceLock::new(),
            timeout: Duration::from_millis(timeout_ms),
        }
    }

    fn get_client(&self) -> Result<&Client, AppError> {
        self.client
            .get_or_init(|| Client::new(&Config::default()).map_err(|_| ()))
            .as_ref()
            .map_err(|_| AppError::PermissionDenied)
    }

    fn timeout_result(ip: IpAddr) -> PingResult {
        PingResult {
            ip: ip.to_string(),
            status: PingStatus::Timeout,
            response_time: None,
        }
    }

    pub async fn ping_ip(&self, ip: IpAddr) -> PingResult {
        self.ping_ip_with_timeout(ip, self.timeout).await
    }

    pub async fn ping_ip_with_timeout(&self, ip: IpAddr, timeout: Duration) -> PingResult {
        let client = match self.get_client() {
            Ok(client) => client,
            Err(_) => return Self::timeout_result(ip),
        };

        let payload = [0; 8];
        let mut pinger = client.pinger(ip, PingIdentifier(rand::random())).await;
        pinger.timeout(timeout);

        match pinger.ping(PingSequence(0), &payload).await {
            Ok((_, duration)) => PingResult {
                ip: ip.to_string(),
                status: PingStatus::Online,
                response_time: Some(duration.as_millis() as u64),
            },
            Err(_) => Self::timeout_result(ip),
        }
    }
}

mod rand {
    pub fn random() -> u16 {
        use std::time::{SystemTime, UNIX_EPOCH};

        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .subsec_nanos();

        (nanos % 65536) as u16
    }
}
