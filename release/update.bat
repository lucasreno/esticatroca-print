@echo off
REM ============================================================
REM  Esticatroca Print - Atualizador
REM ============================================================
REM  Uso: copie o conteudo do novo zip POR CIMA da pasta atual
REM       (mantendo data\data.json), depois rode este .bat como
REM       administrador.
REM ============================================================

setlocal
set "ROOT=%~dp0"
set "ROOT=%ROOT:~0,-1%"
set "SERVICE_NAME=EsticatrocaPrint"
set "NSSM=%ROOT%\nssm.exe"

net session >nul 2>&1
if %errorLevel% neq 0 (
  echo ERRO: execute como administrador.
  pause & exit /b 1
)

if not exist "%NSSM%" (
  echo ERRO: nssm.exe nao encontrado.
  pause & exit /b 1
)

echo Reiniciando servico "%SERVICE_NAME%"...
"%NSSM%" restart %SERVICE_NAME%
if %errorLevel% neq 0 (
  echo ERRO ao reiniciar. O servico esta instalado?
  echo Se nao, rode install.bat primeiro.
  pause & exit /b 1
)

echo.
echo Servico reiniciado com a nova versao.
echo.
pause
exit /b 0
