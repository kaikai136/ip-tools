use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("网段格式无效: {0}")]
    InvalidNetworkSegment(String),

    #[error("主机范围无效: {0}")]
    InvalidHostRange(String),

    #[error("端口列表无效: {0}")]
    InvalidPortInput(String),

    #[error("扫描已在进行中")]
    ScanInProgress,

    #[error("缺少网络权限，请以管理员身份运行程序")]
    PermissionDenied,

    #[error("网络错误: {0}")]
    NetworkError(String),

    #[error("扫描已取消")]
    Cancelled,
}

impl AppError {
    pub fn to_user_message(&self) -> String {
        self.to_string()
    }
}
