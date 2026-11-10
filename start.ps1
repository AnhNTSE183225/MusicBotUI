# ==============================================================================
# MusicBotUI Production Launcher (PowerShell / Windows)
# ==============================================================================
# Runs the pre-compiled, optimized production bundle in background with PID tracking.
# ==============================================================================

param(
    [switch]$Foreground
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$pidFile = Join-Path $root "frontend.pid"
$logsDir = Join-Path $root "logs"
if (-not (Test-Path $logsDir)) {
    New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
}

function Get-NpmExecutable {
    $pnpm = Get-Command pnpm.cmd -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($pnpm) { return @{ Exe = $pnpm.Source; Name = "pnpm" } }
    $npm = Get-Command npm.cmd -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($npm) { return @{ Exe = $npm.Source; Name = "npm" } }
    throw "Neither pnpm nor npm was found in PATH. Please install Node.js."
}

$pkgManager = Get-NpmExecutable

# 1. Stop existing frontend instance if running via PID
if (Test-Path $pidFile) {
    $oldPid = (Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
    if ($oldPid -and $oldPid.Trim() -match '^\d+$') {
        $pidNum = [int]$oldPid.Trim()
        $oldProc = Get-Process -Id $pidNum -ErrorAction SilentlyContinue
        if ($oldProc) {
            Write-Host "Stopping existing MusicBotUI process (PID $pidNum)..." -ForegroundColor Yellow
            Stop-Process -Id $pidNum -Force -ErrorAction SilentlyContinue
            & taskkill.exe /PID $pidNum /T /F 2>$null | Out-Null
        }
    }
    Remove-Item -Path $pidFile -Force -ErrorAction SilentlyContinue
}

# Free port 3000 if occupied
$port3000 = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
foreach ($conn in $port3000) {
    if ($conn.OwningProcess -gt 0 -and $conn.OwningProcess -ne $PID) {
        Write-Host "Freeing port 3000 from existing process (PID $($conn.OwningProcess))..." -ForegroundColor Yellow
        Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
        & taskkill.exe /PID $conn.OwningProcess /T /F 2>$null | Out-Null
    }
}

# 2. Ensure build artifacts exist
$outputDir = Join-Path $root ".output"
if (-not (Test-Path $outputDir)) {
    Write-Host "Production build not found. Running build.ps1 first..." -ForegroundColor Yellow
    & powershell.exe -ExecutionPolicy Bypass -File (Join-Path $root "build.ps1")
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Build failed. Cannot start frontend." -ForegroundColor Red
        exit 1
    }
}

# 3. Start Frontend in Background
$frontendLog = Join-Path $logsDir "frontend.log"
$frontendErr = Join-Path $logsDir "frontend_err.log"
$frontendIn  = Join-Path $logsDir "frontend_in.empty"
if (-not (Test-Path $frontendIn)) {
    New-Item -ItemType File -Path $frontendIn -Force | Out-Null
}

if ($Foreground) {
    Set-Content -Path $pidFile -Value $PID
    Write-Host "Starting MusicBot UI in foreground on port 3000..." -ForegroundColor Cyan
    Push-Location $root
    try {
        & $pkgManager.Exe run preview
    } finally {
        Pop-Location
    }
    exit $LASTEXITCODE
}

Write-Host "Starting MusicBot UI in background (port 3000)..." -ForegroundColor Cyan

# Set CI=true so Vite runs in headless non-interactive mode
$oldCi = $env:CI
$env:CI = "true"

try {
    $proc = Start-Process `
        -FilePath $pkgManager.Exe `
        -ArgumentList @("run", "preview") `
        -WorkingDirectory $root `
        -RedirectStandardInput $frontendIn `
        -RedirectStandardOutput $frontendLog `
        -RedirectStandardError $frontendErr `
        -PassThru `
        -WindowStyle Hidden
} finally {
    if ($null -ne $oldCi) {
        $env:CI = $oldCi
    } else {
        Remove-Item Env:\CI -ErrorAction SilentlyContinue
    }
}

if (-not $proc) {
    Write-Host "ERROR: Failed to launch frontend process!" -ForegroundColor Red
    exit 1
}

$frontendPid = $proc.Id
Set-Content -Path $pidFile -Value $frontendPid

# Wait briefly for process to bind or fail
Start-Sleep -Milliseconds 800

if ($proc.HasExited) {
    Write-Host "ERROR: Frontend failed to start (process exited immediately)!" -ForegroundColor Red
    if (Test-Path $frontendErr) {
        Get-Content $frontendErr | Select-Object -Last 20 | Write-Host -ForegroundColor Red
    } elseif (Test-Path $frontendLog) {
        Get-Content $frontendLog | Select-Object -Last 20 | Write-Host -ForegroundColor Red
    }
    Remove-Item -Path $pidFile -Force -ErrorAction SilentlyContinue
    exit 1
}

Write-Host "OK: MusicBot UI started in background (PID $frontendPid) on port 3000!" -ForegroundColor Green
Write-Host "Log: $frontendLog" -ForegroundColor Cyan
