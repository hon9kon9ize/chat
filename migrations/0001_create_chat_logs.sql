-- Create chat_logs table for storing user interactions
CREATE TABLE IF NOT EXISTS chat_logs (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    ip TEXT,
    agent TEXT NOT NULL,
    user_input TEXT NOT NULL,
    response TEXT NOT NULL,
    reasoning TEXT,
    messages_json TEXT,
    status TEXT NOT NULL DEFAULT 'completed',
    error_message TEXT,
    duration_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_chat_logs_created_at ON chat_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_logs_agent ON chat_logs(agent);
CREATE INDEX IF NOT EXISTS idx_chat_logs_ip ON chat_logs(ip);
