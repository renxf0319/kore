@echo off
REM ============================================================================
REM  Kore dev launcher (works in cmd.exe and PowerShell)
REM
REM  Runs `npm run dev` with the pinned Node version (see .node-version)
REM  WITHOUT touching the system-wide Node. Legacy projects that need an
REM  older Node (e.g. Node 16) keep using the system one.
REM
REM  Usage:
REM    scripts\dev.cmd                  (double-click or run from kore root)
REM    scripts\dev.cmd --port 5174      (extra args are forwarded to vite)
REM ============================================================================
setlocal
set "KORE_NODE_VERSION=22.23.3"

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
  exit /b 1
)
set "PATH=%KORE_NODE%;%PATH%"
for /f "delims=" %%v in ('node -v') do echo [dev] using node %%v
call npm run dev -- %*
exit /b %errorlevel%
