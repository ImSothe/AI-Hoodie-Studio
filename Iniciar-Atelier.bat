@echo off
rem AI Hoodie Studio - arranque con un doble clic.
rem Compila la app y la abre en el navegador (modo rapido, el de uso diario).
rem Para desarrollar (cambios en vivo) usa Iniciar-Atelier-Desarrollo.bat.
cd /d "%~dp0"
title AI Hoodie Studio

if not exist "public\models\hoodie.glb" (
  echo Falta el modelo 3D: copia tu hoodie.glb en la carpeta public\models\
  pause
  exit /b 1
)
if not exist node_modules (
  echo Instalando dependencias, solo la primera vez...
  call npm install || (pause & exit /b 1)
)

echo Preparando la app...
call npm run build || (echo La compilacion ha fallado. & pause & exit /b 1)

echo.
echo Abriendo http://localhost:3000  (cierra esta ventana para detener la app)
start "" cmd /c "timeout /t 4 /nobreak >nul & start http://localhost:3000"
call npm start
