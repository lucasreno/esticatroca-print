@echo off
REM ============================================================
REM  Esticatroca Print - Instalador (zip portatil + NSSM)
REM ============================================================
REM  Uso: clique com o botao direito -> "Executar como administrador"
REM  Requer: nada. Node 20 portatil e NSSM ja estao no zip.
REM ============================================================

setlocal
set "ROOT=%~dp0"
set "ROOT=%ROOT:~0,-1%"
set "SERVICE_NAME=EsticatrocaPrint"
set "DISPLAY_NAME=Esticatroca Print"
set "NODE_EXE=%ROOT%\node\node.exe"
set "SERVER_JS=%ROOT%\dist\server.js"
set "NSSM=%ROOT%\nssm.exe"
set "LOG_DIR=%ROOT%\logs"

REM --- Checagem de admin ----------------------------------------
net session >nul 2>&1
if %errorLevel% neq 0 (
  echo.
  echo ERRO: este script precisa ser executado como administrador.
  echo Clique com o botao direito em install.bat e escolha "Executar como administrador".
  echo.
  pause
  exit /b 1
)

REM --- Checagem de arquivos -------------------------------------
if not exist "%NODE_EXE%" (
  echo ERRO: %NODE_EXE% nao encontrado. O zip esta incompleto.
  pause & exit /b 1
)
if not exist "%SERVER_JS%" (
  echo ERRO: %SERVER_JS% nao encontrado. O zip esta incompleto.
  pause & exit /b 1
)
if not exist "%NSSM%" (
  echo ERRO: %NSSM% nao encontrado. O zip esta incompleto.
  pause & exit /b 1
)

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

REM --- Se ja existe, remove antes -------------------------------
"%NSSM%" status %SERVICE_NAME% >nul 2>&1
if %errorLevel% equ 0 (
  echo Servico ja existe. Parando e removendo antes de reinstalar...
  "%NSSM%" stop %SERVICE_NAME% >nul 2>&1
  "%NSSM%" remove %SERVICE_NAME% confirm >nul 2>&1
)

REM --- Instala --------------------------------------------------
echo Instalando servico "%DISPLAY_NAME%"...
"%NSSM%" install %SERVICE_NAME% "%NODE_EXE%" "%SERVER_JS%"
if %errorLevel% neq 0 goto :err

"%NSSM%" set %SERVICE_NAME% DisplayName "%DISPLAY_NAME%"
"%NSSM%" set %SERVICE_NAME% Description "Servico local de impressao ESC/POS (WS ws://localhost:6441, admin http://localhost:6442)."
"%NSSM%" set %SERVICE_NAME% AppDirectory "%ROOT%"
"%NSSM%" set %SERVICE_NAME% Start SERVICE_AUTO_START
"%NSSM%" set %SERVICE_NAME% AppStdout "%LOG_DIR%\service-stdout.log"
"%NSSM%" set %SERVICE_NAME% AppStderr "%LOG_DIR%\service-stderr.log"
"%NSSM%" set %SERVICE_NAME% AppRotateFiles 1
"%NSSM%" set %SERVICE_NAME% AppRotateOnline 1
"%NSSM%" set %SERVICE_NAME% AppRotateBytes 10485760
"%NSSM%" set %SERVICE_NAME% AppEnvironmentExtra NODE_ENV=production PRINT_LOG_LEVEL=info
"%NSSM%" set %SERVICE_NAME% AppExit Default Restart
"%NSSM%" set %SERVICE_NAME% AppRestartDelay 2000

echo Iniciando servico...
"%NSSM%" start %SERVICE_NAME%
if %errorLevel% neq 0 goto :err

echo.
echo ============================================================
echo  Servico instalado e iniciado.
echo  Admin UI: http://localhost:6442/
echo  WebSocket: ws://localhost:6441
echo  Logs: %LOG_DIR%
echo ============================================================
echo.
pause
exit /b 0

:err
echo.
echo ERRO na instalacao. Codigo: %errorLevel%
echo Veja a saida acima e logs em %LOG_DIR%.
pause
exit /b 1
