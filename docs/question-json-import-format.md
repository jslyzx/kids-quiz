# 题目 JSON 导入格式说明

这份文档用于给 OCR / AI 识题工具指定输出格式。识别工具按这里输出 JSON 后，可以在「家长后台 → 题库管理 → 导入题目 JSON」中粘贴或上传，校验后导入题库。

## 1. 顶层结构

推荐输出数组，每一项是一道题组。普通单题也是题组，只是 `questions` 里只有一道小题。导入页会把这里的 OCR 友好格式转换成系统内部 draft 格式；命令行可先运行 `pnpm import:validate -- <file.json> --check-assets` 做同一套校验。

```json
[
  {
    "title": "题组标题，可选",
    "type": "FILL_BLANK",
    "subject": "数学",
    "grade": "二年级",
    "difficulty": 1,
    "tags": ["填空题", "万以内数"],
    "questions": []
  }
]
```

通用字段：

| 字段 | 必填 | 说明 |
|---|---:|---|
| `title` | 否 | 题组标题。普通单题可以为空，复合题建议填写。 |
| `type` | 是 | 题型。见下方题型枚举。 |
| `subject` | 否 | 学科，例如 `数学`、`语文`。 |
| `grade` | 否 | 年级，例如 `二年级`。 |
| `difficulty` | 否 | 难度，建议 `1` 到 `5`。 |
| `tags` | 否 | 标签/知识点数组。 |
| `material` / `materials` | 否 | 公共材料，复合题使用。图片建议使用 `/uploads/xxx.jpg`，避免写死本机 `localhost`。 |
| `questions` | 是 | 小题数组。 |

内部规范字段对照：

| OCR 友好字段 | 内部字段 |
|---|---|
| `type: "FILL_BLANK"` 等大写题型 | `type: "question"` + `question.question_type` |
| `type: "ORAL_ARITHMETIC"` | `type: "calculation_group"` |
| `type: "COMPOSITE"` | `type: "composite_group"` |
| `grade` | `gradeLevel` |
| `questions` | 单题转 `question`，多题/复合题转 `children` |
| `answerSlots` | `answer_slots` |
| `slotKey` / `slotType` / `correctAnswer` / `answerRule` | `slot_key` / `slot_type` / `correct_answer` / `answer_rule` |
| `leftItems` / `rightItems` | `content.left` / `content.right` |

## 2. 文本规则

### 数学公式

推荐直接输出新系统格式：

```text
计算下面的数学表达式：{{math:2x + 3 = 7}}
```

兼容旧格式，导入页会自动转换：

```text
\(2x + 3 = 7\)
\[2x + 3 = 7\]
```

### 填空占位

推荐输出：

```text
3{{blank:1}}5表示{{blank:2}}个{{blank:3}}相加。
```

兼容旧格式，导入页会自动转换：

```text
3{_0}5表示{_1}个{_2}相加。
```

### 换行

需要换行时在字符串中保留 `\n`：

```json
"stem": "1200里面有{{blank:1}}个百\n8个千是{{blank:2}}\n60÷{{blank:3}}=8……4"
```

### 解题解析

可选字段 `explanationHtml`，使用安全 HTML 片段，支持文字、列表、图片和公式。

```json
"explanationHtml": "<p>先看被除数和余数。</p><p>{{math:60 \\div 7 = 8 \\cdots 4}}</p>"
```

图片可以写在解析中的任意位置：

```html
<img src="https://example.com/image.png" alt="解析图" />
```

家长端编辑题目时也可以直接用富文本编辑器上传图片，系统会把图片插入到当前位置。

## 3. 题型枚举

建议 OCR 工具输出这些 `type`：

- `FILL_BLANK`：填空题
- `ORAL_ARITHMETIC`：口算题组
- `COMPARE`：比较符号题
- `SINGLE_CHOICE`：单选题
- `MULTIPLE_CHOICE`：多选题
- `ORDERING`：排序题
- `MATCHING`：连线题
- `COMPOSITE`：复合题
- `POEM_CHAR_PICKER`：古诗选字填空

## 4. 分题型示例

### 填空题

