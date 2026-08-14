@echo off
rem One-click desktop packaging entry point for Windows.
rem Usage: build-desktop.cmd [options]
rem Run `build-desktop.cmd --help` for the full option list.
setlocal
set "ROOT=%~dp0.."
cd /d "%ROOT%"

set "PYTHON="
where python >nul 2>nul
if not errorlevel 1 (
  set "PYTHON=python"
) else (
  where py >nul 2>nul
  if not errorlevel 1 (
    set "PYTHON=py -3"
  )
)

if not defined PYTHON (
  echo [ERROR] Python 3 was not found on PATH. Install Python 3 and retry.
  pause
  exit /b 1
)

%PYTHON% scripts\build-desktop.py %*
set "STATUS=%errorlevel%"
if not "%STATUS%"=="0" (
  echo.
  echo Build failed with exit code %STATUS%.
  pause
)
exit /b %STATUS%
