# Kids Quiz 项目结构与题目导入说明

## 1. 项目结构

本项目是一个 pnpm monorepo，技术栈为 React/Vite + NestJS + Prisma + MySQL。

```text
apps/
  admin-web/              家长端/孩子端前端应用，React + Vite + TypeScript
  api/                    后端 API，NestJS + Prisma

packages/
  question-render/        题目预览和孩子端渲染组件
  shared-types/           前后端共享题型和内容结构类型

prisma/
  schema.prisma           Prisma 数据库模型
  kids_quiz_init.sql      初始化 SQL
  manual_migrations/      手工迁移 SQL

docs/
  question-json-import-format.md  题目 JSON 导入格式说明
  database-design.md              数据库设计说明
  architecture.md                 架构说明

imports/
  *.json                  已整理或待导入的题目 JSON

scripts/
  start-dev.ps1           一键启动开发环境
  setup-db.ps1            初始化/同步数据库
  backup-db.ps1           数据库备份
```

常用命令：

```bash
pnpm setup
pnpm dev
pnpm dev:api
pnpm dev:admin
pnpm db:push
pnpm db:generate
pnpm run build
```

主要入口：

- 前端路由：`apps/admin-web/src/main.tsx`
- 题目 JSON 导入页：`apps/admin-web/src/pages/QuestionJsonImportPage.tsx`
- 题库 API：`apps/api/src/question-groups/`
- 数据库模型：`prisma/schema.prisma`

## 2. 数据库结构

数据库使用 MySQL，ORM 使用 Prisma。核心设计不是“一题一个答案”，而是：

```text
QuestionGroup  题组 / 大题 / 复合材料
  -> Question  小题
    -> AnswerSlot      作答点：填空、选择、排序、连线、比较符号等
    -> QuestionOption  选择题选项
```

### 2.1 用户和基础数据

```text
User
  -> Student
  -> Subject
  -> KnowledgePoint
  -> QuestionGroup
  -> Question
  -> Paper
```

- `users`：家长/教师账号。
- `students`：孩子档案，包含头像、年级、PIN、星星、连续练习天数、任务设置等。
- `subjects`：学科，例如数学、语文。
- `knowledge_points`：知识点树，支持父子层级。

大部分业务表都有 `owner_id`，用于区分不同家庭/账号的数据。

### 2.2 题库核心表

#### `question_groups`

题组/大题/复合材料。

关键字段：

- `title`：题组标题。
- `common_stem`：公共题干。
- `content`：题组级 JSON 内容，例如材料、表格、图片配置。
- `group_type`：题组类型。
- `difficulty`：难度，通常 1-5。
- `grade_level`：年级。
- `tags`：标签数组，JSON。
- `status`：`ENABLED`、`DISABLED`、`DELETED`。

`QuestionGroupType`：

```text
PRACTICE_SET
WORKSHEET_SECTION
MENTAL_MATH
FILL_BLANK_GROUP
MATCHING_GROUP
COMPOSITE
```

#### `questions`

小题。

关键字段：

- `group_id`：所属题组。
- `question_type`：小题类型。
- `stem`：题干。
- `content`：题型专用 JSON，例如选择项、连线左右栏、排序项、表格、图片、竖式配置等。
- `explanation`：解析。
- `difficulty`、`grade_level`、`tags`：题目元信息。

`QuestionType`：

```text
CALCULATION
FILL_BLANK
SINGLE_CHOICE
MULTIPLE_CHOICE
TRUE_FALSE
MATCHING
ORDERING
WORD_PROBLEM
COMPOSITE_CHILD
```

#### `answer_slots`

每个可作答位置。

关键字段：

- `question_id`：所属小题。
- `slot_key`：作答点 key，例如 `blank_1`、`answer`、`choice`、`matching`。
- `slot_type`：作答点类型。
- `correct_answer`：标准答案，JSON。
- `answer_rule`：判题规则，JSON，例如可选运算符、显示形状等。
- `placeholder`、`unit`、`score`：占位、单位、分值。

同一道题内 `slot_key` 唯一。

`SlotType`：

