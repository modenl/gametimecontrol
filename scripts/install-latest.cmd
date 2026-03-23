@echo off
setlocal enabledelayedexpansion

set "DOWNLOAD_URL=%GTC_RELEASE_URL%"
if "%DOWNLOAD_URL%"=="" set "DOWNLOAD_URL=https://example.com/releases/latest/download/GameTimeControlSetup.exe"
set "INSTALLER=%TEMP%\GameTimeControlSetup.exe"

echo Downloading Game Time Control from %DOWNLOAD_URL%
powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -UseBasicParsing -Uri '%DOWNLOAD_URL%' -OutFile '%INSTALLER%'"
if errorlevel 1 exit /b 1

echo Running silent installer
"%INSTALLER%" /S
if errorlevel 1 exit /b 1

echo Installed. Optional shell/startup configuration can be applied with:
echo powershell -ExecutionPolicy Bypass -File "%~dp0configure-shell.ps1" -ChildUserName child -EnableStartup -EnableShellReplacement
endlocal
