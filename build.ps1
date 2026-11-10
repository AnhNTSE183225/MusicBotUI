# ==============================================================================
# MusicBotUI Frontend Build Script (PowerShell / Windows)
# ==============================================================================
# Installs dependencies if missing, runs TypeScript validation and Vite build.
# Usage:
#   .\build.ps1         # Standard production build
#   .\build.ps1 -Clean  # Remove node_modules and .output, reinstall and build
# ==============================================================================

param(
    [switch]$Clean
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host ""
Write-Host "==================================================" -ForegroundColor Magenta
Write-Host "       MusicBotUI Frontend Production Build" -ForegroundColor Magenta
Write-Host "==================================================" -ForegroundColor Magenta
Write-Host ""

$sw = [System.Diagnostics.Stopwatch]::StartNew()

function Get-NpmExecutable {
    $pnpm = Get-Command pnpm.cmd -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($pnpm) { return @{ Exe = $pnpm.Source; Name = "pnpm" } }
    $npm = Get-Command npm.cmd -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($npm) { return @{ Exe = $npm.Source; Name = "npm" } }
    throw "Neither pnpm nor npm was found in PATH. Please install Node.js."
}

$pkgManager = Get-NpmExecutable
Write-Host "Using package manager: $($pkgManager.Name)" -ForegroundColor DarkGray

# 1. Clean if requested
if ($Clean) {
    Write-Host "[1/3] Cleaning previous build artifacts..." -ForegroundColor Yellow
    foreach ($dir in @(".output", ".tanstack", "node_modules")) {
        $p = Join-Path $root $dir
        if (Test-Path $p) {
            Remove-Item -Recurse -Force $p -ErrorAction SilentlyContinue
            Write-Host "  Removed: $p" -ForegroundColor DarkGray
        }
    }
}

# 2. Install dependencies if missing
$nodeModules = Join-Path $root "node_modules"
if (-not (Test-Path $nodeModules)) {
    Write-Host "[2/3] Installing frontend dependencies..." -ForegroundColor Cyan
    Push-Location $root
    try {
        & $pkgManager.Exe install
        if ($LASTEXITCODE -ne 0) { throw "npm install failed with exit code $LASTEXITCODE." }
    } finally {
        Pop-Location
    }
    Write-Host "  OK: Dependencies installed" -ForegroundColor Green
} else {
    Write-Host "[2/3] node_modules present." -ForegroundColor DarkGray
}

# 3. Production build
Write-Host "[3/3] Compiling and bundling production assets..." -ForegroundColor Cyan
Push-Location $root
try {
    & $pkgManager.Exe run build
    if ($LASTEXITCODE -ne 0) { throw "Frontend build failed with exit code $LASTEXITCODE." }
} finally {
    Pop-Location
}

$outputDir = Join-Path $root ".output"
if (-not (Test-Path $outputDir)) {
    throw "Build completed, but .output directory was not generated."
}

# Ensure dist/server/server.js shim exists for vite preview compatibility
$distServerDir = Join-Path $root "dist\server"
if (-not (Test-Path $distServerDir)) {
    New-Item -ItemType Directory -Path $distServerDir -Force | Out-Null
}
$shimPath = Join-Path $distServerDir "server.js"
$shimContent = @'
import server from "../../.output/server/index.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, "../../.output/public");

const mimeTypes = {
  ".yaml": "text/yaml; charset=utf-8",
  ".yml": "text/yaml; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".html": "text/html; charset=utf-8",
};

const env = {};
const ctx = { waitUntil() {}, passThroughOnException() {}, props: {} };

export default {
  async fetch(request) {
    try {
      const url = new URL(request.url);
      const rawPath = decodeURIComponent(url.pathname);

      if (rawPath !== "/" && rawPath !== "") {
        const candidates = [
          path.join(publicDir, rawPath),
          path.join(publicDir, "assets", path.basename(rawPath)),
        ];

        for (const filePath of candidates) {
          if (fs.existsSync(filePath)) {
            const stat = fs.statSync(filePath);
            if (stat.isFile()) {
              const ext = path.extname(filePath).toLowerCase();
              const contentType = mimeTypes[ext] || "application/octet-stream";
              const buffer = fs.readFileSync(filePath);
              return new Response(buffer, {
                status: 200,
                headers: {
                  "Content-Type": contentType,
                  "Content-Length": buffer.length.toString(),
                  "Cache-Control": "public, max-age=31536000, immutable",
                },
              });
            }
          }
        }
      }
    } catch (e) {
      // Fall through to SSR on error
    }

    Object.defineProperty(request, "ip", { value: undefined, writable: true, configurable: true });
    return server.fetch(request, env, ctx);
  },
};
'@
Set-Content -Path $shimPath -Value $shimContent -Encoding utf8

$assets = Get-ChildItem (Join-Path $outputDir "public\assets") -File -ErrorAction SilentlyContinue
$totalKb = ($assets | Measure-Object -Property Length -Sum).Sum / 1KB

$sw.Stop()
Write-Host ""
Write-Host ("Frontend build succeeded in {0:N1}s! ({1:N1} KB assets generated)" -f $sw.Elapsed.TotalSeconds, $totalKb) -ForegroundColor Green
Write-Host "Ready for instant start via start.ps1." -ForegroundColor Green
Write-Host ""
exit 0
