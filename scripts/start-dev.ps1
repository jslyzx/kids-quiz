$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

Write-Host "[KidsQuiz] 工作目录: $root" -ForegroundColor Cyan

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  Write-Host "[KidsQuiz] 未检测到 pnpm，请先安装 pnpm：npm i -g pnpm" -ForegroundColor Red
  exit 1
}

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

function Stop-ProjectDevProcesses {
  $projectPath = [Regex]::Escape($root.Path)
  $patterns = @(
    '@kids-quiz/api',
    '@kids-quiz/admin-web',
    'apps\\api',
    'apps\\admin-web',
    'nest.*start',
    'vite',
    'pnpm(\.cmd)?\s+dev:(api|admin)',
    'prisma\s+generate',
    'query_engine-windows\.dll\.node'
  )

  $processes = Get-CimInstance Win32_Process | Where-Object {
    if (-not $_.CommandLine) {
      return $false
    }

    if ($_.ProcessId -eq $PID -or $_.ParentProcessId -eq $PID) {
      return $false
    }

    if ($_.Name -notmatch 'node|cmd|powershell|esbuild') {
      return $false
    }

    if ($_.CommandLine -notmatch $projectPath) {
      return $false
    }

    foreach ($pattern in $patterns) {
      if ($_.CommandLine -match $pattern) {
        return $true
      }
    }

    return $false
  }

  foreach ($process in $processes) {
    Write-Host "[KidsQuiz] 停止旧开发进程 $($process.ProcessId)，避免端口冲突或 Prisma query_engine-windows.dll.node 被锁定。" -ForegroundColor Yellow
    Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
  }
}

function Ensure-RestartManagerType {
  if ("RestartManager" -as [type]) {
    return
  }

  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class RestartManager {
  [StructLayout(LayoutKind.Sequential)]
  public struct RM_UNIQUE_PROCESS {
    public int dwProcessId;
    public System.Runtime.InteropServices.ComTypes.FILETIME ProcessStartTime;
  }

  public enum RM_APP_TYPE {
    RmUnknownApp = 0,
    RmMainWindow = 1,
    RmOtherWindow = 2,
    RmService = 3,
    RmExplorer = 4,
    RmConsole = 5,
    RmCritical = 1000
  }

  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct RM_PROCESS_INFO {
    public RM_UNIQUE_PROCESS Process;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)] public string strAppName;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 64)] public string strServiceShortName;
    public RM_APP_TYPE ApplicationType;
    public uint AppStatus;
    public uint TSSessionId;
    [MarshalAs(UnmanagedType.Bool)] public bool bRestartable;
  }

  [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)]
  public static extern int RmStartSession(out uint pSessionHandle, int dwSessionFlags, string strSessionKey);

  [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)]
  public static extern int RmRegisterResources(uint pSessionHandle, uint nFiles, string[] rgsFilenames, uint nApplications, IntPtr rgApplications, uint nServices, string[] rgsServiceNames);

  [DllImport("rstrtmgr.dll")]
  public static extern int RmGetList(uint dwSessionHandle, out uint pnProcInfoNeeded, ref uint pnProcInfo, [In, Out] RM_PROCESS_INFO[] rgAffectedApps, ref uint lpdwRebootReasons);

  [DllImport("rstrtmgr.dll")]
  public static extern int RmEndSession(uint pSessionHandle);
}
'@
}

function Get-FileLockingProcesses($Path) {
  if (-not (Test-Path $Path)) {
    return @()
  }

  Ensure-RestartManagerType
  [uint32]$session = 0
  $sessionKey = [Guid]::NewGuid().ToString()
  $result = [RestartManager]::RmStartSession([ref]$session, 0, $sessionKey)
  if ($result -ne 0) {
    return @()
  }

  try {
    $files = [string[]]@((Resolve-Path $Path).Path)
    $result = [RestartManager]::RmRegisterResources($session, [uint32]$files.Length, $files, 0, [IntPtr]::Zero, 0, $null)
    if ($result -ne 0) {
      return @()
    }

    [uint32]$needed = 0
    [uint32]$count = 0
    [uint32]$reasons = 0
    $result = [RestartManager]::RmGetList($session, [ref]$needed, [ref]$count, $null, [ref]$reasons)
    if ($result -ne 234 -or $needed -eq 0) {
      return @()
    }

    $count = $needed
    $apps = New-Object RestartManager+RM_PROCESS_INFO[] $count
    $result = [RestartManager]::RmGetList($session, [ref]$needed, [ref]$count, $apps, [ref]$reasons)
    if ($result -ne 0) {
      return @()
    }

    return $apps | ForEach-Object {
      Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Process.dwProcessId)" -ErrorAction SilentlyContinue
    } | Where-Object { $_ }
  } finally {
    [RestartManager]::RmEndSession($session) | Out-Null
  }
}

