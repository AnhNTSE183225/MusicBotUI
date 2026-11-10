# ==============================================================================
# MusicBotUI Stopper (PowerShell / Windows)
# ==============================================================================
# Stops background frontend process cleanly by PID.
# ==============================================================================

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$pidFile = Join-Path $root "frontend.pid"
$stopped = $false

Write-Host "Stopping MusicBotUI..." -ForegroundColor Cyan

# 1. Stop by PID file
if (Test-Path $pidFile) {
    $uiPid = (Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
    if ($uiPid -and $uiPid.Trim() -match '^\d+$') {
        $pidNum = [int]$uiPid.Trim()
        $proc = Get-Process -Id $pidNum -ErrorAction SilentlyContinue
        if ($proc) {
            Write-Host "Stopping MusicBotUI process (PID $pidNum)..." -ForegroundColor Yellow
            Stop-Process -Id $pidNum -Force -ErrorAction SilentlyContinue
            & taskkill.exe /PID $pidNum /T /F 2>$null | Out-Null
            $stopped = $true
        }
    }
    Remove-Item -Path $pidFile -Force -ErrorAction SilentlyContinue
}

# 2. Release port 3000 if occupied
$conns = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
foreach ($conn in $conns) {
    if ($conn.OwningProcess -gt 0 -and $conn.OwningProcess -ne $PID) {
        Write-Host "Releasing port 3000 from PID $($conn.OwningProcess)..." -ForegroundColor Yellow
        Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
        & taskkill.exe /PID $conn.OwningProcess /T /F 2>$null | Out-Null
        $stopped = $true
    }
}

if ($stopped) {
    Write-Host "MusicBotUI stopped successfully." -ForegroundColor Green
} else {
    Write-Host "MusicBotUI is not currently running." -ForegroundColor Yellow
}
