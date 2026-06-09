-- 2026-06-08 reward catalog and redemption tables
CREATE TABLE IF NOT EXISTS reward_catalog_items (
  id BIGINT NOT NULL AUTO_INCREMENT,
  student_id BIGINT NOT NULL,
  reward_key VARCHAR(100) NOT NULL,
  title VARCHAR(160) NOT NULL,
  cost INT NOT NULL,
  description VARCHAR(500) NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE INDEX reward_catalog_items_student_id_reward_key_key (student_id, reward_key),
  INDEX reward_catalog_items_student_id_idx (student_id),
  CONSTRAINT reward_catalog_items_student_id_fkey FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reward_redemptions (
  id BIGINT NOT NULL AUTO_INCREMENT,
  student_id BIGINT NOT NULL,
  catalog_item_id BIGINT NULL,
  reward_key VARCHAR(100) NOT NULL,
  title VARCHAR(160) NOT NULL,
  cost INT NOT NULL,
  status ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
  requested_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  confirmed_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  INDEX reward_redemptions_student_id_status_requested_at_idx (student_id, status, requested_at),
  INDEX reward_redemptions_catalog_item_id_idx (catalog_item_id),
  CONSTRAINT reward_redemptions_student_id_fkey FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT reward_redemptions_catalog_item_id_fkey FOREIGN KEY (catalog_item_id) REFERENCES reward_catalog_items(id) ON DELETE SET NULL
);
