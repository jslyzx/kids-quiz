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
| `material` / `materials` | 否 | 公共材料，复合题使用。图片建议使用 `/uploads/xxx.jpg` 或 `http://localhost:3000/uploads/xxx.jpg`。 |
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
            "url": "http://localhost:3000/uploads/example-q1.jpg"
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
            "url": "http://localhost:3000/uploads/example-q2.jpg"
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

低年级常见的“把数字填入竖式方框，使算式成立”推荐使用 `fill_blank + content.columnArithmetic`。这种题不需要列出所有正确答案，系统会按规则判分。

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

字段说明：

- `rows[].cells` 从左到右描述每一格；`null` 是空白占位，`{ "text": "1" }` 是固定数字，`{ "slot": "a_h" }` 是可填写方框。
- `operator` 放在当前行左侧，支持 `+`、`-`、`×`。
- `allowedDigits` 限制可填数字；`uniqueDigits: true` 表示每个数字只能使用一次。
- `validation.operands` 和 `validation.result` 用 slot key 或固定数字组成真实算式。结果中也可以写 slot key，因此结果位同样可以设空。
- 进位、退位可以放在 `carryRows` 中，格式和 `rows` 一样。

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
2. 按题目裁图后放入 `apps/api/uploads/`，题目 JSON 中引用 `/uploads/xxx.jpg` 或 `http://localhost:3000/uploads/xxx.jpg`。
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
