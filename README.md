# Kids Quiz 家庭练习系统

Kids Quiz 是一个给孩子使用的本地练习系统，支持家长录题、组卷、孩子答题、错题重练、学习报告、奖励中心和题库导出。

## 当前能力

- 题库管理
  - 填空题、口算题组、比较符号题、单选题、多选题、排序题、连线题、复合题
  - 口算题批量生成
  - 填空题批量录入
  - 题目 JSON 批量导入、校验、预览、去重提示
  - 导入后自动生成验收试卷
  - 题库体检中心：检查坏题、缺答案、缺解析、疑似重复、旧格式残留
  - 修复队列：从体检中心批量标记需修复题目，进入编辑页逐题处理
  - 选择题批量解析
  - 复合题批量录入
  - 题干/材料图片上传
  - 富文本解题解析，支持图片和公式
  - 表格填空题 tableFill 展示与答题
  - 保存前基础校验
  - 题目年级、难度、标签/知识点
  - 题库 JSON 导出
  - 命令行导入校验：`pnpm import:validate -- <file.json> --check-assets`

- 试卷管理
  - 新建试卷
  - 添加题组
  - 调整题目顺序
  - 智能组卷
  - 打印试卷和答案页

- 孩子端
  - 昵称和头像
  - 答题进度
  - 草稿自动保存和恢复
  - 提交前未完成检查
  - 自动定位第一个未填写答案
  - 练习完成结果页
  - 下一步推荐

- 错题系统
  - 当前未掌握错题
  - 错题重练
  - 按试卷筛选
  - 按知识点筛选
  - 错题掌握率
  - 错题打印

- 学习数据
  - 练习记录
  - 学习报告
  - 家长仪表盘
  - 知识点正确率
  - 薄弱知识点推荐
  - 今日任务
  - 奖励中心和徽章

## 技术栈

- Monorepo：pnpm workspace
- 前端：React + Vite + TypeScript
- 后端：NestJS + Prisma
- 数据库：MySQL
- ORM：Prisma

## 目录结构

```text
apps/
  admin-web/          前端 React/Vite 应用
  api/                后端 NestJS API
packages/
  question-render/    题目渲染包
  shared-types/       共享类型
prisma/
  schema.prisma       数据库模型
scripts/
  start-dev.ps1       一键启动开发环境
  setup-db.ps1        初始化/同步数据库
  backup-db.ps1       备份 MySQL 数据库
```

生产部署说明见 [docs/deployment.md](docs/deployment.md)。

## 环境要求

- Node.js 18+
- pnpm
- MySQL

安装 pnpm：

```bash
npm i -g pnpm
```

如果新电脑执行 `pnpm install` 时出现：

```text
ERR_PNPM_IGNORED_BUILDS Ignored build scripts
```

这是 pnpm 的依赖构建脚本安全提示。项目已在 `pnpm-workspace.yaml` 白名单中允许 Prisma、esbuild 等必要依赖。处理方式：

```bash
pnpm install
pnpm db:generate
```

如果仍然提示需要审批，可以手动执行一次：

```bash
pnpm approve-builds
```

在交互列表里勾选 `@prisma/client`、`@prisma/engines`、`prisma`、`esbuild`、`@nestjs/core`，确认后再运行：

```bash
pnpm install
pnpm db:generate
```

## 配置数据库

复制环境变量示例：

```bash
copy .env.example .env
copy .env.example prisma\.env
```

然后修改 `.env` 和 `prisma/.env` 中的数据库配置。

推荐最终确保存在：

```env
DATABASE_URL="mysql://用户名:密码@主机:3306/quiz"
```

> 注意：不要把真实数据库密码提交到代码仓库。

## 初始化数据库

```bash
pnpm setup
```

或者手动执行：

```bash
pnpm install
pnpm db:push
pnpm db:generate
```

## 一键启动开发环境

Windows PowerShell 下运行：

```bash
pnpm dev
```

它会自动：

1. 检查依赖
2. 同步数据库结构
3. 生成 Prisma Client
4. 打开 API 服务窗口
5. 打开前端服务窗口

启动后访问：

```text
http://127.0.0.1:5173
```

API 地址：

```text
http://localhost:3000
```

健康检查：

```text
http://localhost:3000/health
```

## 手动启动

如果不使用一键脚本，可以分别运行：

```bash
pnpm dev:api
pnpm dev:admin
```

## 构建验证

```bash
pnpm run build
```

当前构建会检查：

- shared-types
- question-render
- API
- admin-web

端到端烟测：

```bash
pnpm smoke:e2e
```

烟测会自动完成：新建题目 → 组卷 → 提交错题 → 错题本解析验证 → 清理测试数据。

完整回归烟测：

```bash
pnpm smoke:all
```

完整烟测会先运行生产构建，再启动构建后的 API，并依次验证端到端题目流程、导入批次、数据隔离、奖励兑换、娱乐中心和浏览器 UI 流程。

部署 smoke：

```bash
WEB_BASE=https://quiz.example.com API_BASE=https://quiz.example.com/api pnpm smoke:deployment
```

部署 smoke 用于生产式 Nginx/API 分离验收，会检查 API 健康、前端静态资源、SPA 深链 fallback、`/uploads` 代理路径，以及跨域部署时的 CORS 预检。提供 `DEPLOY_SMOKE_ADMIN_USERNAME` 和 `DEPLOY_SMOKE_ADMIN_PASSWORD` 时，还会验证管理员登录。

浏览器 UI 烟测：

```bash
pnpm smoke:ui
```

