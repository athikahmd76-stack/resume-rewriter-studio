@echo off
title Resume Rewriter Studio
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js is not installed, so the app cannot start yet.
  echo.
  echo   Opening the Node.js download page - install the LTS version,
  echo   then double-click this file again.
  echo.
  start https://nodejs.org/en/download
  pause
  exit /b 1
)

node scripts\launch.mjs %*
if errorlevel 1 (
  echo.
  pause
)