```text
TEXT
NUMBER
EXPRESSION
CHOICE
MATCH
ORDER
COMPARE_SYMBOL
```

#### `question_options`

选择题选项表，包含：

- `question_id`
- `option_key`
- `content`
- `sort_order`

注意：当前 JSON 导入和前端渲染主要把选择项放在 `question.content.options` 中使用；后端 `createQuestionWithSlots` 当前没有把 `content.options` 拆写到 `question_options`。

### 2.3 试卷和答题记录

```text
Paper
  -> PaperQuestion

PracticeAttempt
  -> StudentAnswer
    -> StudentAnswerDetail
```

- `papers`：试卷。
- `paper_questions`：试卷中的题组或单题引用。
- `practice_attempts`：一次练习/试卷提交。
- `student_answers`：单道题的提交结果。
- `student_answer_details`：按 `slot_key` 记录的答题明细。

`student_answers.source` 支持：

```text
PRACTICE
PAPER
TASK
WRONG_RETRY
```

### 2.4 奖励系统

- `reward_catalog_items`：孩子的奖励目录。
- `reward_redemptions`：奖励兑换记录。

兑换状态：

```text
PENDING
APPROVED
REJECTED
```

## 3. 题目 JSON 导入流程

入口：

```text
家长后台 -> 题库管理 -> 导入题目 JSON
```

代码路径：

- 前端导入页：`apps/admin-web/src/pages/QuestionJsonImportPage.tsx`
- 前端 API 封装：`apps/admin-web/src/api/questionGroups.ts`
- 后端控制器：`apps/api/src/question-groups/question-groups.controller.ts`
- 后端保存逻辑：`apps/api/src/question-groups/question-groups.service.ts`
- DTO：`apps/api/src/question-groups/dto.ts`

导入页流程：

1. 粘贴 JSON 或上传 JSON/Excel/CSV/TSV。
2. 前端解析并规范化。
3. 前端校验题型、空位、答案、选项、表格、竖式等结构。
4. 导出当前题库，按题干/答案/题型生成签名，提示疑似重复。
5. 点击导入后，逐题调用 `POST /admin/question-groups`。
6. 成功导入的题目会追加“待验收”标签。
7. 可以生成验收试卷，用孩子端逐题检查展示和交互。

## 4. 导入 JSON 的两层格式

`docs/question-json-import-format.md` 里记录的是面向 OCR / AI 的完整题型说明，题型更丰富。

当前代码最终保存的内部 draft 只有三种顶层结构：

```text
question
calculation_group
composite_group
```

因此建议 AI/OCR 最终输出时直接使用内部 draft 格式。文档前半段的 `FILL_BLANK`、`ORAL_ARITHMETIC`、`questions`、`answerSlots` 这类 OCR 友好格式，不一定被当前导入代码完整自动转换。

### 4.1 文档题型与内部格式对应关系

| 文档题型 | 推荐内部格式 |
|---|---|
| `FILL_BLANK` | `type: "question"` + `question.question_type: "fill_blank"` |
| `ORAL_ARITHMETIC` | `type: "calculation_group"` |
| `COMPARE` | `fill_blank` + `slot_type: "compare_symbol"` |
| `SINGLE_CHOICE` | `question_type: "single_choice"` |
| `MULTIPLE_CHOICE` | `question_type: "multiple_choice"` |
| `ORDERING` | `question_type: "ordering"` |
| `MATCHING` | `question_type: "matching"` |
| `COMPOSITE` | `type: "composite_group"` |
| `POEM_CHAR_PICKER` | `fill_blank` + `content.interaction: "poem_char_fill"` |
| 表格填空 | `fill_blank` + `content.tableFill` |
| 竖式数字谜 | `fill_blank` + `content.interaction: "column_arithmetic"` + `content.columnArithmetic` |
| 看图列式 | 通常用 `composite_group`，图片放在小题 `content.materials` |

### 4.2 当前导入页硬校验

顶层 `type` 允许：

```text
question
calculation_group
composite_group
```

小题 `question_type` 允许：

```text
fill_blank
single_choice
multiple_choice
ordering
matching
```