```json
{
  "title": "在（）里填合适的数。",
  "type": "FILL_BLANK",
  "subject": "数学",
  "grade": "二年级",
  "tags": ["填空题", "万以内数"],
  "questions": [
    {
      "stem": "1200里面有{{blank:1}}个百\n8个千是{{blank:2}}\n60÷{{blank:3}}=8……4",
      "answerSlots": [
        { "slotKey": "blank_1", "correctAnswer": ["12"] },
        { "slotKey": "blank_2", "correctAnswer": ["8000"] },
        { "slotKey": "blank_3", "correctAnswer": ["7"] }
      ],
      "explanationHtml": "<p>1200 里面有 12 个百。</p>"
    }
  ]
}
```

要求：`stem` 里的空位数量要和 `answerSlots` 对应，`slotKey` 推荐从 `blank_1` 开始递增。历史文件里的 `{_0}`、`{{blank:blank_0}}`、`blank_0` 会在导入时自动转成 1 基序号。

#### 孩子端键盘类型（可选）

填空题默认会按 `slot_type` 和答案内容自动选择键盘：数字/表达式走数学键盘，乘法口诀和中文数字走中文候选键盘，普通文本走系统输入法。特殊题可以在 `answer_rule.keyboard` 显式指定。

可选值：

- `math`：数字和 `+ - × ÷ . =`
- `digit`：仅 `0-9`
- `chinese-number`：中文数字/口诀候选
- `text`：系统输入法

示例：

```json
{
  "slot_key": "blank_1",
  "slot_type": "text",
  "correct_answer": ["三七二十一"],
  "answer_rule": { "keyboard": "chinese-number" }
}
```

### 口算题组

```json
{
  "title": "直接写出得数。",
  "type": "ORAL_ARITHMETIC",
  "subject": "数学",
  "grade": "二年级",
  "content": { "columns": 5 },
  "questions": [
    { "stem": "20×3=", "answerSlots": [{ "slotKey": "answer", "correctAnswer": ["60"] }] },
    { "stem": "48÷6=", "answerSlots": [{ "slotKey": "answer", "correctAnswer": ["8"] }] }
  ]
}
```

`content.columns` 表示展示时一行几个。

### 比较符号题

```json
{
  "title": "在○里填上 >、< 或 =。",
  "type": "COMPARE",
  "questions": [
    {
      "stem": "30×5 ○ 150",
      "answerSlots": [{ "slotKey": "compare", "correctAnswer": ["="] }]
    }
  ]
}
```

### 单选题

```json
{
  "title": "选择正确的答案",
  "type": "SINGLE_CHOICE",
  "questions": [
    {
      "stem": "计算下面的数学表达式：{{math:2x + 3 = 7}}",
      "options": [
        { "key": "A", "text": "{{math:x=2}}" },
        { "key": "B", "text": "{{math:x=3}}" },
        { "key": "C", "text": "{{math:x=4}}" },
        { "key": "D", "text": "{{math:x=5}}" }
      ],
      "answerSlots": [{ "slotKey": "choice", "correctAnswer": ["A"] }]
    }
  ]
}
```

### 多选题

```json
{
  "title": "选择所有正确答案",
  "type": "MULTIPLE_CHOICE",
  "questions": [
    {
      "stem": "下面哪些数是偶数？",
      "options": [
        { "key": "A", "text": "2" },
        { "key": "B", "text": "3" },
        { "key": "C", "text": "4" }
      ],
      "answerSlots": [{ "slotKey": "choice", "correctAnswer": ["A", "C"] }]
    }
  ]
}
```

### 排序题

```json
{
  "title": "把下面的数按从小到大的顺序排一排。（填序号）",
  "type": "ORDERING",
  "content": { "direction": "asc" },
  "questions": [
    {
      "items": [
        { "key": "1", "text": "1200" },
        { "key": "2", "text": "980" },
        { "key": "3", "text": "1000" }
      ],
      "answerSlots": [{ "slotKey": "order", "correctAnswer": ["2", "3", "1"] }]
    }
  ]
}
```

`direction` 可选：`asc` 表示从小到大，`desc` 表示从大到小。

### 连线题

