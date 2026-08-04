@echo off
setlocal
set "DOWNLOAD_URL=https://nodejs.org/it/download"
set "SCRIPT_DIR=%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js non risulta installato su questo computer.
  echo Apro la pagina di download ufficiale...
  start "" "%DOWNLOAD_URL%"
  echo Dopo aver installato Node.js, riavvia questo script ^(start.bat^).
  pause
  exit /b 1
)

node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 18 ? 0 : 1)"
if errorlevel 1 (
  echo Versione di Node.js troppo vecchia. Serve la 18 o superiore.
  start "" "%DOWNLOAD_URL%"
  pause
  exit /b 1
)

if not exist "%SCRIPT_DIR%node_modules" (
  echo Prima installazione: installo le dipendenze...
  pushd "%SCRIPT_DIR%"
  call npm install
  popd
)

node "%SCRIPT_DIR%bin\vault.js" %*
