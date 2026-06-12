use anyhow::Result;
use serde::Deserialize;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Deserialize, Clone)]
pub struct BridgeMessage {
    pub id: u64,
    pub ts: String,
    pub sender: String,
    pub subject: String,
    pub body: String,
    pub reply_to: Option<u64>,
    pub to: Option<Vec<String>>,
}

/// Reads unread bridge messages from `~/.agent-bridge/messages.jsonl`,
/// using `<recipient>.cursor` to track the last-seen message ID.
pub struct BridgeReader {
    dir: PathBuf,
    recipient: String,
}

impl BridgeReader {
    pub fn new(recipient: impl Into<String>) -> Self {
        let dir = std::env::var("AGENT_BRIDGE_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|_| {
                dirs::home_dir()
                    .unwrap_or_else(|| PathBuf::from("/tmp"))
                    .join(".agent-bridge")
            });
        Self {
            dir,
            recipient: recipient.into(),
        }
    }

    fn cursor_path(&self) -> PathBuf {
        self.dir.join(format!("{}.cursor", self.recipient))
    }

    fn log_path(&self) -> PathBuf {
        self.dir.join("messages.jsonl")
    }

    fn read_cursor(&self) -> u64 {
        fs::read_to_string(self.cursor_path())
            .ok()
            .and_then(|s| s.split_whitespace().next()?.parse().ok())
            .unwrap_or(0)
    }

    fn write_cursor(&self, id: u64) {
        let _ = fs::write(self.cursor_path(), format!("{}\n", id));
    }

    fn is_addressed_to_me(&self, msg: &BridgeMessage) -> bool {
        match &msg.to {
            None => true,
            Some(recipients) => recipients
                .iter()
                .any(|r| r == "all" || r == &self.recipient),
        }
    }

    /// Return messages since last cursor that are addressed to this recipient.
    /// Advances the cursor to the highest visible message ID.
    /// On first run (no cursor file), initializes the cursor to the current
    /// max message ID so pre-existing bridge history is not replayed.
    pub fn fetch_unread(&self) -> Result<Vec<BridgeMessage>> {
        let log_content = match fs::read_to_string(self.log_path()) {
            Ok(c) => c,
            Err(_) => return Ok(vec![]),
        };

        let cursor_exists = self.cursor_path().exists();
        let cursor = if cursor_exists {
            self.read_cursor()
        } else {
            // No cursor: skip history by setting cursor to current max.
            let max_id = log_content
                .lines()
                .filter_map(|line| serde_json::from_str::<BridgeMessage>(line).ok())
                .map(|msg| msg.id)
                .max()
                .unwrap_or(0);
            self.write_cursor(max_id);
            return Ok(vec![]);
        };

        let unread: Vec<BridgeMessage> = log_content
            .lines()
            .filter_map(|line| serde_json::from_str::<BridgeMessage>(line).ok())
            .filter(|msg| {
                msg.id > cursor && msg.sender != self.recipient && self.is_addressed_to_me(msg)
            })
            .collect();

        // Mirror `bridge recv`: advance cursor to highest ID visible to this recipient
        // (own messages + addressed messages). Do not skip past messages for others.
        let new_cursor = log_content
            .lines()
            .filter_map(|line| serde_json::from_str::<BridgeMessage>(line).ok())
            .filter(|msg| msg.sender == self.recipient || self.is_addressed_to_me(msg))
            .map(|msg| msg.id)
            .max();

        if let Some(id) = new_cursor {
            self.write_cursor(id);
        }

        Ok(unread)
    }
}

/// Format unread messages for injection into agent context (MOIM or standalone).
pub fn format_for_injection(messages: &[BridgeMessage]) -> Option<String> {
    if messages.is_empty() {
        return None;
    }
    let parts: Vec<String> = messages
        .iter()
        .map(|m| {
            let reply_info = m
                .reply_to
                .map(|id| format!(" (reply to #{})", id))
                .unwrap_or_default();
            format!(
                "[bridge #{}{}] from {} at {}: {}\n{}",
                m.id, reply_info, m.sender, m.ts, m.subject, m.body
            )
        })
        .collect();
    Some(parts.join("\n\n"))
}
