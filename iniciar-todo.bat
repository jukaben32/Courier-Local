@echo off
title Courier Local - iniciar todo
echo Encendiendo OpenWA, el servidor de Courier y el programador de envios...

rem 1) OpenWA (WhatsApp)
start "OpenWA" cmd /k "set PATH=C:\Users\hp\tools\node22;%PATH% && cd /d C:\Users\hp\MisProyectos\OpenWA && node dist/main"

rem Esperar a que OpenWA arranque antes de levantar el servidor
timeout /t 20 /nobreak >nul

rem 2) Servidor de Courier (recibe las respuestas de los clientes)
start "Courier servidor" cmd /k "cd /d C:\Users\hp\MisProyectos\Courier-Local\app && npm run dev:prueba"

timeout /t 15 /nobreak >nul

rem 3) Programador (manda los avisos poco a poco)
start "Courier programador" cmd /k "cd /d C:\Users\hp\MisProyectos\Courier-Local\app && npm run programador"

echo.
echo Listo. Se abrieron 3 ventanas: NO las cierres mientras quieras que el bot funcione.
echo Cuando termines, avisale a Claude para comprobar que todo quedo conectado.
pause
