@echo off
chcp 65001 >nul
cd /d "%~dp0"
if "%~1"=="" (
  echo Arraste a planilha .xlsx para cima deste arquivo.
  pause
  exit /b
)
if not exist .env.local (
  echo.
  echo Primeira vez: cole a sua chave da API Atlasender e aperte Enter.
  echo ^(Clique com o botao direito na janela para colar.^)
  set /p ATLAS_KEY=Chave: 
)
if not exist .env.local (
  if "%ATLAS_KEY%"=="" (
    echo Nenhuma chave informada.
    pause
    exit /b
  )
  >.env.local echo ATLASENDER_API_KEY=%ATLAS_KEY%
  echo Chave salva.
)
if not exist node_modules (
  echo Instalando dependencias, aguarde...
  call npm install
)
call npm run lote -- "%~1" --modo cpf
pause
