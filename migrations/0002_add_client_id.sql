ALTER TABLE transactions ADD COLUMN clientId TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_client_id ON transactions(clientId);
