-- 2026-06-11 import batch tracking for question imports
CREATE TABLE IF NOT EXISTS import_batches (
  id BIGINT NOT NULL AUTO_INCREMENT,
  owner_id BIGINT NOT NULL,
  title VARCHAR(255) NOT NULL,
  source_type VARCHAR(60) NULL,
  source_name VARCHAR(255) NULL,
  status ENUM('DRAFT','IMPORTING','COMPLETED','FAILED') NOT NULL DEFAULT 'DRAFT',
  stats JSON NULL,
  notes TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  completed_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  INDEX import_batches_owner_id_created_at_idx (owner_id, created_at),
  INDEX import_batches_owner_id_status_idx (owner_id, status),
  CONSTRAINT import_batches_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES users(id)
);

SET @has_import_batch_column := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'question_groups'
    AND COLUMN_NAME = 'import_batch_id'
);
SET @add_import_batch_column_sql := IF(
  @has_import_batch_column = 0,
  'ALTER TABLE question_groups ADD COLUMN import_batch_id BIGINT NULL AFTER knowledge_point_id',
  'SELECT 1'
);
PREPARE add_import_batch_column_stmt FROM @add_import_batch_column_sql;
EXECUTE add_import_batch_column_stmt;
DEALLOCATE PREPARE add_import_batch_column_stmt;

SET @has_import_batch_index := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'question_groups'
    AND INDEX_NAME = 'question_groups_import_batch_id_idx'
);
SET @add_import_batch_index_sql := IF(
  @has_import_batch_index = 0,
  'ALTER TABLE question_groups ADD INDEX question_groups_import_batch_id_idx (import_batch_id)',
  'SELECT 1'
);
PREPARE add_import_batch_index_stmt FROM @add_import_batch_index_sql;
EXECUTE add_import_batch_index_stmt;
DEALLOCATE PREPARE add_import_batch_index_stmt;

SET @has_import_batch_fk := (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND CONSTRAINT_NAME = 'question_groups_import_batch_id_fkey'
);
SET @add_import_batch_fk_sql := IF(
  @has_import_batch_fk = 0,
  'ALTER TABLE question_groups ADD CONSTRAINT question_groups_import_batch_id_fkey FOREIGN KEY (import_batch_id) REFERENCES import_batches(id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE add_import_batch_fk_stmt FROM @add_import_batch_fk_sql;
EXECUTE add_import_batch_fk_stmt;
DEALLOCATE PREPARE add_import_batch_fk_stmt;
