@echo off
title SITE CLASH - Unggah ke Hugging Face (server cloud gratis)
cd /d "%~dp0"
where python >nul 2>nul
if errorlevel 1 (
  echo [!] Python belum terpasang. Install dari https://python.org lalu jalankan file ini lagi.
  pause
  exit /b 1
)
python tools\deploy_hf.py
pause
