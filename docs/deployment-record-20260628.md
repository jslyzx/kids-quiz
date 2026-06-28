# Kids Quiz 上线报告

- **上线日期**：2026-06-28
- **访问地址**：https://quiz.little-scott.online
- **服务器**：华为云 ECS（Ubuntu 22.04.2 LTS，主机名 `hcss-ecs-0b05`，公网 IP `115.175.36.47`）
- **状态**：✅ 已上线运行

---

## 一、最终架构

```
用户浏览器 (HTTPS)
    │
    ▼
Cloudflare（橙色云朵代理）
├─ DNS：quiz.little-scott.online → CF 节点（隐藏真实 IP）
├─ SSL：Configuration Rule 单独把 quiz 设为 Flexible
│        （全局保持 Full/strict，不影响其它二级域名）
└─ CDN 缓存
    │
    ▼
华为云 ECS 115.175.36.47
├─ Nginx (:80，宝塔管理)
│  ├─ location ^~ /api/      → 反代到 :3000（剥 /api 前缀）
│  ├─ location ^~ /uploads/  → 反代到 :3000/uploads/
│  ├─ location ~* 静态资源    → dist 缓存 7d
│  └─ location /             → SPA 回退 index.html
│
├─ PM2 → kids-quiz-api (NestJS :3000)
│  ├─ pm2-root.service（开机自启 enabled）
│  └─ 崩溃自动重启
│
├─ MySQL 8.0.35（库名 quiz）
│  ├─ 18 份试卷 / 131 题组 / 407 题 / 2 学生
│  └─ 答题记录已清空（重置为初始状态）
│
└─ /www/wwwroot/kids-quiz-data/
   ├─ uploads/（16 张题目图片）
   └─ backups/（2 份数据库备份）
```

**三层关键路径**：`Cloudflare → Nginx → API`，各自职责清晰。

---

## 二、完整部署步骤

> 完整命令均来自部署过程实测，可直接复用。

### 第 1 步：服务器环境准备

```bash
# 系统：Ubuntu 22.04，宝塔面板已安装
# 安装 Node 22 + pnpm + pm2
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
npm install -g pnpm@11.4.0 pm2

# 验证（三行版本号）
node -v && pnpm -v && pm2 -v
```

### 第 2 步：部署代码

```bash
cd /www/wwwroot
git clone https://github.com/jslyzx/kids-quiz.git kids-quiz
cd kids-quiz
```

### 第 3 步：配置环境变量

在项目根目录 `.env`（API/Prisma 读）和 `apps/admin-web/.env`（Vite 构建读）分别配置：

```bash
# 项目根目录 .env（后端用）
cat > .env << 'EOF'
NODE_ENV=production
PORT=3000
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=你的密码
DB_NAME=quiz
DATABASE_URL="mysql://root:你的密码@127.0.0.1:3306/quiz"
ADMIN_USERNAME=admin
ADMIN_PASSWORD=你的强密码
JWT_SECRET=你的JWT密钥
JWT_EXPIRES_IN=7d
STUDENT_JWT_EXPIRES_IN=30d
UPLOAD_DIR=/www/wwwroot/kids-quiz-data/uploads
PUBLIC_API_BASE_URL=https://quiz.little-scott.online/api
VITE_API_BASE_URL=/api
PADDLEOCR_TOKEN=你的token
EOF

# apps/admin-web/.env（Vite 构建用，关键！）
cat > apps/admin-web/.env << 'EOF'
VITE_API_BASE_URL=/api
EOF
```

### 第 4 步：备份数据库（部署前必做）

```bash
mkdir -p /www/wwwroot/kids-quiz-data/backups
mysqldump -uroot -p'密码' quiz > /www/wwwroot/kids-quiz-data/backups/quiz-backup-$(date +%Y%m%d).sql
```

### 第 5 步：安装依赖 + 构建

```bash
pnpm install --frozen-lockfile
pnpm db:generate
pnpm run build
```

### 第 6 步：迁移 uploads 图片

```bash
mkdir -p /www/wwwroot/kids-quiz-data/uploads
cp apps/api/uploads/* /www/wwwroot/kids-quiz-data/uploads/
```