```json
{
  "title": "连一连。",
  "type": "MATCHING",
  "questions": [
    {
      "leftItems": [
        { "key": "L1", "text": "3个4相加" },
        { "key": "L2", "text": "3个4相乘" }
      ],
      "rightItems": [
        { "key": "R1", "text": "3×4" },
        { "key": "R2", "text": "4+4+4" }
      ],
      "answerSlots": [
        {
          "slotKey": "matching",
          "correctAnswer": [
            { "left": "L1", "right": "R2" },
            { "left": "L2", "right": "R1" }
          ]
        }
      ]
    }
  ]
}
```

### 复合题

```json
{
  "title": "看表回答问题",
  "type": "COMPOSITE",
  "subject": "数学",
  "grade": "二年级",
  "material": {
    "type": "text",
    "text": "公共题干或材料内容"
  },
  "questions": [
    {
      "type": "FILL_BLANK",
      "stem": "苹果有{{blank:1}}个。",
      "answerSlots": [{ "slotKey": "blank_1", "correctAnswer": ["12"] }]
    },
    {
      "type": "SINGLE_CHOICE",
      "stem": "最多的是哪一种？",
      "options": [
        { "key": "A", "text": "苹果" },
        { "key": "B", "text": "梨" }
      ],
      "answerSlots": [{ "slotKey": "choice", "correctAnswer": ["A"] }]
    }
  ]
}
```

材料也可以是图片：

```json
"material": {
  "type": "image",
  "text": "https://example.com/material.png"
}
```

### 看图列式题

低年级数学里常见的“看线段图/实物图列式计算”，推荐使用 `composite_group`，并把图片放到对应小题的 `content.materials` 中。原则是：

- 一小题一张图，不把多道小题的图合在同一个公共材料里，避免学生读图时互相干扰。
- 图中已经给出的数量关系，不要再完整写进题干；题干只保留“列式框”和单位。
- 数字位置使用普通填空框，运算符位置使用 `compare_symbol`，并设置 `answer_rule.display_shape: "circle"`，展示为圆圈。
- 运算符可选值建议写在 `answer_rule.allowed_values` 中，例如 `["+", "-", "×", "÷"]`。

示例：

```json
{
  "type": "composite_group",
  "title": "看图列式计算",
  "gradeLevel": "二年级",
  "difficulty": 2,
  "tags": ["数学", "看图列式", "解决问题"],
  "commonStem": "看图列式计算。",
  "materials": [],
  "children": [
    {
      "question_type": "fill_blank",
      "content": {
        "materials": [
          {
            "type": "image",
            "title": "第（1）题线段图",
            "url": "/uploads/example-q1.jpg"
          }
        ]
      },
      "stem": "（1）{{blank:1}}{{blank:2}}{{blank:3}}={{blank:4}}（朵）",
      "answer_slots": [
        { "slot_key": "blank_1", "slot_type": "number", "correct_answer": ["36"] },
        {
          "slot_key": "blank_2",
          "slot_type": "compare_symbol",
          "correct_answer": ["÷"],
          "answer_rule": { "allowed_values": ["+", "-", "×", "÷"], "display_shape": "circle" }
        },
        { "slot_key": "blank_3", "slot_type": "number", "correct_answer": ["4"] },
        { "slot_key": "blank_4", "slot_type": "number", "correct_answer": ["9"] }
      ],
      "explanation": "线段图表示36朵平均分成4份，求每份是多少：36÷4=9（朵）。"
    },
    {
      "question_type": "fill_blank",
      "content": {
        "materials": [
          {
            "type": "image",
            "title": "第（2）题线段图",
            "url": "/uploads/example-q2.jpg"
          }
        ]
      },
      "stem": "（2）{{blank:1}}{{blank:2}}{{blank:3}}{{blank:4}}{{blank:5}}={{blank:6}}（箱）",
      "answer_slots": [
        { "slot_key": "blank_1", "slot_type": "number", "correct_answer": ["48"] },
        {
          "slot_key": "blank_2",
          "slot_type": "compare_symbol",
          "correct_answer": ["+"],
          "answer_rule": { "allowed_values": ["+", "-", "×", "÷"], "display_shape": "circle" }
        },
        { "slot_key": "blank_3", "slot_type": "number", "correct_answer": ["52"] },
        {
          "slot_key": "blank_4",
          "slot_type": "compare_symbol",
          "correct_answer": ["-"],
          "answer_rule": { "allowed_values": ["+", "-", "×", "÷"], "display_shape": "circle" }
        },
        { "slot_key": "blank_5", "slot_type": "number", "correct_answer": ["20"] },
        { "slot_key": "blank_6", "slot_type": "number", "correct_answer": ["80"] }
      ],
      "explanation": "线段图表示西瓜箱数比苹果和梨的总数少20箱：48+52-20=80（箱）。"
    }
  ]
}
```

