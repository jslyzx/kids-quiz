---
name: import-paper
description: 把数学试卷（PDF / Word / 文本）导入 kids-quiz 题库并建试卷。当用户说"导入试卷""录入题目""把这份卷子进库""这张PDF导入"或发来 PDF/Word/JSON 题目文件时使用——涵盖取源、OCR/转录、构造 JSON、校验、事务入库、建试卷、读回校验的完整流程。
---

# 导入试卷到题库

把一份数学试卷转成结构化题目并入库。流程必须**全程规范**：用校验脚本把关格式，用事务脚本入库，每次都建批次和试卷，不直连库裸写。

## 工作流程

### 第 1 步：取源（拿到题目的准确文字）

源文件可能是 PDF（扫描件）、Word（.docx）、或纯文本。目标始终是拿到**准确的题目文字和数字**。

- **Word / 文本**：直接读 `.docx`（解压取 `word/document.xml`，`w:tab` 当分隔符）或直接读文本。这是最可靠的。
- **PDF 扫描件**：`pdftotext` 通常抽不到字。**不要用 `extract-pdf-images.mjs`**（它只抽 PDF 内嵌的图片碎片，会丢页面上下文、漏题）。改用本 skill 自带的高清整页渲染脚本：

  ```bash
  export PATH="/c/Users/82120/AppData/Local/Programs/Python/Python312:/c/Users/82120/AppData/Local/Programs/Python/Python312/Scripts:$PATH"
  python .agents/skills/import-paper/scripts/render_pdf_pages.py <input.pdf> <output_dir> [dpi]
  # 默认 300 DPI；模糊区域可指定更高 dpi（如 450）重渲染
  ```

  渲染出每页高清 PNG 后，用 Read 直接看图辨认。**这是关键**：低分辨率图会把 105 读成 45、8 读成 3。300+ DPI 下数字清晰，肉眼即可准确辨认。若某区域仍模糊，提高 dpi 重渲染该页，或裁剪放大局部。
- **PDF 有文字层**：先试 `pdftotext -layout <pdf> -`，能抽到字就直接用，不必渲染。抽不到字才是扫描件，走上面的渲染流程。
- **关键纪律**：数学题数字错一个就全错。靠图片辨认得到的题目，导入前必须把内容列给用户核对；源 PDF 缺字/被裁切的区域（如某题右侧被截）**不要瞎猜**，标记跳过或待核对，让用户补全。宁可多确认一轮，也不要把没核对的数字入库。

### 第 2 步：查重

写库前先用 `prisma` 查 papers / question_groups 是否已有同名记录，避免重复导入。

```js
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const dup = await prisma.paper.findFirst({ where: { title: '试卷标题' } });
// 重复就停下来，先问用户：删除旧的还是改名新的
```

### 第 3 步：构造 imports/*.json

按 **`docs/question-json-import-format.md`** 的格式构造（这份文档是权威格式参考）。题型映射：

| 题型 | import type | 说明 |
|---|---|---|
| 口算/竖式计算 | `calculation_group` | `items: [{stem, answer}]`，竖式连加连减合并成一道算式 |
| 填空/解决问题/思维题 | `composite_group` | `commonStem` + `children`，每个是 fill_blank + `{{blank:n}}` |
| 单题（如数字谜） | `question` | 含 `content.columnArithmetic` 等 |

**判分规则**：纯计算题 `answer_slots` 里 `slot_key="answer"`；填空题每空一个 `blank_n`，`correct_answer` 填标准答案。竖式数字谜等规则判分题见格式文档第 393 行起的"竖式算谜题"章节。

### 第 4 步：校验（0 error 才能继续）

```bash
pnpm import:validate imports/你的文件.json
```

有 error 必须修到 0。warning 可酌情（如"需校对""需补图"是预期的）。

### 第 5 步：事务入库（规范脚本）

**只用项目脚本，不要直连库裸写 SQL**：

```bash
node .agents/skills/import-paper/scripts/import-question-paper.mjs imports/你的文件.json --paper "试卷标题"
```

脚本做的事（全程一个 `$transaction`，失败即回滚）：
1. `import_batches` 建批次
2. `question_groups` → `questions` → `answer_slots` → `question_options`
3. `papers` 建试卷 + `paper_questions` 挂题组
4. 读回校验

常用选项：
- `--dry-run`：只打印计划不写库（先跑这个确认无误）
- `--paper "标题"`：指定试卷名（默认从题组标题推导）
- `--no-paper`：只导题组不建试卷（一般不用，**默认总建试卷**）
- `--owner 1 --subject 1`：指定 owner/subject（默认都是 1）

### 第 6 步：读回校验

脚本会自动读回校验（题量、答案槽数）。导入后建议在前端预览页打开试卷确认显示正常（`pnpm dev:admin` 后访问试卷预览）。

## 失败处理

- 事务中途失败会自动回滚，不留残数据。
- 如果之前有残缺数据（比如直连库导入了一半），用 prisma 事务清理后重导，不要在残数据上补丁。
- 清理时按关系顺序删：`answer_slots` → `question_options` → `questions` → `paper_questions` → `question_groups` → `papers` → `import_batches`。

## 不要做的事

- ❌ 直连库裸写 SQL 逐条 INSERT（容易漏字段、留残数据、缺批次和试卷）
- ❌ 跳过 `import:validate` 直接入库
- ❌ 不查重就导入（产生重复题组）
- ❌ 完全相信 OCR/视觉识别的数字就入库（必须用户核对）
- ❌ 只导题组不建试卷（用户已确认每次都建试卷）
