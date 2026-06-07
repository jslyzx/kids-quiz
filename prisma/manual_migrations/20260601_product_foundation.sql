-- 2026-06-01 product foundation fields
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS streak_days INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_practice_date DATETIME(3) NULL,
  ADD COLUMN IF NOT EXISTS reward_badges JSON NULL,
  ADD COLUMN IF NOT EXISTS task_settings JSON NULL;

ALTER TABLE question_groups
  ADD COLUMN IF NOT EXISTS grade_level VARCHAR(30) NULL,
  ADD COLUMN IF NOT EXISTS tags JSON NULL;

ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS grade_level VARCHAR(30) NULL,
  ADD COLUMN IF NOT EXISTS tags JSON NULL;

CREATE TABLE IF NOT EXISTS practice_attempts (
  id BIGINT NOT NULL AUTO_INCREMENT,
  student_id BIGINT NOT NULL,
  paper_id BIGINT NULL,
  source ENUM('PRACTICE','PAPER','TASK','WRONG_RETRY') NOT NULL DEFAULT 'PAPER',
  title VARCHAR(255) NULL,
  total_count INT NOT NULL DEFAULT 0,
  correct_count INT NOT NULL DEFAULT 0,
  wrong_count INT NOT NULL DEFAULT 0,
  score DECIMAL(8,2) NOT NULL DEFAULT 0,
  max_score DECIMAL(8,2) NOT NULL DEFAULT 0,
  accuracy INT NOT NULL DEFAULT 0,
  duration_seconds INT NOT NULL DEFAULT 0,
  reward_stars INT NOT NULL DEFAULT 0,
  submitted_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  INDEX practice_attempts_student_id_submitted_at_idx (student_id, submitted_at),
  INDEX practice_attempts_paper_id_idx (paper_id),
  CONSTRAINT practice_attempts_student_id_fkey FOREIGN KEY (student_id) REFERENCES students(id),
  CONSTRAINT practice_attempts_paper_id_fkey FOREIGN KEY (paper_id) REFERENCES papers(id)
);

ALTER TABLE student_answers
  ADD COLUMN IF NOT EXISTS attempt_id BIGINT NULL,
  ADD INDEX IF NOT EXISTS student_answers_attempt_id_idx (attempt_id);
