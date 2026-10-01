@echo off
REM ============================================================================
REM  Kore - one-click dev server (browser mode).
REM
REM  Just double-click this file in Explorer, or run `dev.cmd` from a terminal
REM  opened anywhere. It handles the Node version for you.
REM
REM  All arguments are forwarded, e.g.:
REM    dev.cmd --port 5174
REM ============================================================================
call "%~dp0scripts\dev.cmd" %*
exit /b %errorlevel%