后端 `mapQuestionType` 虽然还映射了 `true_false`、`word_problem`，但当前 JSON 导入页前端校验未放行它们。

## 5. 通用文本规则

### 5.1 数学公式

推荐：

```text
{{math:2x + 3 = 7}}
```

兼容旧格式，导入页会尝试转换：

```text
\(2x + 3 = 7\)
\[2x + 3 = 7\]
```

### 5.2 填空占位

推荐：

```text
1200里面有{{blank:1}}个百。
```

对应：

```json
{
  "slot_key": "blank_1",
  "slot_type": "number",
  "correct_answer": ["12"]
}
```

兼容旧格式：

```text
{_0} -> {{blank:1}}
{{blank_0}} -> {{blank:1}}
```

### 5.3 解析

普通解析可写：

```json
"explanation": "先算被除数，再看余数。"
```

富文本解析可以放在：

```json
"content": {
  "explanationHtml": "<p>先看被除数。</p>",
  "explanationFormat": "html"
}
```

当前规范化逻辑会把 `question.explanation` 同步到 `content.explanationHtml`，用于预览/渲染。

## 6. 推荐内部 JSON 示例

### 6.1 单题填空

```json
[
  {
    "type": "question",
    "title": "在括号里填合适的数",
    "gradeLevel": "二年级",
    "difficulty": 1,
    "tags": ["数学", "填空"],
    "question": {
      "question_type": "fill_blank",
      "stem": "1200里面有{{blank:1}}个百。",
      "answer_slots": [
        {
          "slot_key": "blank_1",
          "slot_type": "number",
          "correct_answer": ["12"]
        }
      ],
      "explanation": "1200 里面有 12 个百。"
    }
  }
]
```

### 6.2 口算题组

```json
[
  {
    "type": "calculation_group",
    "title": "直接写出得数",
    "gradeLevel": "二年级",
    "difficulty": 1,
    "tags": ["数学", "口算"],
    "columns": 4,
    "items": [
      { "stem": "20×3=", "answer": "60" },
      { "stem": "48÷6=", "answer": "8" }
    ]
  }
]
```

### 6.3 比较符号题

```json
[
  {
    "type": "question",
    "title": "在圆圈里填上 >、< 或 =",
    "gradeLevel": "二年级",
    "difficulty": 1,
    "tags": ["数学", "比较大小"],
    "question": {
      "question_type": "fill_blank",
      "stem": "30×5 {{blank:1}} 150",
      "answer_slots": [
        {
          "slot_key": "blank_1",
          "slot_type": "compare_symbol",
          "correct_answer": ["="],
          "answer_rule": {
            "allowed_values": [">", "<", "="],
            "display_shape": "circle"
          }
        }
      ]
    }
  }
]
```

### 6.4 单选题

```json
[
  {
    "type": "question",
    "title": "选择正确答案",
    "gradeLevel": "二年级",
    "difficulty": 1,
    "tags": ["数学", "选择题"],
    "question": {
      "question_type": "single_choice",
      "stem": "8×6 的结果是？",
      "content": {
        "options": [
          { "key": "A", "text": "42" },
          { "key": "B", "text": "48" },
          { "key": "C", "text": "54" }
        ]
      },
      "answer_slots": [
        {
          "slot_key": "choice",
          "slot_type": "choice",
          "correct_answer": ["B"]
        }
      ]
    }
  }
]
```

### 6.5 多选题

```json
[
  {
    "type": "question",
    "title": "选择所有正确答案",
    "gradeLevel": "二年级",
    "difficulty": 1,
    "tags": ["数学", "多选题"],
    "question": {
      "question_type": "multiple_choice",
      "stem": "下面哪些数是偶数？",
      "content": {
        "options": [
          { "key": "A", "text": "2" },
          { "key": "B", "text": "3" },
          { "key": "C", "text": "4" }
        ]
      },
      "answer_slots": [
        {
          "slot_key": "choice",
          "slot_type": "choice",
          "correct_answer": ["A", "C"]
        }
      ]
    }
  }
]
```

### 6.6 排序题

