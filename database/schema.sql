-- ============================================================================
-- FLIPPY — Database schema
-- Standard MySQL 5.7+/8.0 SQL. No provider-specific extensions, no stored
-- procedures tied to a vendor, no non-standard engines.
-- Run once against a fresh database on ANY MySQL host (Vercel-hosted MySQL,
-- Hostinger, PlanetScale, local MySQL, etc). To migrate: export this schema
-- + a `mysqldump` of the data, import both into the new host. No changes
-- to this file are needed when you switch hosts — only the connection
-- credentials in .env change (see database/README.md).
-- ============================================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(32) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,   -- "salt_hex$hash_hex" (PBKDF2-SHA256, see api/_lib/security.py)
  avatar_url TEXT NULL,
  theme VARCHAR(10) NOT NULL DEFAULT 'light',
  accent_color VARCHAR(7) NOT NULL DEFAULT '#3B6FE0',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS decks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  title VARCHAR(100) NOT NULL,
  description TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_decks_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cards (
  id INT AUTO_INCREMENT PRIMARY KEY,
  deck_id INT NOT NULL,
  front TEXT NOT NULL,
  back TEXT NOT NULL,
  times_correct INT NOT NULL DEFAULT 0,
  times_wrong INT NOT NULL DEFAULT 0,
  last_reviewed TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cards_deck FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS goals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  week_start DATE NOT NULL,
  label VARCHAR(150) NOT NULL,
  target INT NOT NULL DEFAULT 1,
  progress INT NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT fk_goals_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS study_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  study_date DATE NOT NULL,
  CONSTRAINT fk_studylog_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_user_date (user_id, study_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS otp_codes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  code_hash VARCHAR(255) NOT NULL,      -- OTP is hashed at rest, never stored plaintext
  expires_at TIMESTAMP NOT NULL,
  used BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_otp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_decks_user ON decks(user_id);
CREATE INDEX idx_cards_deck ON cards(deck_id);
CREATE INDEX idx_goals_user_week ON goals(user_id, week_start);
CREATE INDEX idx_studylog_user ON study_log(user_id);
