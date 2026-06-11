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

function Stop-ProjectApiProcesses {
  $projectPath = [Regex]::Escape($root.Path)
  $processes = Get-CimInstance Win32_Process | Where-Object {
    $_.Name -match 'node|cmd|powershell' -and
    $_.CommandLine -match $projectPath -and
    ($_.CommandLine -match 'nest.*start|apps\\api\\dist\\main|pnpm dev:api')
  }

  foreach ($process in $processes) {
    if ($process.ProcessId -eq $PID) {
      continue
    }
    Write-Host "[KidsQuiz] 停止旧 API 进程 $($process.ProcessId)，避免 Prisma query_engine-windows.dll.node 被锁定。" -ForegroundColor Yellow
    Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
  }
}

Ensure-EnvFile ".env"
Ensure-EnvFile "prisma/.env"

Write-Host "[KidsQuiz] 检查依赖..." -ForegroundColor Cyan
Invoke-Pnpm @("install") "依赖安装失败，请检查 pnpm install 的输出。"

Stop-ProjectApiProcesses

Write-Host "[KidsQuiz] 同步数据库结构..." -ForegroundColor Yellow
Invoke-Pnpm @("db:push") "数据库同步失败。请确认 MySQL 已启动，并且 .env / prisma/.env 中的 DATABASE_URL 正确。"

Write-Host "[KidsQuiz] 生成 Prisma Client..." -ForegroundColor Yellow
Invoke-Pnpm @("db:generate") "Prisma Client 生成失败，请检查 pnpm db:generate 的输出。"

Write-Host "[KidsQuiz] 初始化完成。" -ForegroundColor Green