### 竖式算谜题

竖式题统一用 `fill_blank + content.columnArithmetic`（加减乘）或 `content.columnDivision`（除法），系统按规则判分，不需要穷举所有正确答案。`content.columnArithmetic` 共有 **三种形态**，按题目需要选用：

| 形态 | 竖式格子里是什么 | 学生答在哪 | 判分方式 |
|---|---|---|---|
| ① 方框填数 | 数字方框（slot） | 在竖式格子里填 | `validation` 拼算式 |
| ② 汉字数字谜 | 固定汉字（不设 slot） | 题干的填空 | 普通填空判分 |
| ③ 普通竖式 | 数字方框（slot） | 在竖式格子里填 | `validation` 拼算式 |

---

#### 形态 ①：方框填数（把数字填进竖式）

“把 2、3、4、6、7、8 填入方框，使算式成立”这类题。竖式格里用 `{ "slot": "xxx" }` 表示可填方框，判分靠 `validation` 拼出的真实算式，`correct_answer` 一律留空数组。

```json
{
  "type": "question",
  "title": "智慧加油站：竖式数字谜",
  "gradeLevel": "二年级",
  "difficulty": 3,
  "tags": ["竖式", "数字谜"],
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
```

#### 形态 ②：汉字数字谜（竖式展示汉字，题干填空）

“兴大国 + 大国兴 = 大国大兴，每个汉字代表数字几”这类题。竖式格里**全部用 `{ "text": "字" }` 固定显示汉字**（不设 slot），保证对齐；学生答在题干的填空里（`兴={{blank:1}} 大={{blank:2}} …`）。判分走普通填空，**不填 `validation`**。

```json
{
  "type": "question",
  "title": "智慧加油站：汉字数字谜",
  "gradeLevel": "二年级",
  "difficulty": 3,
  "tags": ["竖式", "数字谜", "汉字代数"],
  "question": {
    "question_type": "fill_blank",
    "stem": "下面的汉字图代表数字几？\n兴={{blank:1}}  大={{blank:2}}  国={{blank:3}}",
    "content": {
      "interaction": "column_arithmetic",
      "columnArithmetic": {
        "operation": "addition",
        "columns": 4,
        "rows": [
          { "role": "operand", "cells": [null, { "text": "兴" }, { "text": "大" }, { "text": "国" }] },
          { "role": "operand", "operator": "+", "cells": [null, { "text": "大" }, { "text": "国" }, { "text": "兴" }] },
          { "role": "result", "cells": [{ "text": "大" }, { "text": "国" }, { "text": "大" }, { "text": "兴" }] }
        ]
      }
    },
    "answer_slots": [
      { "slot_key": "blank_1", "slot_type": "number", "correct_answer": ["9"] },
      { "slot_key": "blank_2", "slot_type": "number", "correct_answer": ["1"] },
      { "slot_key": "blank_3", "slot_type": "number", "correct_answer": ["0"] }
    ]
  }
}
```

> 判分要点：竖式格里**没有 slot** 时，系统会自动识别为“纯展示型竖式”，退回普通填空判分。所以 `answer_slots` 的 `correct_answer` 必须填标准答案（兴=9、大=1、国=0）。**不要**给纯展示型竖式配 `validation`。

#### 字段说明（通用）

- `rows[].cells` 从左到右描述每一格，长度按需要给，系统自动右对齐：
  - `null` —— 空白占位（用于高位补位）
  - `{ "text": "1" }` 或 `{ "text": "兴" }` —— 固定显示（数字或汉字）
  - `{ "slot": "a_h" }` —— 可填写方框，学生在这里输入
