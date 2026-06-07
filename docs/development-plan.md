# Kids Quiz 开发执行计划

## 0. 技术路线

采用 React 技术栈，但首期先把“题库数据模型 + 录题体验 + 题目渲染规则”打牢。

推荐最终工程结构：

```text
kids-quiz/
├── apps/
│   ├── admin-web/      React + Vite + Ant Design
│   ├── student-pwa/    React + Vite + Tailwind + PWA
│   └── api/            NestJS + Prisma + MySQL
├── packages/
│   ├── shared-types/
│   ├── shared-utils/
│   └── question-render/
├── prisma/
└── docs/
```

当前目录先沉淀：

- `docs/`：需求、架构、数据库、题型规范
- `prisma/schema.prisma`：初版数据库模型
- `kidsquiz-question-preview.html`：录题实时预览原型

## 1. 第一阶段：题库与录题闭环

目标：不急着做完整后台，先确认数学题型能录、能预览、能保存。

产物：

1. 数据库设计文档
2. Prisma schema 初版
3. 单页录题预览工具增强版
4. 题目 JSON 规范

验收：

- 能表示大题/通用题干/小题/作答点
- 能表示口算、填空、比较符号、排序、连线、复合题
- 能从可视化录入思路映射到数据库结构
- 能在单页工具里实时预览题目显示效果

## 2. 第二阶段：后端 API MVP

目标：搭建 NestJS + Prisma API。

模块：

- auth：管理员登录
- subjects：学科
- knowledge-points：知识点
- question-groups：大题/题组
- questions：小题
- answer-slots：作答点
- papers：试卷
- students：学生
- answers：答题记录

优先接口：

```text
POST /api/admin/auth/login
POST /api/admin/question-groups
GET  /api/admin/question-groups/:id
POST /api/admin/questions
POST /api/student/answers/submit
GET  /api/student/papers/:id
```

## 3. 第三阶段：后台录题 MVP

目标：后台可以录入数学题。

页面：

- 登录页
- 题组列表
- 新建/编辑题组
- 小题编辑器
- 实时预览

首期题型：

- 口算题组
- 填空题
- 比较符号题
- 排序题
- 连线题
- 复合题

## 4. 第四阶段：学生端刷题 MVP

目标：iPad 上能完成一套试卷。

页面：

- 学生选择
- 试卷/练习入口
- 答题页
- 结果页
- 错题页

## 5. 第五阶段：增强功能

- KaTeX 数学公式
- 草稿板
- TTS 朗读
- 成就系统
- 学习报告
- 题目导入导出
