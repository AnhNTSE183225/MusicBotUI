# ==============================================================================
# MusicBotUI Cloudflare Pages Direct Deploy Script (PowerShell / Windows)
# ==============================================================================
# Builds the production Cloudflare Pages bundle locally and deploys directly
# via Wrangler, eliminating GitHub Actions CI/CD runner usage/costs.
#
# Usage:
#   .\deploy.ps1                      # Run tests, build (PROD), deploy to Cloudflare Pages
#   .\deploy.ps1 -SkipTests           # Skip vitest suite and deploy immediately
#   .\deploy.ps1 -Branch preview      # Deploy to a preview branch instead of main
#   .\deploy.ps1 -DryRun              # Run tests + build + auth check without uploading
#
# Authentication (either method works):
#   1. Interactive OAuth (recommended locally): run `npx wrangler login` once.
#      (deploy.ps1 will prompt `npx wrangler login` automatically if needed.)
#   2. API Token: set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in your
#      environment, `.env`, or `.env.deploy`.
# ==============================================================================

param(
    [string]$ProjectName = "musicbotui",
    [string]$Branch = "main",
    [string]$Profile = "PROD",
    [switch]$SkipTests,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$distDir = Join-Path $root "dist"

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "   MusicBotUI -> Cloudflare Pages Direct Deploy" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  Project : $ProjectName" -ForegroundColor DarkGray
Write-Host "  Branch  : $Branch" -ForegroundColor DarkGray
Write-Host "  Profile : $Profile" -ForegroundColor DarkGray
if ($DryRun) {
    Write-Host "  Mode    : DRY RUN (no upload)" -ForegroundColor Yellow
}
Write-Host ""

$sw = [System.Diagnostics.Stopwatch]::StartNew()

function Get-PkgManager {
    $pnpm = Get-Command pnpm.cmd -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($pnpm) { return @{ Exe = $pnpm.Source; Name = "pnpm" } }
    $npm = Get-Command npm.cmd -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($npm) { return @{ Exe = $npm.Source; Name = "npm" } }
    throw "Neither pnpm nor npm was found in PATH. Please install Node.js."
}

function Get-WranglerInvocation {
    $localWrangler = Join-Path $root "node_modules\.bin\wrangler.cmd"
    if (Test-Path $localWrangler) {
        return @{ Exe = $localWrangler; PrefixArgs = @() }
    }

    $globalWrangler = Get-Command wrangler.cmd -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $globalWrangler) {
        $globalWrangler = Get-Command wrangler -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    }
    if ($globalWrangler) {
        return @{ Exe = $globalWrangler.Source; PrefixArgs = @() }
    }

    $npx = Get-Command npx.cmd -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $npx) {
        throw "npx was not found in PATH. Please install Node.js."
    }
    return @{ Exe = $npx.Source; PrefixArgs = @("--yes", "wrangler") }
}

function Invoke-WranglerStreaming {
    param([string[]]$WranglerArgs)
    $inv = Get-WranglerInvocation
    $allArgs = $inv.PrefixArgs + $WranglerArgs
    & $inv.Exe @allArgs | Out-Host
    return $LASTEXITCODE
}

function Import-CloudflareEnv {
    $allowedKeys = @("CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID")
    foreach ($fileName in @(".env", ".env.deploy")) {
        $envFile = Join-Path $root $fileName
        if (-not (Test-Path $envFile)) { continue }

        foreach ($line in (Get-Content $envFile -Encoding UTF8)) {
            $trimmed = $line.Trim()
            if (-not $trimmed -or $trimmed.StartsWith("#")) { continue }
            if ($trimmed -match '^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
                $key = $matches[1]
                if ($allowedKeys -notcontains $key) { continue }
                if (-not [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($key))) { continue }

                $rawVal = $matches[2].Trim()
                if ($rawVal -match '^"(.*)"(\s+#.*)?$') {
                    $val = $matches[1]
                } elseif ($rawVal -match "^'(.*)'(\s+#.*)?$") {
                    $val = $matches[1]
                } else {
                    $val = ($rawVal -replace '\s+#.*$', '').Trim()
                }
                if ($val) {
                    [Environment]::SetEnvironmentVariable($key, $val, "Process")
                }
            }
        }
    }
}

$pkgManager = Get-PkgManager
Import-CloudflareEnv

# 1. Check / install dependencies if missing
Write-Host "[1/5] Checking dependencies..." -ForegroundColor Cyan
if (-not (Test-Path (Join-Path $root "node_modules"))) {
    Push-Location $root
    try {
        & $pkgManager.Exe install
        if ($LASTEXITCODE -ne 0) { throw "$($pkgManager.Name) install failed (exit $LASTEXITCODE)." }
    } finally {
        Pop-Location
    }
}
Write-Host "  OK: Using $($pkgManager.Name)" -ForegroundColor Green