function Stop-PrismaEngineLockingProcesses {
  $engineFiles = Get-ChildItem -Path (Join-Path $root "node_modules/.pnpm") -Recurse -Filter "query_engine-windows.dll.node" -ErrorAction SilentlyContinue
  foreach ($engineFile in $engineFiles) {
    $lockingProcesses = Get-FileLockingProcesses $engineFile.FullName
    foreach ($process in $lockingProcesses) {
      if ($process.ProcessId -eq $PID -or $process.ParentProcessId -eq $PID) {
        continue
      }

      if ($process.CommandLine -notmatch ([Regex]::Escape($root.Path))) {
        continue
      }

      Write-Host "[KidsQuiz] 释放 Prisma engine 文件锁: $($process.Name) $($process.ProcessId)" -ForegroundColor Yellow
      Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
    }
  }
}

function Remove-PrismaTempEngines {
  $pnpmModulesPath = Join-Path $root "node_modules/.pnpm"
  if (-not (Test-Path $pnpmModulesPath)) {
    return
  }

  Get-ChildItem -Path $pnpmModulesPath -Recurse -Filter "query_engine-windows.dll.node.tmp*" -ErrorAction SilentlyContinue |
    ForEach-Object {
      Write-Host "[KidsQuiz] 清理 Prisma 临时文件: $($_.Name)" -ForegroundColor DarkGray
      Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue
    }
}

function Invoke-PrismaGenerate {
  Write-Host "[KidsQuiz] 生成 Prisma Client..." -ForegroundColor Yellow
  Stop-PrismaEngineLockingProcesses
  Remove-PrismaTempEngines
  & pnpm db:generate
  if ($LASTEXITCODE -eq 0) {
    return
  }

  Write-Host "[KidsQuiz] Prisma Client 生成失败，正在清理可能锁定的旧进程并重试一次..." -ForegroundColor Yellow
  Stop-ProjectDevProcesses
  Stop-PrismaEngineLockingProcesses
  Start-Sleep -Seconds 1
  Remove-PrismaTempEngines

  & pnpm db:generate
  if ($LASTEXITCODE -ne 0) {
    Write-Host "[KidsQuiz] Prisma Client 生成失败，请检查 pnpm db:generate 的输出。" -ForegroundColor Red
    exit $LASTEXITCODE
  }
}

Ensure-EnvFile ".env"
Ensure-EnvFile "prisma/.env"

if (-not (Test-Path "node_modules")) {
  Write-Host "[KidsQuiz] 首次启动，正在安装依赖..." -ForegroundColor Yellow
  Invoke-Pnpm @("install") "依赖安装失败，请检查 pnpm install 的输出。"
}

Stop-ProjectDevProcesses

Write-Host "[KidsQuiz] 同步数据库结构..." -ForegroundColor Yellow
Invoke-Pnpm @("db:push") "数据库同步失败。请确认 MySQL 已启动，并且 .env / prisma/.env 中的 DATABASE_URL 正确。"

Invoke-PrismaGenerate

$apiCmd = "Set-Location -LiteralPath `"$root`"; pnpm dev:api"
$webCmd = "Set-Location -LiteralPath `"$root`"; pnpm dev:admin"

Write-Host "[KidsQuiz] 正在启动 API: http://localhost:3000" -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", $apiCmd -WindowStyle Normal

Start-Sleep -Seconds 2

Write-Host "[KidsQuiz] 正在启动前端: http://127.0.0.1:5173" -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", $webCmd -WindowStyle Normal

Write-Host ""
Write-Host "[KidsQuiz] 已启动两个开发窗口：API 和前端。" -ForegroundColor Green
Write-Host "[KidsQuiz] 浏览器访问: http://127.0.0.1:5173" -ForegroundColor Green
Write-Host "[KidsQuiz] 如需停止服务，关闭新打开的两个 PowerShell 窗口即可。" -ForegroundColor Gray
