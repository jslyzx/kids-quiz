param(
  [string]$OutDir = "",
  [string]$Database = "",
  [string]$HostName = "",
  [int]$Port = 0,
  [string]$User = "",
  [string]$Password = ""
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

function Read-DotEnv {
  param([string]$Path)

  $result = @{}
  if (-not (Test-Path $Path)) {
    return $result
  }

  foreach ($line in Get-Content $Path) {
    $trimmed = $line.Trim()
    if ($trimmed.Length -eq 0 -or $trimmed.StartsWith("#")) {
      continue
    }

    $idx = $trimmed.IndexOf("=")
    if ($idx -le 0) {
      continue
    }

    $key = $trimmed.Substring(0, $idx).Trim()
    $value = $trimmed.Substring($idx + 1).Trim()

    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }

    $result[$key] = $value
  }

  return $result
}

function Parse-DatabaseUrl {
  param([string]$Url)

  $result = @{}
  if ([string]::IsNullOrWhiteSpace($Url) -or $Url.Contains('${')) {
    return $result
  }

  try {
    $uri = [Uri]$Url
    $result["DB_HOST"] = $uri.Host
    $result["DB_PORT"] = if ($uri.Port -gt 0) { [string]$uri.Port } else { "3306" }
    $result["DB_NAME"] = $uri.AbsolutePath.TrimStart("/")

    if (-not [string]::IsNullOrWhiteSpace($uri.UserInfo)) {
      $parts = $uri.UserInfo.Split(":", 2)
      $result["DB_USER"] = [Uri]::UnescapeDataString($parts[0])
      if ($parts.Length -gt 1) {
        $result["DB_PASSWORD"] = [Uri]::UnescapeDataString($parts[1])
      }
    }
  } catch {
    Write-Host "[KidsQuiz] DATABASE_URL parse failed. Falling back to DB_* values." -ForegroundColor Yellow
  }

  return $result
}

$envMap = Read-DotEnv (Join-Path $root ".env")
$urlMap = Parse-DatabaseUrl $envMap["DATABASE_URL"]

if ([string]::IsNullOrWhiteSpace($HostName)) {
  $HostName = if ($envMap["DB_HOST"]) { $envMap["DB_HOST"] } elseif ($urlMap["DB_HOST"]) { $urlMap["DB_HOST"] } else { "localhost" }
}
if ($Port -le 0) {
  $Port = if ($envMap["DB_PORT"]) { [int]$envMap["DB_PORT"] } elseif ($urlMap["DB_PORT"]) { [int]$urlMap["DB_PORT"] } else { 3306 }
}
if ([string]::IsNullOrWhiteSpace($User)) {
  $User = if ($envMap["DB_USER"]) { $envMap["DB_USER"] } elseif ($urlMap["DB_USER"]) { $urlMap["DB_USER"] } else { "root" }
}
if ([string]::IsNullOrWhiteSpace($Password)) {
  $Password = if ($envMap.ContainsKey("DB_PASSWORD")) { $envMap["DB_PASSWORD"] } elseif ($urlMap.ContainsKey("DB_PASSWORD")) { $urlMap["DB_PASSWORD"] } else { "" }
}
if ([string]::IsNullOrWhiteSpace($Database)) {
  $Database = if ($envMap["DB_NAME"]) { $envMap["DB_NAME"] } elseif ($urlMap["DB_NAME"]) { $urlMap["DB_NAME"] } else { "quiz" }
}
if ([string]::IsNullOrWhiteSpace($OutDir)) {
  $OutDir = Join-Path $root "backups"
}

if (-not (Get-Command mysqldump -ErrorAction SilentlyContinue)) {
  Write-Host "[KidsQuiz] mysqldump not found. Please install MySQL Client or add MySQL bin directory to PATH." -ForegroundColor Red
  exit 1
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$file = Join-Path $OutDir "$Database-$timestamp.sql"

Write-Host "[KidsQuiz] Backup database: ${Database}@${HostName}:${Port}" -ForegroundColor Cyan
Write-Host "[KidsQuiz] Output file: $file" -ForegroundColor Gray

$args = @(
  "--host=$HostName",
  "--port=$Port",
  "--user=$User",
  "--default-character-set=utf8mb4",
  "--single-transaction",
  "--routines",
  "--triggers",
  "--databases",
  $Database
)

$oldPwd = $env:MYSQL_PWD
$env:MYSQL_PWD = $Password

try {
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = "mysqldump"
  foreach ($arg in $args) {
    [void]$psi.ArgumentList.Add($arg)
  }
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.UseShellExecute = $false

  $process = New-Object System.Diagnostics.Process
  $process.StartInfo = $psi

  [void]$process.Start()
  $fs = [System.IO.File]::Open($file, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write)
  try {
    $process.StandardOutput.BaseStream.CopyTo($fs)
  } finally {
    $fs.Dispose()
  }

  $stderr = $process.StandardError.ReadToEnd()
  $process.WaitForExit()

  if ($process.ExitCode -ne 0) {
    Remove-Item -LiteralPath $file -Force -ErrorAction SilentlyContinue
    Write-Host "[KidsQuiz] Backup failed:" -ForegroundColor Red
    Write-Host $stderr
    exit $process.ExitCode
  }
} finally {
  $env:MYSQL_PWD = $oldPwd
}

$size = [Math]::Round((Get-Item $file).Length / 1KB, 2)
Write-Host "[KidsQuiz] Backup done: $file ($size KB)" -ForegroundColor Green