# 2. Verify Cloudflare authentication
Write-Host "[2/5] Checking Cloudflare authentication..." -ForegroundColor Cyan
if (-not [string]::IsNullOrWhiteSpace($env:CLOUDFLARE_API_TOKEN)) {
    Write-Host "  OK: Using CLOUDFLARE_API_TOKEN from environment." -ForegroundColor Green
} else {
    $inv = Get-WranglerInvocation
    $whoamiArgs = $inv.PrefixArgs + @("whoami")
    $prevPref = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $whoamiOut = & $inv.Exe @whoamiArgs 2>&1
    $whoamiCode = $LASTEXITCODE
    $ErrorActionPreference = $prevPref

    $whoamiText = ($whoamiOut | Out-String)
    $isAuthed = ($whoamiCode -eq 0) -and ($whoamiText -notmatch "not authenticated")
    if ($isAuthed) {
        Write-Host "  OK: Wrangler session authenticated." -ForegroundColor Green
    } elseif ($DryRun) {
        Write-Host "  WARN: Wrangler is not logged in yet (dry-run continues; run 'npx wrangler login' before deploying)." -ForegroundColor Yellow
    } else {
        Write-Host "  Not logged into Cloudflare yet. Launching 'wrangler login'..." -ForegroundColor Yellow
        $loginCode = Invoke-WranglerStreaming -WranglerArgs @("login")
        if ($loginCode -ne 0) {
            throw "Cloudflare login failed or was cancelled (exit $loginCode)."
        }
    }
}

# 3. Run unit tests unless skipped
if ($SkipTests) {
    Write-Host "[3/5] Skipping tests (-SkipTests)." -ForegroundColor Yellow
} else {
    Write-Host "[3/5] Running test suite..." -ForegroundColor Cyan
    Push-Location $root
    try {
        & $pkgManager.Exe run test
        if ($LASTEXITCODE -ne 0) { throw "Tests failed (exit $LASTEXITCODE). Aborting deploy." }
    } finally {
        Pop-Location
    }
    Write-Host "  OK: All tests passed." -ForegroundColor Green
}

# 4. Build Cloudflare Pages bundle (dist/) with Profile=PROD overriding .env
Write-Host "[4/5] Building Cloudflare Pages bundle (PROFILE=$Profile)..." -ForegroundColor Cyan
if (Test-Path $distDir) {
    Remove-Item -Recurse -Force $distDir -ErrorAction Stop
}

$oldPreset = $env:NITRO_PRESET
$oldProfile = $env:PROFILE
$oldViteProfile = $env:VITE_PROFILE

Push-Location $root
try {
    $env:NITRO_PRESET = "cloudflare-pages"
    $env:PROFILE = $Profile
    $env:VITE_PROFILE = $Profile

    & $pkgManager.Exe run build
    if ($LASTEXITCODE -ne 0) { throw "Frontend build failed (exit $LASTEXITCODE)." }
} finally {
    $env:NITRO_PRESET = $oldPreset
    $env:PROFILE = $oldProfile
    $env:VITE_PROFILE = $oldViteProfile
    Pop-Location
}

if (-not (Test-Path (Join-Path $distDir "_worker.js")) -or -not (Test-Path (Join-Path $distDir "_routes.json"))) {
    throw "Cloudflare Pages build did not produce expected dist/_worker.js or dist/_routes.json."
}
$expectedConfig = if ($Profile.ToUpper() -eq "PROD") { "config.prod.yaml" } else { "config.dev.yaml" }
if (-not (Test-Path (Join-Path $distDir $expectedConfig))) {
    throw "Expected $expectedConfig was not found in dist/."
}

# Clamp compatibility_date generated by Nitro (uses local timezone, which can be 1 day ahead of UTC/Cloudflare)
$workerWranglerJson = Join-Path $distDir "_worker.js\wrangler.json"
if (Test-Path $workerWranglerJson) {
    $maxCompatDate = [DateTime]::UtcNow.AddDays(-1).ToString("yyyy-MM-dd")
    $wranglerCfg = (Get-Content $workerWranglerJson -Raw -Encoding UTF8) | ConvertFrom-Json
    if ($wranglerCfg.compatibility_date -and ($wranglerCfg.compatibility_date -gt $maxCompatDate)) {
        Write-Host "  Adjusting compatibility_date ($($wranglerCfg.compatibility_date) -> $maxCompatDate) for Cloudflare UTC clock..." -ForegroundColor DarkGray
        $wranglerCfg.compatibility_date = $maxCompatDate
        $updatedJson = $wranglerCfg | ConvertTo-Json -Depth 10
        [System.IO.File]::WriteAllText($workerWranglerJson, $updatedJson, [System.Text.UTF8Encoding]::new($false))
    }
}
Write-Host "  OK: Cloudflare Pages bundle ready in dist/." -ForegroundColor Green

# 5. Deploy to Cloudflare Pages
if ($DryRun) {
    $sw.Stop()
    Write-Host "[5/5] Dry run complete in $($sw.Elapsed.TotalSeconds.ToString('N1'))s — skipped Wrangler upload." -ForegroundColor Yellow
    Write-Host ""
    exit 0
}

Write-Host "[5/5] Deploying dist/ to Cloudflare Pages ($ProjectName / branch: $Branch)..." -ForegroundColor Cyan
Push-Location $root
try {
    # Ensure Pages project exists (matches CI behavior; ignore if already created)
    $inv = Get-WranglerInvocation
    $createArgs = $inv.PrefixArgs + @("pages", "project", "create", $ProjectName, "--production-branch", $Branch)
    $prevPref = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    & $inv.Exe @createArgs *> $null
    $ErrorActionPreference = $prevPref

    $deployCode = Invoke-WranglerStreaming -WranglerArgs @("pages", "deploy", "dist", "--project-name", $ProjectName, "--branch", $Branch)
    if ($deployCode -ne 0) {
        throw "Wrangler pages deploy failed (exit $deployCode)."
    }
} finally {
    Pop-Location
}

$sw.Stop()
Write-Host ""
Write-Host ("Deploy succeeded in {0:N1}s!" -f $sw.Elapsed.TotalSeconds) -ForegroundColor Green
Write-Host ""
exit 0
