use std::sync::Arc;

use anyhow::Result;
use async_trait::async_trait;
use goose_providers::errors::ProviderError;
use rmcp::model::Tool;

use super::base::{MessageStream, ModelInfo, Provider};
use super::retry::RetryConfig;
use crate::config::GooseMode;
use crate::conversation::message::Message;
use crate::model::ModelConfig;
use crate::permission::PermissionConfirmation;
use crate::providers::base::PermissionRouting;

/// Thin wrapper that overrides `get_model_config()` on an inner provider.
/// Used to inject a probed `context_limit` without mutating the provider.
pub(crate) struct ContextOverrideProvider {
    inner: Arc<dyn Provider>,
    model: ModelConfig,
}

impl ContextOverrideProvider {
    pub fn new(inner: Arc<dyn Provider>, model: ModelConfig) -> Self {
        Self { inner, model }
    }
}

#[async_trait]
impl Provider for ContextOverrideProvider {
    fn get_name(&self) -> &str {
        self.inner.get_name()
    }

    fn get_model_config(&self) -> ModelConfig {
        self.model.clone()
    }

    async fn stream(
        &self,
        model_config: &ModelConfig,
        session_id: &str,
        system: &str,
        messages: &[Message],
        tools: &[Tool],
    ) -> Result<MessageStream, ProviderError> {
        self.inner
            .stream(model_config, session_id, system, messages, tools)
            .await
    }

    fn retry_config(&self) -> RetryConfig {
        self.inner.retry_config()
    }

    async fn fetch_supported_models(&self) -> Result<Vec<String>, ProviderError> {
        self.inner.fetch_supported_models().await
    }

    async fn probe_context_limit(&self) -> Option<usize> {
        self.inner.probe_context_limit().await
    }

    async fn fetch_supported_model_info(&self) -> Result<Vec<ModelInfo>, ProviderError> {
        self.inner.fetch_supported_model_info().await
    }

    async fn fetch_model_info(&self, model_name: &str) -> Result<ModelInfo, ProviderError> {
        self.inner.fetch_model_info(model_name).await
    }

    fn skip_canonical_filtering(&self) -> bool {
        self.inner.skip_canonical_filtering()
    }

    async fn configure_oauth(&self) -> Result<(), ProviderError> {
        self.inner.configure_oauth().await
    }

    async fn refresh_credentials(&self) -> Result<(), ProviderError> {
        self.inner.refresh_credentials().await
    }

    async fn update_mode(&self, session_id: &str, mode: GooseMode) -> Result<(), ProviderError> {
        self.inner.update_mode(session_id, mode).await
    }

    fn permission_routing(&self) -> PermissionRouting {
        self.inner.permission_routing()
    }

    async fn handle_permission_confirmation(
        &self,
        request_id: &str,
        confirmation: &PermissionConfirmation,
    ) -> bool {
        self.inner
            .handle_permission_confirmation(request_id, confirmation)
            .await
    }
}
