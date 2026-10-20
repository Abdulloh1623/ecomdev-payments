@echo off
rem Run the project on Windows: checks Node.js, installs dependencies, builds and starts the server.
chcp 65001 >nul
cd /d "%~dp0"
rem A PSModulePath inherited from PowerShell 7 breaks module loading in Windows PowerShell 5.1
set "PSModulePath="
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\run.ps1" start
echo.
pause
