@echo off
title Wisebudget Server
echo.
echo ==========================================
echo   WISEBUDGET - LOCAL SERVER CHECK
echo ==========================================
echo.
echo A verificar se o servidor esta pronto para arrancar...
echo.

:: Tenta correr o script dev
call npm run dev

:: Se falhar (ex: erro no npm ou script nao encontrado), pausa para o utilizador ler
if %errorlevel% neq 0 (
  echo.
  echo [ERRO] O servidor parou inesperadamente.
  echo Verifique se instalou o Node.js e correu "npm install".
  echo.
  pause
)
