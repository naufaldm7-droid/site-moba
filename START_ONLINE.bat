@echo off
title SITE CLASH - Server ONLINE (Cloudflare Tunnel)
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
if not exist tools\bin\cloudflared.exe (
  echo Mengunduh cloudflared resmi dari GitHub Cloudflare...
  if not exist tools\bin mkdir tools\bin
  curl -L -o tools\bin\cloudflared.exe https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe
)
echo.
echo Link online untuk teman akan muncul di bawah (dan di lobby game) dalam beberapa detik.
echo Link berganti setiap kali server dinyalakan ulang.
echo.
start "" http://localhost:3000
node server\index.js --online
pause
