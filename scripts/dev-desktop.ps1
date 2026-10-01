# dev-desktop.ps1
# Launch Kore in DESKTOP dev mode (Tauri) with hot reload.
#
# This is the everyday local-dev entry point: it starts the Vite dev server
# (HMR) and opens a real native window that reloads instantly on every save.
# You do NOT need to build/publish an installer to test changes.
#
# It also keeps the Rust toolchain on a non-system drive, honoring the
# "do not write to C:" rule. It reuses the locations chosen by
# scripts/install-rust.ps1 (CARGO_HOME=<dir>\cargo, RUSTUP_HOME=<dir>\rustup).
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts/dev-desktop.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/dev-desktop.ps1 -RustHome "D:\rust"
#   powershell -ExecutionPolicy Bypass -File scripts/dev-desktop.ps1 -NoInstall

param(
  [string]$RustHome = "",
  [switch]$NoInstall = $false
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

function Resolve-RustHome {
  param([string]$Explicit)
  if ($Explicit) { return $Explicit.TrimEnd('\') }
  if ($env:CARGO_HOME) {
    $p = Split-Path $env:CARGO_HOME -Parent
    if ($p) { return $p }
  }
  foreach ($d in @("E:\rust", "D:\rust", "F:\rust")) {
    if (Test-Path (Join-Path $d "cargo\bin\cargo.exe")) { return $d }
  }
  # Last resort: default rustup location (may be on C:).
  if (Test-Path (Join-Path $env:USERPROFILE ".cargo\bin\cargo.exe")) {
    return (Join-Path $env:USERPROFILE ".cargo")
  }
  return $null
}

$home = Resolve-RustHome -Explicit $RustHome
if (-not $home) {
  Write-Host ""
  Write-Host "[dev] Rust toolchain not found." -ForegroundColor Yellow
  Write-Host "      Install it first (choose a non-C: drive when prompted):"
  Write-Host "        powershell -ExecutionPolicy Bypass -File scripts/install-rust.ps1"
  Write-Host ""
  Write-Host "      Or, for a zero-setup run in the browser (no Rust needed):"
  Write-Host "        npm run dev"
  exit 1
}

$cargoHome  = Join-Path $home "cargo"
$rustupHome = Join-Path $home "rustup"

# If this is the default ~/.cargo layout, respect the real env var values.
if (Test-Path (Join-Path $home ".cargo")) { $cargoHome = $home }
if (Test-Path (Join-Path $home ".rustup")) { $rustupHome = Join-Path $home ".rustup" }

$env:CARGO_HOME  = $cargoHome
$env:RUSTUP_HOME = $rustupHome
$cargoBin = Join-Path $cargoHome "bin"
if ((Test-Path $cargoBin) -and ($env:Path -notlike "*$cargoBin*")) {
  $env:Path = "$cargoBin;$env:Path"
}

Write-Host ""
Write-Host "[dev] CARGO_HOME  = $cargoHome"
Write-Host "[dev] RUSTUP_HOME = $rustupHome"

$cargo = Join-Path $cargoBin "cargo.exe"
if (-not (Test-Path $cargo)) { $cargo = "cargo" }

Write-Host "[dev] Rust toolchain check:"
& $cargo --version

if (-not $NoInstall -and -not (Test-Path (Join-Path $repo "node_modules"))) {
  Write-Host "[dev] node_modules missing, running npm install ..."
  npm install --no-audit --no-fund
}

Write-Host ""
Write-Host "[dev] Starting Tauri dev (Vite HMR + native window, hot reload on save)."
Write-Host "[dev] Close the app window (or press Ctrl+C here) to stop."
Write-Host ""

npm run tauri dev
