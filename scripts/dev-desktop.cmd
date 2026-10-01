@echo off
REM Double-clickable wrapper for the Tauri desktop dev launcher.
REM See scripts/dev-desktop.ps1 for details.
powershell -ExecutionPolicy Bypass -File "%~dp0dev-desktop.ps1" %*
