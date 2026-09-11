@echo off
setlocal enabledelayedexpansion
echo ============================================================
echo   Verification pre-publication - Anomia Launcher
echo ============================================================
echo.

set ERROR_FOUND=0

echo [1/3] Recherche de conflits Git non resolus...
findstr /R /C:"^<<<<<<< " main.js preload.js config.js src\index.html src\renderer.js src\style.css >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo   ECHEC : marqueurs de conflit Git trouves ^^^^^^^^^^^^^^ !
    findstr /R /N /C:"^<<<<<<< " /C:"^=======$" /C:"^>>>>>>> " main.js preload.js config.js src\index.html src\renderer.js src\style.css
    set ERROR_FOUND=1
) else (
    echo   OK : aucun conflit trouve
)
echo.

echo [2/3] Verification syntaxe JavaScript...
call node --check main.js
if %ERRORLEVEL% NEQ 0 ( echo   ECHEC : main.js & set ERROR_FOUND=1 ) else ( echo   OK : main.js )

call node --check preload.js
if %ERRORLEVEL% NEQ 0 ( echo   ECHEC : preload.js & set ERROR_FOUND=1 ) else ( echo   OK : preload.js )

call node --check config.js
if %ERRORLEVEL% NEQ 0 ( echo   ECHEC : config.js & set ERROR_FOUND=1 ) else ( echo   OK : config.js )

call node --check src\renderer.js
if %ERRORLEVEL% NEQ 0 ( echo   ECHEC : src\renderer.js & set ERROR_FOUND=1 ) else ( echo   OK : src\renderer.js )
echo.

echo [3/3] Verification de l'etat Git...
git status --short
git rev-parse --abbrev-ref HEAD | findstr /C:"HEAD" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo   ATTENTION : tu es en detached HEAD, pas sur une branche !
    set ERROR_FOUND=1
) else (
    echo   OK : sur une branche normale
)
echo.

echo ============================================================
if %ERROR_FOUND% EQU 1 (
    echo   RESULTAT : DES PROBLEMES ONT ETE TROUVES - NE PUBLIE PAS
    echo   Corrige les points ci-dessus avant de faire npm run dist:win:publish
) else (
    echo   RESULTAT : TOUT EST BON, tu peux publier en toute securite
)
echo ============================================================
pause