```json
[
  {
    "type": "question",
    "title": "按从小到大的顺序排列",
    "gradeLevel": "二年级",
    "difficulty": 1,
    "tags": ["数学", "排序"],
    "question": {
      "question_type": "ordering",
      "stem": "把下面的数按从小到大的顺序排一排。",
      "content": {
        "items": [
          { "key": "1", "text": "1200" },
          { "key": "2", "text": "980" },
          { "key": "3", "text": "1000" }
        ],
        "separator": "<"
      },
      "answer_slots": [
        {
          "slot_key": "order",
          "slot_type": "order",
          "correct_answer": ["2", "3", "1"]
        }
      ]
    }
  }
]
```

### 6.7 连线题

```json
[
  {
    "type": "question",
    "title": "连一连",
    "gradeLevel": "二年级",
    "difficulty": 1,
    "tags": ["数学", "连线题"],
    "question": {
      "question_type": "matching",
      "stem": "把意思相同的内容连起来。",
      "content": {
        "left": [
          { "key": "L1", "text": "3个4相加" },
          { "key": "L2", "text": "3个4相乘" }
        ],
        "right": [
          { "key": "R1", "text": "3×4" },
          { "key": "R2", "text": "4+4+4" }
        ]
      },
      "answer_slots": [
        {
          "slot_key": "matching",
          "slot_type": "match",
          "correct_answer": [
            { "left": "L1", "right": "R2" },
            { "left": "L2", "right": "R1" }
          ]
        }
      ]
    }
  }
]
```

### 6.8 复合题

```json
[
  {
    "type": "composite_group",
    "title": "看表回答问题",
    "gradeLevel": "二年级",
    "difficulty": 2,
    "tags": ["数学", "解决问题"],
    "commonStem": "根据下面材料回答问题。",
    "materials": [
      {
        "type": "text",
        "title": "材料",
        "text": "苹果有12个，梨有8个。"
      }
    ],
    "children": [
      {
        "question_type": "fill_blank",
        "stem": "苹果比梨多{{blank:1}}个。",
        "answer_slots": [
          {
            "slot_key": "blank_1",
            "slot_type": "number",
            "correct_answer": ["4"]
          }
        ],
        "explanation": "12 - 8 = 4。"
      }
    ]
  }
]
```

### 6.9 表格填空题

```json
[
  {
    "type": "question",
    "title": "统计水果数量",
    "gradeLevel": "二年级",
    "difficulty": 1,
    "tags": ["数学", "统计表"],
    "question": {
      "question_type": "fill_blank",
      "stem": "完成统计表，并回答问题。\n{{blank:5}}最多，{{blank:6}}最少。",
      "content": {
        "tableFill": {
          "headers": ["水果", "苹果", "香蕉", "梨"],
          "rows": [
            ["数量", "{{blank:1}}", "{{blank:2}}", "{{blank:3}}"]
          ]
        }
      },
      "answer_slots": [
        { "slot_key": "blank_1", "slot_type": "number", "correct_answer": ["8"] },
        { "slot_key": "blank_2", "slot_type": "number", "correct_answer": ["4"] },
        { "slot_key": "blank_3", "slot_type": "number", "correct_answer": ["2"] },
        { "slot_key": "blank_5", "slot_type": "text", "correct_answer": ["苹果"] },
        { "slot_key": "blank_6", "slot_type": "text", "correct_answer": ["梨"] }
      ]
    }
  }
]
```

### 6.10 竖式数字谜