- `columns`：竖式总列数，等于最长一行（通常是结果行）的位数。
- `operator`：放在当前行左侧，支持 `+`、`-`、`×`。只有第一个运算数行留空，后面的行写运算符。
- `operation`：`addition` / `subtraction` / `multiplication`，用于判分。可省略（系统会从 `operator` 推断），但建议显式写。
- `allowedDigits`：限制可填的数字集合（如 `["2","3","4"]`），仅对形态①③有意义。
- `uniqueDigits: true`：每个数字只能用一次（数字谜常用约束），仅对形态①③有意义。
- `validation.operands` 和 `validation.result`：用 slot key 或固定数字拼出真实算式，判分时校验“操作数运算=结果”是否成立。**只有竖式格子里有 slot 时才需要**。
- `carryRows`：进位/退位标注行，格式和 `rows` 一样；建议每格用 `null` 占位保证对齐。

#### 减法 / 乘法竖式

把 `operation` 改成 `subtraction` / `multiplication`，`operator` 改成 `-` / `×`，其余结构完全一样。判分会自动按对应运算校验。

#### 除法竖式（长除法）

除法布局与加减乘不同（商在顶部、被除数内含除数括号、中间多步部分积），用独立的 `content.columnDivision`。判分校验：**商 × 除数 + 余数 = 被除数，且余数 < 除数**。

```json
{
  "type": "question",
  "question": {
    "question_type": "fill_blank",
    "stem": "用竖式计算：936 ÷ 4",
    "content": {
      "interaction": "column_division",
      "columnDivision": {
        "dividend": [{ "text": "9" }, { "text": "3" }, { "text": "6" }],
        "divisor": [{ "text": "4" }],
        "quotient": [{ "slot": "q1" }, { "slot": "q2" }, { "slot": "q3" }],
        "remainder": [{ "slot": "rem" }],
        "steps": [
          { "product": [{ "slot": "s1" }], "remainder": [{ "slot": "r1" }, { "text": "3" }] },
          { "product": [{ "slot": "s2" }, { "slot": "s2b" }], "remainder": [{ "slot": "r2" }, { "text": "6" }] },
          { "product": [{ "slot": "s3" }, { "slot": "s3b" }], "remainder": [{ "slot": "r3" }] }
        ]
      }
    },
    "answer_slots": [
      { "slot_key": "q1", "slot_type": "number", "correct_answer": [] },
      { "slot_key": "q2", "slot_type": "number", "correct_answer": [] },
      { "slot_key": "q3", "slot_type": "number", "correct_answer": [] },
      { "slot_key": "rem", "slot_type": "number", "correct_answer": [] }
    ]
  }
}
```

除法字段说明：

- `dividend` / `divisor` / `quotient` / `remainder`：被除数、除数、商、余数，从高位到低位排列，每格同样是 `null` / `{text}` / `{slot}`。
- `steps`：长除法的中间步骤（每位商一步），`product` 是“除数×当前位商”的部分积，`remainder` 是本次减法后的剩余（含落下的下一位）。可省略，省略时只显示首尾、不展示过程。
- `remainder` 整除时填 `[{ "text": "0" }]`。
- `correct_answer` 留空数组，判分靠算式（商×除数+余数=被除数）。

#### 录入检查清单

录入竖式题前，逐项核对：

- [ ] `interaction` 与内容字段对应：加减乘用 `column_arithmetic` + `columnArithmetic`；除法用 `column_division` + `columnDivision`。
- [ ] 形态②（汉字数字谜）：竖式格里**只有 `{text}` 没有 `{slot}`**；题干有 `{{blank:n}}`；`answer_slots` 填了正确答案。
- [ ] 形态①③（方框填数）：竖式格里每个 `{slot}` 都有对应的 `answer_slots` 条目；`correct_answer` 留空数组；配了 `validation`（或结果行 `role: "result"`）。
- [ ] `columns` 等于最长一行的位数。
- [ ] 运算符只在第二个运算数行及之后出现，第一个运算数行的 `operator` 留空。
- [ ] 用 `pnpm import:validate -- <文件>` 本地校验，0 error 再导入。

### 古诗选字填空

推荐只维护标题、作者、全文和选字池，不要把原诗作为公共题干展示。

