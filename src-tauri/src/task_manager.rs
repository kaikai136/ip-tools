use std::sync::Arc;

use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;

pub struct TaskManager {
    cancel_token: Arc<Mutex<Option<CancellationToken>>>,
}

impl TaskManager {
    pub fn new() -> Self {
        Self {
            cancel_token: Arc::new(Mutex::new(None)),
        }
    }

    pub async fn start_scan(&self) -> Result<CancellationToken, String> {
        let mut token_guard = self.cancel_token.lock().await;

        if token_guard.is_some() {
            return Err("扫描已在进行中".to_string());
        }

        let token = CancellationToken::new();
        *token_guard = Some(token.clone());

        Ok(token)
    }

    pub async fn stop_scan(&self) -> Result<(), String> {
        let mut token_guard = self.cancel_token.lock().await;

        if let Some(token) = token_guard.take() {
            token.cancel();
            Ok(())
        } else {
            Err("当前没有正在执行的扫描任务".to_string())
        }
    }

    pub async fn clear_scan(&self) {
        let mut token_guard = self.cancel_token.lock().await;
        *token_guard = None;
    }
}
