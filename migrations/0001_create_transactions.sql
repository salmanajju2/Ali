CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT,
  type TEXT,
  paymentMethod TEXT,
  company TEXT,
  person TEXT,
  location TEXT,
  recordedBy TEXT,
  amount REAL,
  notes TEXT,
  breakdown TEXT,
  bank TEXT,
  slip TEXT
);

CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_recorded_by ON transactions(recordedBy);
