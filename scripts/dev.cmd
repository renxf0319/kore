@echo off
REM ============================================================================
REM  Kore dev launcher (browser mode) - works in cmd.exe and PowerShell,
REM  and can also be double-clicked from Explorer.
REM
REM  Runs `npm run dev` with the pinned Node version (see .node-version)
REM  WITHOUT touching the system-wide Node. Legacy projects that need an
REM  older Node (e.g. Node 16) keep using the system one.
REM
REM  Usage:
REM    dev.cmd                          (from the project root)
REM    scripts\dev.cmd                   (double-click or run from anywhere)
REM    scripts\dev.cmd --port 5174       (extra args are forwarded to vite)
REM ============================================================================
setlocal EnableExtensions

REM --- Always run from the project root, even when double-clicked ------------
cd /d "%~dp0.."
if not exist "package.json" (
  echo [dev] package.json not found in "%CD%"
  echo [dev] This launcher must live inside the kore repository.
  exit /b 1
)

REM --- Node version: read .node-version, fall back to a known-good default ---
set "KORE_NODE_VERSION="
if exist ".node-version" for /f "usebackq delims=" %%v in (".node-version") do if not defined KORE_NODE_VERSION set "KORE_NODE_VERSION=%%v"
if not defined KORE_NODE_VERSION set "KORE_NODE_VERSION=22.23.3"

REM --- Prefer fnm, if it is on PATH -------------------------------------------
where fnm >nul 2>nul
if not errorlevel 1 (
  call fnm exec --using=%KORE_NODE_VERSION% -- npm.cmd run dev -- %*
  exit /b %errorlevel%
)

REM --- Fallback: use fnm's install dir directly -------------------------------
if "%FNM_DIR%"=="" set "FNM_DIR=E:\fnm-data"
set "KORE_NODE=%FNM_DIR%\node-versions\v%KORE_NODE_VERSION%\installation"
if not exist "%KORE_NODE%\node.exe" (
  echo [dev] Node %KORE_NODE_VERSION% not found at:
  echo [dev]   %KORE_NODE%
  echo [dev] Install it with:  fnm install %KORE_NODE_VERSION%
  echo [dev] Or edit .node-version to a version you already have.
  exit /b 1
)
set "PATH=%KORE_NODE%;%PATH%"
for /f "delims=" %%v in ('node -v') do echo [dev] node %%v
call npm run dev -- %*
exit /b %errorlevel%
