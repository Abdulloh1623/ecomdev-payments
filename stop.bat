@echo off
rem Stop the server started by start.bat.
chcp 65001 >nul
cd /d "%~dp0"
rem A PSModulePath inherited from PowerShell 7 breaks module loading in Windows PowerShell 5.1
set "PSModulePath="
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\run.ps1" stop
echo.
pause
