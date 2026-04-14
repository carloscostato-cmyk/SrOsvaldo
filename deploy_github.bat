@echo off
echo.
echo ==============================================
echo 🚀 ATUALIZANDO GITHUB - SR. OSVALDO
echo ==============================================
echo.

git add .
git commit -m "Atualizacao automatica: %date% %time%"
git push origin main

echo.
echo ==============================================
echo ✅ PROJETO ATUALIZADO NO GITHUB COM SUCESSO!
echo ==============================================
timeout /t 5
