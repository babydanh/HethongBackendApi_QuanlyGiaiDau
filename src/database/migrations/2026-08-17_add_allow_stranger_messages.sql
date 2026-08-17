-- Quyền riêng tư nhắn tin: cho phép người lạ nhắn tin (mặc định true = cho phép).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS allow_stranger_messages boolean NOT NULL DEFAULT true;
