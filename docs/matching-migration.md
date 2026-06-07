# matching-app 旧题库迁移说明

旧系统项目：`E:\study\matching-app`

旧数据库：`matching_game`

新系统数据库：`quiz`

## 迁移范围

已迁移：

- 题目主数据
- 连线题左右项与正确配对
- 单选题/多选题选项与答案
- 填空题空位与答案
- 古诗填空题，迁为选字答题结构
- 旧试卷与题目关系

未迁移：

- 旧答题记录
- 旧用户作答流水
- 旧考试 session

## 题型转换规则

### 公式

旧系统公式：

```text
\(2x + 3 = 7\)
\[2x + 3 = 7\]
```

迁移为新系统公式：

```text
{{math:2x + 3 = 7}}
```

### 填空占位符

旧系统空：

```text
{_0} {_1} {_2}
```

迁移为新系统空：

```text
{{blank:1}} {{blank:2}} {{blank:3}}
```

### 古诗填空

旧系统是选字填诗，迁移后仍保留选字交互。

新结构示例：

```json
{
  "interaction": "poem_char_fill",
  "poem": {
    "title": "梅花",
    "author": "王安石",
    "dynasty": "宋",
    "lines": ["墙角数枝梅，", "凌寒独自开。"]
  },
  "charPool": ["墙", "角", "数", "枝", "梅"]
}
```

### 连线题

迁移为：

```json
{
  "left": [{ "key": "L1", "text": "左侧内容" }],
  "right": [{ "key": "R1", "text": "右侧内容" }]
}
```

答案：

```json
[{ "left": "L1", "right": "R1" }]
```

学生端通过“先点左侧，再点右侧”的方式作答。

## 命令

导出旧库：

```bash
pnpm migrate:matching:export
```

预检迁移：

```bash
pnpm migrate:matching:preview
```

每种题型导入 1 道样例：

```bash
pnpm migrate:matching:import:sample
```

全量导入：

```bash
pnpm migrate:matching:import:all
```

## 当前迁移结果

旧题总数：68 道。

成功迁入：65 道。

跳过：3 道。

跳过题目：

- 旧题 ID 16：连线题缺少有效 `match_item_id`
- 旧题 ID 17：连线题缺少有效 `match_item_id`
- 旧题 ID 18：连线题缺少有效 `match_item_id`

已迁入旧试卷：

- `[旧系统] 试卷一`

## 输出文件

```text
scripts/migrate-matching/output/matching-export.json
scripts/migrate-matching/output/migration-report.json
scripts/migrate-matching/output/id-map.json
```
