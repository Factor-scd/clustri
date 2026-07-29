use serde::{Serialize, Serializer};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum Error {
    #[error("Connection not found: {0}")]
    ConnectionNotFound(String),
    
    #[error("Not connected to server")]
    NotConnected,
    
    #[error("HTTP request failed: {0}")]
    HttpError(#[from] reqwest::Error),
    
    #[error("Certificate error: {0}")]
    CertificateError(String),
    
    #[error("Authentication failed: {0}")]
    AuthError(String),
    
    #[error("Keyring error: {0}")]
    KeyringError(String),
    
    #[error("Serialization error: {0}")]
    SerializationError(String),
    
    #[error("Invalid URL: {0}")]
    InvalidUrl(String),
    
    #[error("API error: {0}")]
    ApiError(String),

    #[error("WebSocket error: {0}")]
    WebSocketError(String),

    #[error("Tauri error: {0}")]
    TauriError(#[from] tauri::Error),
}

impl Serialize for Error {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(self.to_string().as_ref())
    }
}