### 第 7 步：PM2 启动 API + 开机自启

```bash
pm2 start apps/api/dist/main.js --name kids-quiz-api --cwd /www/wwwroot/kids-quiz
pm2 save
pm2 startup systemd   # 按提示执行返回的命令
```

### 第 8 步：Nginx 配置（宝塔建站点 + 反代规则）

宝塔面板 → 网站 → 添加站点（域名 `quiz.little-scott.online`，根目录指向 `dist`，纯静态）。
然后覆盖站点 Nginx 配置：

```bash
cat > /www/server/panel/vhost/nginx/quiz.little-scott.online.conf << 'EOF'
server {
    listen 80;
    server_name quiz.little-scott.online;
    root /www/wwwroot/kids-quiz/apps/admin-web/dist;
    index index.html;
    client_max_body_size 20m;

    location = /health {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # ^~ 强制优先，避免被静态资源正则规则抢先匹配
    location ^~ /api/ {
        proxy_pass http://127.0.0.1:3000/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 300s;
    }

    location ^~ /uploads/ {
        proxy_pass http://127.0.0.1:3000/uploads/;
        proxy_set_header Host $host;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?)$ {
        expires 7d;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }

    access_log /www/wwwlogs/quiz.little-scott.online.log;
    error_log /www/wwwlogs/quiz.little-scott.online.error.log;
}
EOF

nginx -t && nginx -s reload
```

### 第 9 步：Cloudflare 配置

1. **DNS**：添加 A 记录 `quiz` → `115.175.36.47`，代理状态橙色云朵（Proxied）
2. **SSL 规则**：Rules → Configuration Rules → 创建规则
   - 匹配：`Hostname equals quiz.little-scott.online`
   - 设置：SSL = **Flexible**
   - 部署（只影响 quiz，全局保持 Full/strict 不影响其它域名）

### 第 10 步：改 admin 密码 + 清缓存

```bash
# 改 admin 密码（进 API 目录，bcryptjs 在那）
cd /www/wwwroot/kids-quiz/apps/api
node -e "
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const p = new PrismaClient();
(async () => {
  const hash = await bcrypt.hash('你的新密码', 10);
  await p.user.update({ where: { username: 'admin' }, data: { passwordHash: hash } });
  console.log('✅ admin 密码已更新');
  await p.\$disconnect();
})();"
```

Cloudflare → Caching → Configuration → **Purge Everything**（清除缓存）

---

## 三、部署期间遇到的问题与解决方法

| # | 问题 | 根因 | 解决方法 |
|---|---|---|---|
| 1 | `pnpm` 报 `ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite` | pnpm 11.4 需要 Node 22+，但装的是 Node 20 | 卸载 Node 20，装 Node 22 |
| 2 | 宝塔建站点后提示「未安装 Web 服务器」 | 服务器只有宝塔面板，没装 Nginx | 宝塔软件商店安装 Nginx |
| 3 | 宝塔 SSL 文件验证报错「root 指令下，以保证优先级」 | well-known 配置文件为空 | 手动创建 `well-known/quiz.conf` |
| 4 | 宝塔 SSL 申请失败（`get_auths` Traceback） | 宝塔连 Let's Encrypt 超时 | 改用 Cloudflare Flexible SSL |
| 5 | 担心改全局 SSL 影响 blog 等其它域名 | CF SSL 模式是 Zone 级别 | 用 Configuration Rule 只给 quiz 设 Flexible |
| 6 | 改 Nginx 配置后 reload，但反代仍 404 | Nginx master 进程没重启，旧配置仍在用 | `nginx -s stop` + 手动 `start`，强制重启 master |
| 7 | 首页报「后端没起」，但 API 实际正常 | 构建产物 `dist` 是用错误的 `VITE_API_BASE_URL`（空值）构建的 | 在 `apps/admin-web/` 下建 `.env`，重新构建 |
| 8 | `pnpm run build` 报 `ENOTDIR: .user.ini` | 宝塔自动创建的 `.user.ini` 被 chattr 锁定 | `chattr -i` 解锁后删除 |
| 9 | 图片返回 404（API 直连正常） | Nginx 静态资源正则 `\.png$` 优先级高于 `/uploads/` 前缀匹配 | `/uploads/` 改用 `location ^~` 强制优先 |
| 10 | 服务器内测试 curl 返回 404（误判） | curl 没带 `Host: quiz.little-scott.online` 头 | curl 加 `-H "Host: ..."` 指定 |
| 11 | 修复 Nginx 后图片仍显示裂图 | Cloudflare 缓存了修复前的 404 响应 | Cloudflare → Purge Everything 清缓存 |

