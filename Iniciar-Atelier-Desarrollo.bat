@echo off
rem AI Hoodie Studio - modo desarrollo (los cambios en el codigo se ven al instante).
cd /d "%~dp0"
title AI Hoodie Studio (desarrollo)
if not exist node_modules call npm install
start "" cmd /c "timeout /t 5 /nobreak >nul & start http://localhost:3000"
call npm run dev
