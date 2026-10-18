@echo off
setlocal
cd /d "%~dp0.."
node scripts\bundle-content.mjs
if errorlevel 1 exit /b 1
if not exist dist mkdir dist
if exist "dist\Dot-Copy-Paste-0.1.0-test.zip" del /f "dist\Dot-Copy-Paste-0.1.0-test.zip"
tar -a -c -f "dist\Dot-Copy-Paste-0.1.0-test.zip" -C extension .
if errorlevel 1 exit /b 1
echo Created %CD%\dist\Dot-Copy-Paste-0.1.0-test.zip
tar -tf "dist\Dot-Copy-Paste-0.1.0-test.zip"
