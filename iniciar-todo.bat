@echo off
title Courier Local - iniciar todo
echo Encendiendo OpenWA, el servidor de Courier y el programador de envios...
echo.

echo [1/3] Abriendo OpenWA (WhatsApp)...
start "OpenWA" cmd /k "set PATH=C:\Users\hp\tools\node22;%PATH% && cd /d C:\Users\hp\MisProyectos\OpenWA && node dist/main"

echo      Esperando 20 segundos a que OpenWA arranque. NO cierres esta ventana...
ping -n 21 127.0.0.1 >nul

echo [2/3] Abriendo el servidor de Courier...
start "Courier servidor" cmd /k "cd /d C:\Users\hp\MisProyectos\Courier-Local\app && npm run dev:prueba"

echo      Esperando 15 segundos a que el servidor arranque...
ping -n 16 127.0.0.1 >nul

echo [3/3] Abriendo el programador de envios...
start "Courier programador" cmd /k "cd /d C:\Users\hp\MisProyectos\Courier-Local\app && npm run programador"

echo.
echo Listo. Deben haber quedado 3 ventanas abiertas (OpenWA, servidor y programador).
echo NO las cierres mientras quieras que el bot funcione. Esta ventana si puedes cerrarla.
pause
