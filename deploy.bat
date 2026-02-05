@echo off
title Wisebudget Deployer
echo.
echo ==========================================
echo   WISEBUDGET - DEPLOYMENT TOOL
echo ==========================================
echo.
echo Este script vai:
echo 1. Adicionar todas as alteracoes (git add .)
echo 2. Registar um commit (git commit)
echo 3. Enviar para o GitHub (git push)
echo 4. Atualizar o Firebase Hosting (firebase deploy)
echo.

set /p commitMsg="Introduz a mensagem do commit: "

if "%commitMsg%"=="" (
    echo.
    echo [AVISO] A mensagem nao pode ser vazia. A cancelar...
    pause
    exit /b
)

echo.
echo [1/4] A adicionar ficheiros...
git add .
if %errorlevel% neq 0 goto error

echo.
echo [2/4] A criar commit...
git commit -m "%commitMsg%"
if %errorlevel% neq 0 goto error

echo.
echo [3/4] A enviar para o GitHub...
git push
if %errorlevel% neq 0 goto error

echo.
echo [4/4] A fazer deploy para o Firebase...
firebase deploy
if %errorlevel% neq 0 goto error

echo.
echo ==========================================
echo   SUCESSO! Projeto atualizado.
echo ==========================================
echo.
pause
exit /b

:error
echo.
echo ==========================================
echo   ERRO! O processo parou.
echo ==========================================
echo.
pause
exit /b