```json
{
  "title": "梅花",
  "type": "POEM_CHAR_PICKER",
  "subject": "语文",
  "grade": "二年级",
  "tags": ["古诗", "选字填空"],
  "content": {
    "poem": {
      "mode": "char_picker",
      "title": "梅花",
      "author": "王安石",
      "fullText": "墙角数枝梅，凌寒独自开。遥知不是雪，为有暗香来。",
      "lineLengths": [5, 5, 5, 5],
      "punctuation": ["，", "。", "，", "。"]
    },
    "pickChars": ["墙", "角", "数", "枝", "梅", "凌", "寒", "独", "自", "开", "遥", "知", "不", "是", "雪", "为", "有", "暗", "香", "来"]
  },
  "questions": [
    {
      "stem": "梅花",
      "answerSlots": [
        {
          "slotKey": "poem",
          "correctAnswer": ["墙角数枝梅凌寒独自开遥知不是雪为有暗香来"]
        }
      ]
    }
  ]
}
```

导入页会自动转换为孩子端支持的古诗选字题。孩子答题时只看到空格和选字，不会直接看到原诗全文。

## 5. 标准导入流程

1. 从 PDF 提取图片：`pnpm pdf:extract-images -- <paper.pdf> _pdf_images/<paper-name>`。
2. 按题目裁图后放入 `apps/api/uploads/`，题目 JSON 中引用 `/uploads/xxx.jpg`，避免写死本机 `localhost`。
3. 生成 JSON 后先运行：`pnpm import:validate -- <file.json> --check-assets --write-normalized=<normalized.json>`。
4. 家长后台进入「题库管理 → 导入题目 JSON」，粘贴 JSON 或上传 `.json` 文件。
5. 点击校验，检查预览、错误提示和疑似重复。
6. 先导入每种题型 1 道，点击「生成验收试卷」。
7. 从「孩子端验收」逐题作答检查展示、交互、图片和答案。
8. 确认无误后移除 `待验收` 标签；发现问题则标记 `需修复`。
9. 无误后再全量导入，并进入「题库体检中心」复扫。

## 6. 表格填空题（新格式）

统计表、课程表、分类表、数量表等题目推荐使用 `fill_blank + content.tableFill`，表格里的空位仍然使用 `{{blank:1}}` 并在 `answer_slots` 中对应。

```json
{
  "type": "question",
  "title": "统计水果数量",
  "gradeLevel": "三年级",
  "difficulty": 1,
  "tags": ["统计表", "数据收集整理"],
  "question": {
    "question_type": "fill_blank",
    "stem": "统计下面的水果数量，完成统计表并填空。\n\n苹果：○○○○○○○○\n香蕉：○○○○\n橙子：○○○○○○\n梨：○○\n\n{{blank:5}}的数量最多，{{blank:6}}的数量最少。",
    "content": {
      "tableFill": {
        "headers": ["水果", "苹果", "香蕉", "橙子", "梨"],
        "rows": [
          ["数量(个)", "{{blank:1}}", "{{blank:2}}", "{{blank:3}}", "{{blank:4}}"]
        ]
      }
    },
    "answer_slots": [
      { "slot_key": "blank_1", "slot_type": "number", "correct_answer": ["8"] },
      { "slot_key": "blank_2", "slot_type": "number", "correct_answer": ["4"] },
      { "slot_key": "blank_3", "slot_type": "number", "correct_answer": ["6"] },
      { "slot_key": "blank_4", "slot_type": "number", "correct_answer": ["2"] },
      { "slot_key": "blank_5", "slot_type": "text", "correct_answer": ["苹果"] },
      { "slot_key": "blank_6", "slot_type": "text", "correct_answer": ["梨"] }
    ],
    "explanation": "数一数可知：苹果8个，香蕉4个，橙子6个，梨2个，所以苹果最多，梨最少。"
  }
}
```

校验要求：

- `content.tableFill.headers` 是字符串数组。
- `content.tableFill.rows` 是二维字符串数组。
- 每行列数建议和 `headers` 一致。
- 表格里的每个 `{{blank:n}}` 都必须有对应 `answer_slots.slot_key = blank_n`。

兼容说明：

- 导入页会尝试把“连续空格模拟的两行表格”自动转换成 `content.tableFill`。
- 例如 `水果      苹果      香蕉` / `数量(个)  {{blank:1}}   {{blank:2}}` 这种结构会被兜底识别。
- 但为了避免复杂表格识别失败，AI 输出时仍应直接使用 `content.tableFill`。
