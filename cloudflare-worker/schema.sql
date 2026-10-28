-- JY's ASMR · 用户数据表
-- 一个用户一行，data 字段存 JSON

CREATE TABLE IF NOT EXISTS users (
    user_id    TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_updated ON users(updated_at);
