$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

Write-Host "[KidsQuiz] 工作目录: $root" -ForegroundColor Cyan

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  Write-Host "[KidsQuiz] 未检测到 pnpm，请先安装 pnpm：npm i -g pnpm" -ForegroundColor Red
  exit 1
}

if (-not (Test-Path "node_modules")) {
  Write-Host "[KidsQuiz] 首次启动，正在安装依赖..." -ForegroundColor Yellow
  pnpm install
}

Write-Host "[KidsQuiz] 同步数据库结构..." -ForegroundColor Yellow
pnpm db:push

Write-Host "[KidsQuiz] 生成 Prisma Client..." -ForegroundColor Yellow
pnpm db:generate

$apiCmd = "cd /d `"$root`" && pnpm dev:api"
$webCmd = "cd /d `"$root`" && pnpm dev:admin"

Write-Host "[KidsQuiz] 正在启动 API: http://localhost:3000" -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", $apiCmd -WindowStyle Normal

Start-Sleep -Seconds 2

Write-Host "[KidsQuiz] 正在启动前端: http://127.0.0.1:5173" -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", $webCmd -WindowStyle Normal

Write-Host ""
Write-Host "[KidsQuiz] 已启动两个开发窗口：API 和前端。" -ForegroundColor Green
Write-Host "[KidsQuiz] 浏览器访问: http://127.0.0.1:5173" -ForegroundColor Green
Write-Host "[KidsQuiz] 如需停止服务，关闭新打开的两个 PowerShell 窗口即可。" -ForegroundColor Gray
