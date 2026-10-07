@echo off
chcp 65001 >nul
cd /d "%~dp0"
if "%~1"=="" (
  echo Arraste a planilha .xlsx para cima deste arquivo.
  pause
  exit /b
)
if not exist node_modules (
  echo Instalando dependencias, aguarde...
  call npm install
)
echo TESTE: consulta apenas o primeiro CPF da planilha (1 credito).
call npm run lote -- "%~1" --modo cpf --limite 1 --mostrar-resposta
pause
