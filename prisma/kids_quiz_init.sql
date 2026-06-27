-- 1. 创建数据库（如果不存在）
CREATE DATABASE IF NOT EXISTS `kids_quiz` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `kids_quiz`;

-- 2. 创建用户表
CREATE TABLE `users` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `username` VARCHAR(80) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `display_name` VARCHAR(80) NULL,
    `role` ENUM('ADMIN', 'TEACHER') NOT NULL DEFAULT 'ADMIN',
    `status` ENUM('ENABLED', 'DISABLED', 'DELETED') NOT NULL DEFAULT 'ENABLED',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_username_key`(`username`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 3. 创建学生表
CREATE TABLE `students` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `owner_id` BIGINT NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `avatar_url` VARCHAR(500) NULL,
    `grade` VARCHAR(30) NULL,
    `pin_hash` VARCHAR(255) NULL,
    `total_stars` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('ENABLED', 'DISABLED', 'DELETED') NOT NULL DEFAULT 'ENABLED',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `students_owner_id_idx`(`owner_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 4. 创建学科表
CREATE TABLE `subjects` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `owner_id` BIGINT NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `icon` VARCHAR(100) NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('ENABLED', 'DISABLED', 'DELETED') NOT NULL DEFAULT 'ENABLED',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `subjects_owner_id_idx`(`owner_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 5. 创建知识点表
CREATE TABLE `knowledge_points` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `owner_id` BIGINT NOT NULL,
    `subject_id` BIGINT NOT NULL,
    `parent_id` BIGINT NULL,
    `name` VARCHAR(120) NOT NULL,
    `path` VARCHAR(500) NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('ENABLED', 'DISABLED', 'DELETED') NOT NULL DEFAULT 'ENABLED',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `knowledge_points_owner_id_idx`(`owner_id`),
    INDEX `knowledge_points_subject_id_idx`(`subject_id`),
    INDEX `knowledge_points_parent_id_idx`(`parent_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 6. 创建大题组表
CREATE TABLE `question_groups` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `owner_id` BIGINT NOT NULL,
    `subject_id` BIGINT NOT NULL,
    `knowledge_point_id` BIGINT NULL,
    `title` VARCHAR(255) NOT NULL,
    `common_stem` TEXT NULL,
    `content` JSON NULL,
    `group_type` ENUM('PRACTICE_SET', 'WORKSHEET_SECTION', 'MENTAL_MATH', 'FILL_BLANK_GROUP', 'MATCHING_GROUP', 'COMPOSITE') NOT NULL DEFAULT 'PRACTICE_SET',
    `difficulty` INTEGER NOT NULL DEFAULT 1,
    `score` DECIMAL(8, 2) NOT NULL DEFAULT 0.00,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('ENABLED', 'DISABLED', 'DELETED') NOT NULL DEFAULT 'ENABLED',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `question_groups_owner_id_idx`(`owner_id`),
    INDEX `question_groups_subject_id_idx`(`subject_id`),
    INDEX `question_groups_knowledge_point_id_idx`(`knowledge_point_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 7. 创建具体题目表
CREATE TABLE `questions` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `owner_id` BIGINT NOT NULL,
    `group_id` BIGINT NULL,
    `subject_id` BIGINT NOT NULL,
    `knowledge_point_id` BIGINT NULL,
    `question_type` ENUM('CALCULATION', 'FILL_BLANK', 'SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE', 'MATCHING', 'ORDERING', 'SENTENCE_BUILD', 'WORD_PROBLEM', 'COMPOSITE_CHILD') NOT NULL,
    `stem` TEXT NOT NULL,
    `stem_format` VARCHAR(30) NOT NULL DEFAULT 'plain',
    `content` JSON NULL,
    `explanation` TEXT NULL,
    `difficulty` INTEGER NOT NULL DEFAULT 1,
    `score` DECIMAL(8, 2) NOT NULL DEFAULT 1.00,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('ENABLED', 'DISABLED', 'DELETED') NOT NULL DEFAULT 'ENABLED',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `questions_owner_id_idx`(`owner_id`),
    INDEX `questions_group_id_idx`(`group_id`),
    INDEX `questions_subject_id_idx`(`subject_id`),
    INDEX `questions_knowledge_point_id_idx`(`knowledge_point_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 8. 创建作答点表
CREATE TABLE `answer_slots` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `question_id` BIGINT NOT NULL,
    `slot_key` VARCHAR(50) NOT NULL,
    `slot_type` ENUM('TEXT', 'NUMBER', 'EXPRESSION', 'CHOICE', 'MATCH', 'ORDER', 'COMPARE_SYMBOL') NOT NULL,
    `correct_answer` JSON NOT NULL,
    `answer_rule` JSON NULL,
    `placeholder` VARCHAR(100) NULL,
    `unit` VARCHAR(50) NULL,
    `score` DECIMAL(8, 2) NOT NULL DEFAULT 1.00,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `answer_slots_question_id_idx`(`question_id`),
    UNIQUE INDEX `answer_slots_question_id_slot_key_key`(`question_id`, `slot_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 9. 创建选择题选项表
CREATE TABLE `question_options` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `question_id` BIGINT NOT NULL,
    `option_key` VARCHAR(20) NOT NULL,
    `content` TEXT NOT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,

    INDEX `question_options_question_id_idx`(`question_id`),
    UNIQUE INDEX `question_options_question_id_option_key_key`(`question_id`, `option_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 10. 创建试卷表
CREATE TABLE `papers` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `owner_id` BIGINT NOT NULL,
    `subject_id` BIGINT NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `time_limit` INTEGER NULL,
    `status` ENUM('ENABLED', 'DISABLED', 'DELETED') NOT NULL DEFAULT 'ENABLED',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `papers_owner_id_idx`(`owner_id`),
    INDEX `papers_subject_id_idx`(`subject_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 11. 创建试卷关联题库表
CREATE TABLE `paper_questions` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `paper_id` BIGINT NOT NULL,
    `group_id` BIGINT NULL,
    `question_id` BIGINT NULL,
    `score` DECIMAL(8, 2) NOT NULL DEFAULT 1.00,
    `sort_order` INTEGER NOT NULL DEFAULT 0,

    INDEX `paper_questions_paper_id_idx`(`paper_id`),
    INDEX `paper_questions_group_id_idx`(`group_id`),
    INDEX `paper_questions_question_id_idx`(`question_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 12. 创建学生答题记录表
CREATE TABLE `student_answers` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `student_id` BIGINT NOT NULL,
    `question_id` BIGINT NOT NULL,
    `group_id` BIGINT NULL,
    `paper_id` BIGINT NULL,
    `source` ENUM('PRACTICE', 'PAPER', 'TASK', 'WRONG_RETRY') NOT NULL DEFAULT 'PRACTICE',
    `answer_data` JSON NOT NULL,
    `correct_data` JSON NULL,
    `is_correct` BOOLEAN NOT NULL,
    `score` DECIMAL(8, 2) NOT NULL DEFAULT 0.00,
    `max_score` DECIMAL(8, 2) NOT NULL DEFAULT 1.00,
    `used_hint_count` INTEGER NOT NULL DEFAULT 0,
    `duration_seconds` INTEGER NOT NULL DEFAULT 0,
    `submitted_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `student_answers_student_id_submitted_at_idx`(`student_id`, `submitted_at`),
    INDEX `student_answers_student_id_question_id_idx`(`student_id`, `question_id`),
    INDEX `student_answers_paper_id_idx`(`paper_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 13. 创建答题详情小项表
CREATE TABLE `student_answer_details` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `student_answer_id` BIGINT NOT NULL,
    `slot_key` VARCHAR(50) NOT NULL,
    `student_value` JSON NOT NULL,
    `correct_value` JSON NULL,
    `is_correct` BOOLEAN NOT NULL,
    `score` DECIMAL(8, 2) NOT NULL DEFAULT 0.00,

    INDEX `student_answer_details_student_answer_id_idx`(`student_answer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 14. 添加外键约束
ALTER TABLE `students` ADD CONSTRAINT `students_owner_id_fkey` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `subjects` ADD CONSTRAINT `subjects_owner_id_fkey` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `knowledge_points` ADD CONSTRAINT `knowledge_points_owner_id_fkey` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `knowledge_points` ADD CONSTRAINT `knowledge_points_subject_id_fkey` FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `knowledge_points` ADD CONSTRAINT `knowledge_points_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `knowledge_points`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `question_groups` ADD CONSTRAINT `question_groups_owner_id_fkey` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `question_groups` ADD CONSTRAINT `question_groups_subject_id_fkey` FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `question_groups` ADD CONSTRAINT `question_groups_knowledge_point_id_fkey` FOREIGN KEY (`knowledge_point_id`) REFERENCES `knowledge_points`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `questions` ADD CONSTRAINT `questions_owner_id_fkey` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `questions` ADD CONSTRAINT `questions_group_id_fkey` FOREIGN KEY (`group_id`) REFERENCES `question_groups`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `questions` ADD CONSTRAINT `questions_subject_id_fkey` FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `questions` ADD CONSTRAINT `questions_knowledge_point_id_fkey` FOREIGN KEY (`knowledge_point_id`) REFERENCES `knowledge_points`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `answer_slots` ADD CONSTRAINT `answer_slots_question_id_fkey` FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `question_options` ADD CONSTRAINT `question_options_question_id_fkey` FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `papers` ADD CONSTRAINT `papers_owner_id_fkey` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `papers` ADD CONSTRAINT `papers_subject_id_fkey` FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `paper_questions` ADD CONSTRAINT `paper_questions_paper_id_fkey` FOREIGN KEY (`paper_id`) REFERENCES `papers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `paper_questions` ADD CONSTRAINT `paper_questions_group_id_fkey` FOREIGN KEY (`group_id`) REFERENCES `question_groups`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `paper_questions` ADD CONSTRAINT `paper_questions_question_id_fkey` FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `student_answers` ADD CONSTRAINT `student_answers_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `student_answers` ADD CONSTRAINT `student_answers_question_id_fkey` FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `student_answers` ADD CONSTRAINT `student_answers_paper_id_fkey` FOREIGN KEY (`paper_id`) REFERENCES `papers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `student_answer_details` ADD CONSTRAINT `student_answer_details_student_answer_id_fkey` FOREIGN KEY (`student_answer_id`) REFERENCES `student_answers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
