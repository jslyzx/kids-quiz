$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

function Ensure-EnvFile($Path) {
  if (Test-Path $Path) {
    return
  }

  Copy-Item ".env.example" $Path
  Write-Host "[KidsQuiz] 已创建 $Path，请确认其中的 DATABASE_URL 是否匹配你的 MySQL。" -ForegroundColor Yellow
}

function Invoke-Pnpm($Arguments, $FailureMessage) {
  & pnpm @Arguments
  if ($LASTEXITCODE -ne 0) {
    Write-Host "[KidsQuiz] $FailureMessage" -ForegroundColor Red
    exit $LASTEXITCODE
  }
}

Ensure-EnvFile ".env"
Ensure-EnvFile "prisma/.env"

Write-Host "[KidsQuiz] 检查依赖..." -ForegroundColor Cyan
Invoke-Pnpm @("install") "依赖安装失败，请检查 pnpm install 的输出。"

Write-Host "[KidsQuiz] 同步数据库结构..." -ForegroundColor Yellow
Invoke-Pnpm @("db:push") "数据库同步失败。请确认 MySQL 已启动，并且 .env / prisma/.env 中的 DATABASE_URL 正确。"

Write-Host "[KidsQuiz] 生成 Prisma Client..." -ForegroundColor Yellow
Invoke-Pnpm @("db:generate") "Prisma Client 生成失败，请检查 pnpm db:generate 的输出。"

Write-Host "[KidsQuiz] 初始化完成。" -ForegroundColor Green