UI 烟测会自动创建临时账号，验证导入页校验提示、真实 Excel 文件上传、导入批次列表、验收试卷生成和奖励申请/审批流程，结束后清理测试数据。
它使用本机 Chrome/Edge；如果脚本找不到浏览器，可以通过 `CHROME_PATH` 指定浏览器可执行文件。

## 数据库备份

运行：

```bash
pnpm db:backup
```

备份文件会输出到：

```text
backups/quiz-年月日-时分秒.sql
```

要求本机能访问 `mysqldump`。如果命令不存在，请把 MySQL 的 `bin` 目录加入 PATH。

恢复备份示例：

```powershell
mysql -u root -p quiz < backups\quiz-年月日-时分秒.sql
```

建议在批量导入 OCR 题目、执行数据库迁移、全量修改题库前先执行一次 `pnpm db:backup`。

## 题目 JSON 导入

入口：

```text
家长后台 → 题库管理 → 导入题目 JSON
```

推荐流程：

1. 让 OCR / AI 识题工具按 `docs/question-json-import-format.md` 输出 JSON。
2. 如需从 PDF 抽图，运行 `pnpm pdf:extract-images -- <paper.pdf> _pdf_images/<paper-name>`，裁图后放入 `apps/api/uploads/`。
3. 在导入前运行 `pnpm import:validate -- <file.json> --check-assets --write-normalized=<normalized.json>`。
4. 在导入页粘贴 JSON 或上传 `.json` 文件。
5. 点击校验，先看错误、预览和疑似重复提示。
6. 每种题型先导入 1 道。
7. 点击「生成验收试卷」，进入孩子端逐题验证展示、交互、图片和答案。
8. 导入后进入「题库体检中心」，用 `待验收` 和 `需修复` 标签完成质量闭环。
9. 无误后再全量导入。

导入页已支持：

- 旧公式 `\(...\)`、`\[...\]` 自动转换为 `{{math:...}}`
- 旧空位 `{_0}` 自动转换为新空位
- 古诗选字题自动转换为孩子端选字答题结构
- 成功导入的题目自动追加 `待验收` 标签
- 单题 JSON 编辑、重新校验、写回规范格式
- 根据题干/答案/题型进行疑似重复提示
- 导入后生成验收试卷

详细格式见：

```text
docs/question-json-import-format.md
```

## 题库体检中心

入口：

```text
家长后台 → 题库体检
```

用于批量检查题库质量，尤其适合在 OCR / AI 批量导入之后做验收。

当前会检查：

- 题组没有小题
- 小题题干为空
- 没有答案槽
- 正确答案为空
- 填空空位和答案数量不匹配
- 答案槽 key 重复
- 选择题没有选项
- 选择题答案不在选项中
- 连线题答案结构异常
- 仍包含旧格式公式或旧空位
- 缺少标签/知识点
- 缺少年级
- 缺少解题解析
- 疑似重复题

体检页支持：

- 按严重程度筛选
- 按问题类型筛选
- 快捷筛选：缺答案、无解析、无标签、疑似重复、旧格式残留
- 快捷筛选 `待验收` 题
- 按题组 ID / 问题描述搜索
- 一键跳转编辑题组
- 选择当前筛选题组
- 批量启用
- 批量停用
- 批量追加标签
- 一键把 `待验收` 题生成验收试卷
- 按当前已选题组生成验收试卷
- 验收通过后批量移除 `待验收` 标签
- 验收失败后批量标记 `需修复`
- 修复队列快捷筛选、选中和进入编辑
- 修复完成后批量移除 `需修复` 标签
- 从修复队列进入编辑页后，顶部会显示队列进度；支持“保存并标记修复完成”“保存并编辑下一道”
- 疑似重复题支持一键停用重复旧题/重复新题，只保留一个启用版本
- 修复建议报告可视化：按优先级展示今日建议处理顺序
- 支持复制体检摘要、导出带建议和分类汇总的体检报告 JSON

## 常见问题

### 1. 页面顶部提示“后端 API 未连接”

说明前端启动了，但 API 没启动。运行：

```bash
pnpm dev:api
```

或者直接运行：

```bash
pnpm dev
```

### 2. 数据库连接失败

检查：

- MySQL 是否启动
- 数据库是否已创建
- `.env` / `prisma/.env` 的 `DATABASE_URL` 是否正确
- 密码中的特殊字符是否 URL 编码

### 3. Prisma Client 报错

执行：

```bash
pnpm db:generate
```

如果 Windows 报 `EPERM: operation not permitted, rename ... query_engine-windows.dll.node`，通常是旧 API 进程正在占用 Prisma DLL。先关闭项目里打开的 API PowerShell 窗口，或结束 `nest start --watch` / `apps\api\dist\main` 相关 Node 进程，再执行 `pnpm db:generate`。

`pnpm dev` 和 `pnpm setup` 已在生成 Prisma Client 前自动停止本项目旧 API 进程，减少 DLL 锁定。

如果数据库结构没有同步，执行：

```bash
pnpm db:push
```

### 4. 修改 schema 后怎么办

执行：

```bash
pnpm db:push
pnpm db:generate
pnpm run build
```

## 推荐使用流程

1. 家长进入「家长后台」
2. 在「题库管理」录入题目
3. 如果题量较大，使用「导入题目 JSON」批量导入
4. 在「试卷管理」组卷
5. 孩子从「孩子首页」进入今日任务或练习
6. 练习完成后查看结果
7. 有错题时进入错题重练
8. 家长查看学习报告和知识点统计

## 后续可继续开发

- 更细的知识点体系
- 正式部署到服务器


