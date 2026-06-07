# Kids Quiz Deployment Guide

This guide describes a single-server production deployment with MySQL, the NestJS API, the built Vite frontend, PM2, and Nginx.

## 1. Build

Run from the repository root:

```bash
pnpm install --frozen-lockfile
pnpm db:generate
pnpm run build
```

Build outputs:

- API: `apps/api/dist/main.js`
- Frontend: `apps/admin-web/dist`

## 2. Environment

Copy the production template and edit all secrets:

```bash
cp .env.production.example .env
cp .env.production.example prisma/.env
```

Required production values:

- `DATABASE_URL`
- `JWT_SECRET`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `UPLOAD_DIR`
- `PUBLIC_API_BASE_URL`

Use a long random `JWT_SECRET`. Do not reuse local development passwords.

## 3. Database

Create the MySQL database and user first, then sync the Prisma schema:

```bash
pnpm db:push
```

For repeatable release operations, take a backup before each schema change:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/backup-db.ps1
```

The backup script reads `.env` and writes SQL dumps to `backups/` by default.

## 4. Upload Directory

The API serves uploaded files from `UPLOAD_DIR` at `/uploads/*`.

Recommended Linux layout:

```bash
sudo mkdir -p /var/lib/kids-quiz/uploads
sudo chown -R appuser:appuser /var/lib/kids-quiz
```

Back up this directory together with the database. Uploaded question images are referenced by URL in question content.

## 5. PM2 Process

Install PM2 on the server, then start the API:

```bash
pm2 start apps/api/dist/main.js --name kids-quiz-api --cwd /srv/kids-quiz
pm2 save
```

Useful commands:

```bash
pm2 logs kids-quiz-api
pm2 restart kids-quiz-api
pm2 status
```

## 6. Nginx Example

This example serves the frontend and reverse-proxies API and upload paths:

```nginx
server {
  listen 80;
  server_name quiz.example.com;

  root /srv/kids-quiz/apps/admin-web/dist;
  index index.html;

  client_max_body_size 20m;

  location /api/ {
    proxy_pass http://127.0.0.1:3000/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location /uploads/ {
    proxy_pass http://127.0.0.1:3000/uploads/;
    proxy_set_header Host $host;
  }

  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

Set `PUBLIC_API_BASE_URL=https://quiz.example.com/api` if uploads should return public API URLs through Nginx.

## 7. Release Checklist

Before switching traffic:

- `pnpm run build` passes.
- `pnpm smoke:e2e` passes against the built API.
- `pnpm smoke:isolation` passes against the built API.
- `.env` and `prisma/.env` contain production values.
- Database backup exists.
- `UPLOAD_DIR` exists and is writable by the API process.
- Nginx serves `apps/admin-web/dist` and proxies `/api/` plus `/uploads/`.
