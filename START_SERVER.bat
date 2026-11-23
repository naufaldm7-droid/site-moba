@echo off
title SITE CLASH - Server Laptop
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo [!] Node.js belum terpasang. Install dari https://nodejs.org lalu jalankan file ini lagi.
  pause
  exit /b 1
)
if not exist node_modules\ws (
  echo Memasang dependensi pertama kali...
  call npm install --no-audit --no-fund
)
start "" http://localhost:3000
node server\index.js
pause
