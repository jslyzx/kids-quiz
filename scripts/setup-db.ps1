$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

Write-Host "[KidsQuiz] 检查依赖..." -ForegroundColor Cyan
pnpm install

Write-Host "[KidsQuiz] 同步数据库结构..." -ForegroundColor Yellow
pnpm db:push

Write-Host "[KidsQuiz] 生成 Prisma Client..." -ForegroundColor Yellow
pnpm db:generate

Write-Host "[KidsQuiz] 初始化完成。" -ForegroundColor Green
