@echo off
setlocal
cd /d "%~dp0.."
rem Use the Windows tar (bsdtar) so -a writes a ZIP; Git's GNU tar can come first on PATH and write a plain tar.
set "TAR=%SystemRoot%\System32\tar.exe"
node scripts\bundle-content.mjs
if errorlevel 1 exit /b 1
if not exist dist mkdir dist
if exist "dist\Dot-Copy-Paste-0.2.0-test.zip" del /f "dist\Dot-Copy-Paste-0.2.0-test.zip"
"%TAR%" -a -c -f "dist\Dot-Copy-Paste-0.2.0-test.zip" -C extension .
if errorlevel 1 exit /b 1
echo Created %CD%\dist\Dot-Copy-Paste-0.2.0-test.zip
"%TAR%" -tf "dist\Dot-Copy-Paste-0.2.0-test.zip"
