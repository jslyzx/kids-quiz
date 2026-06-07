# Kids Quiz 数据库设计 v0.1

## 设计核心

数学题库不要用“一题一个答案”的简单模型，而是采用：

```text
QuestionGroup  大题 / 题组 / 复合材料
Question       小题
AnswerSlot     作答点：空、选择、排序、连线、比较符号
```

原因：

- 一道大题可包含多个小题。
- 一道小题可包含多个空。
- 连线题、排序题、比较符号题都可以统一为作答点。
- 错题本、部分得分、薄弱点统计更准确。

## 核心实体

### User

管理员账户。首期可以只有家长/教师角色。

### Student

学生档案。学生端免账号密码登录，但必须通过学生会话或可选 PIN 识别身份。

### Subject

学科，例如数学、语文。

### KnowledgePoint

知识点树，例如：数学 / 万以内数的认识 / 比较大小。

### QuestionGroup

大题或复合题材料。

典型例子：

```text
一、直接写出得数。
二、填空题。
看图回答问题。
```

关键字段：

- `title`：大题标题
- `commonStem`：通用题干
- `content`：通用材料 JSON，例如表格、图片、布局配置
- `groupType`：mental_math / fill_blank_group / composite / matching_group

### Question

小题。

关键字段：

- `groupId`：所属大题，可空
- `questionType`：fill_blank / calculation / matching / ordering / single_choice 等
- `stem`：小题题干，空位用 `{{blank:1}}`
- `content`：题型专用 JSON，例如排序选项、连线左右列
- `score`：小题分值

### AnswerSlot

作答点。

关键字段：

- `slotKey`：blank_1 / answer / match_1
- `slotType`：text / number / choice / match / order / compare_symbol
- `correctAnswer`：正确答案 JSON
- `answerRule`：判题规则 JSON

## 题型建模

### 口算题组

```text
QuestionGroup: 一、直接写出得数。
  Question: 20×3=
    AnswerSlot: answer = 60
  Question: 48÷6=
    AnswerSlot: answer = 8
```

### 多空填空

```text
stem: 一个四位数，从右边起第一位是{{blank:1}}位，第三位是{{blank:2}}位。
AnswerSlot blank_1 = 个
AnswerSlot blank_2 = 百
```

### 比较符号

本质是填空，slot 类型为 compare_symbol。

```text
stem: 30×5 {{blank:1}} 150
AnswerSlot blank_1 = =
answerRule.allowedValues = [>, <, =]
```

### 排序题

```text
Question.content.items = [①1200, ②980, ③1000, ④1500, ⑤890]
AnswerSlot answer = [4, 1, 3, 2, 5]
```

### 连线题

```text
Question.content.left = [3×4, 5×6]
Question.content.right = [12, 30]
AnswerSlot answer = [{left:L1,right:R1}, ...]
```

### 复合题

```text
QuestionGroup.commonStem = 通用材料
QuestionGroup.content = 图片/表格
Question[] = 多个小题
```

错题本收录小题，但展示时带上 QuestionGroup 的通用材料。

## 答题记录

`StudentAnswer` 保存一次小题提交结果。

- `answerData`：学生提交 JSON
- `correctData`：每个作答点是否正确
- `isCorrect`：是否全对
- `score/maxScore`：部分得分

如需要更细分析，可使用 `StudentAnswerDetail` 按 slot 记录。

## 后续扩展

- QuestionMedia：题目图片/音频
- Paper/PaperQuestion：试卷组卷
- Task：任务
- Achievement：成就
- ImportBatch：导入记录