---

## 四、最终产物清单

### 4.1 线上服务

| 组件 | 位置/地址 |
|---|---|
| 访问地址 | https://quiz.little-scott.online |
| 前端构建产物 | `/www/wwwroot/kids-quiz/apps/admin-web/dist/` |
| API 进程 | PM2 `kids-quiz-api`（:3000） |
| 数据库 | MySQL `quiz` 库（18 试卷 / 131 题组 / 407 题） |
| 图片目录 | `/www/wwwroot/kids-quiz-data/uploads/`（16 张） |
| 备份目录 | `/www/wwwroot/kids-quiz-data/backups/` |

### 4.2 关键配置文件

| 文件 | 作用 |
|---|---|
| `/www/wwwroot/kids-quiz/.env` | API 运行时 + Prisma 数据库连接 |
| `/www/wwwroot/kids-quiz/apps/admin-web/.env` | Vite 构建期读取（`VITE_API_BASE_URL=/api`） |
| `/www/server/panel/vhost/nginx/quiz.little-scott.online.conf` | Nginx 反代规则 |
| PM2 进程快照 | `~/.pm2/dump.pm2`（开机自启依据） |
| `/etc/systemd/system/pm2-root.service` | PM2 开机自启服务 |

### 4.3 Cloudflare 配置

- DNS A 记录：`quiz` → `115.175.36.47`（Proxied 橙色云朵）
- Configuration Rule：`quiz.little-scott.online` → SSL Flexible
- 全局 SSL：保持 Full/strict（其它域名不受影响）

### 4.4 端到端验证结果

| 测试项 | 结果 |
|---|---|
| 首页 `https://quiz.little-scott.online/` | ✅ 200 |
| API 健康检查 `/api/health` | ✅ 200（`{"ok":true,"database":"ok"}`） |
| 图片 `/uploads/xxx.png` | ✅ 200（image/png） |
| 前端 JS/CSS 资源 | ✅ 200 |
| admin 登录 | ✅（已改强密码） |
| PM2 开机自启 | ✅ enabled |

---

## 五、待办事项

| 优先级 | 事项 | 说明 |
|---|---|---|
| 🔴 高 | **关闭 MySQL 3306 公网端口** | 当前 `root@%` 对公网开放，任何人可爆破。华为云安全组删除 3306 入站规则即可，对应用零影响。 |
| 🟡 中 | **补 4 道测量题答案** | 试卷 p102「数海探索 第一单元」的 4 道图依赖题答案为占位值「待校对」（小刀长、线段长、长方形、智慧题）。登录后台对照原图补全。 |
| 🟡 中 | **SSL 升级为端到端加密**（可选） | 当前 Flexible 模式 CF→服务器走 HTTP。后续可用 acme.sh + CF DNS API 申请证书升级到 Full strict。 |
| 🟢 低 | **uploads 缓存策略优化**（可选） | Cloudflare 默认缓存图片，源站改图后需清缓存。可加 Cache Rule 让 `/uploads/` 走较短缓存时间或绕过缓存。 |

---

## 六、日常运维速查

```bash
# 查看应用状态
pm2 list

# 查看实时日志
pm2 logs kids-quiz-api --lines 50

# 重启 API
pm2 restart kids-quiz-api

# 更新代码后重新部署
cd /www/wwwroot/kids-quiz
git pull
pnpm install --frozen-lockfile
pnpm run build
pm2 restart kids-quiz-api

# 数据库备份
mysqldump -uroot -p'密码' quiz > /www/wwwroot/kids-quiz-data/backups/quiz-$(date +%Y%m%d).sql

# 清 Cloudflare 缓存
# Cloudflare → Caching → Configuration → Purge Everything
```

---

**报告生成时间**：2026-06-28