```json
[
  {
    "type": "question",
    "title": "竖式数字谜",
    "gradeLevel": "二年级",
    "difficulty": 3,
    "tags": ["数学", "竖式", "数字谜"],
    "question": {
      "question_type": "fill_blank",
      "stem": "把2、3、4、6、7、8填入方框里，使算式成立。",
      "content": {
        "interaction": "column_arithmetic",
        "columnArithmetic": {
          "operation": "addition",
          "columns": 4,
          "allowedDigits": ["2", "3", "4", "6", "7", "8"],
          "uniqueDigits": true,
          "rows": [
            { "role": "operand", "cells": [null, { "slot": "a_h" }, { "slot": "a_t" }, { "slot": "a_o" }] },
            { "role": "operand", "operator": "+", "cells": [null, { "slot": "b_h" }, { "slot": "b_t" }, { "slot": "b_o" }] },
            { "role": "result", "cells": [{ "text": "1" }, { "text": "1" }, { "text": "1" }, { "text": "0" }] }
          ],
          "validation": {
            "mode": "expression",
            "operands": [["a_h", "a_t", "a_o"], ["b_h", "b_t", "b_o"]],
            "result": ["1", "1", "1", "0"]
          }
        }
      },
      "answer_slots": [
        { "slot_key": "a_h", "slot_type": "number", "correct_answer": [] },
        { "slot_key": "a_t", "slot_type": "number", "correct_answer": [] },
        { "slot_key": "a_o", "slot_type": "number", "correct_answer": [] },
        { "slot_key": "b_h", "slot_type": "number", "correct_answer": [] },
        { "slot_key": "b_t", "slot_type": "number", "correct_answer": [] },
        { "slot_key": "b_o", "slot_type": "number", "correct_answer": [] }
      ]
    }
  }
]
```

### 6.11 古诗选字填空

```json
[
  {
    "type": "question",
    "title": "梅花",
    "gradeLevel": "二年级",
    "difficulty": 1,
    "tags": ["语文", "古诗", "选字填空"],
    "question": {
      "question_type": "fill_blank",
      "stem": "梅花",
      "content": {
        "interaction": "poem_char_fill",
        "poem": {
          "title": "梅花",
          "author": "王安石",
          "lines": ["墙角数枝梅，", "凌寒独自开。", "遥知不是雪，", "为有暗香来。"]
        },
        "charPool": ["墙", "角", "数", "枝", "梅", "凌", "寒", "独", "自", "开", "遥", "知", "不", "是", "雪", "为", "有", "暗", "香", "来"]
      },
      "answer_slots": [
        {
          "slot_key": "poem",
          "slot_type": "text",
          "correct_answer": ["墙角数枝梅凌寒独自开遥知不是雪为有暗香来"]
        }
      ]
    }
  }
]
```

## 7. 校验规则和常见坑

### 7.1 填空题

- `stem` 里必须出现 `{{blank:n}}`。
- 每个空位必须有对应 `answer_slots.slot_key = blank_n`。
- `slot_key` 不能重复。
- `correct_answer` 通常是数组，例如 `["12"]`。

### 7.2 选择题

- 至少 2 个选项。
- `content.options[].key` 不能重复。
- 单选题答案必须且只能有 1 个。
- 多选题答案至少 1 个。
- 答案必须出现在选项 key 中。

### 7.3 排序题

- `content.items` 至少 2 项。
- `correct_answer` 的数量必须和排序项数量一致。
- 答案中的 key 必须全部存在于 `content.items`。

### 7.4 连线题

- `content.left` 和 `content.right` 都不能为空。
- `correct_answer` 必须是连线关系数组。
- 每个 `{ left, right }` 都必须匹配到左右栏已有 key。

### 7.5 表格填空题

- `content.tableFill.headers` 是字符串数组。
- `content.tableFill.rows` 是二维字符串数组。
- 每行列数最好和 `headers` 一致。
- 表格中的 `{{blank:n}}` 也要有对应 `answer_slots`。

### 7.6 竖式数字谜

- 必须有 `content.columnArithmetic.rows`。
- 可填写方框用 `{ "slot": "xxx" }` 表示。
- 每个 slot 都要在 `answer_slots` 中出现。
- 这类题可以不列出固定标准答案，允许 `correct_answer: []`，通过 `validation` 判定。

### 7.7 文档与代码不一致点

当前 `docs/question-json-import-format.md` 同时包含两套写法：

1. 面向 OCR 的大写/驼峰格式，例如 `FILL_BLANK`、`questions`、`answerSlots`。
2. 当前系统内部 draft 格式，例如 `question`、`composite_group`、`answer_slots`。

从代码看，导入页和保存 API 最稳定支持的是内部 draft 格式。后续如果希望严格按文档前半段导入，需要补一层转换逻辑，把大写题型和驼峰字段转换成内部格式。

