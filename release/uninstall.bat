@echo off
REM ============================================================
REM  Esticatroca Print - Desinstalador
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

echo Parando servico...
"%NSSM%" stop %SERVICE_NAME% >nul 2>&1

echo Removendo servico...
"%NSSM%" remove %SERVICE_NAME% confirm
if %errorLevel% neq 0 (
  echo ERRO ao remover servico.
  pause & exit /b 1
)

echo.
echo Servico removido. Os arquivos em %ROOT% continuam.
echo Voce pode apagar a pasta manualmente se quiser.
echo.
pause
exit /b 0
