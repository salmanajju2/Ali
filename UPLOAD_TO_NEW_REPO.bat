@echo off
cd /d "%~dp0"
echo ========================================
echo   FIXING VERCEL DEPLOYMENT IDENTITY
echo ========================================
echo Setting identity to: salmanajju2@gmail.com
echo.

:: 1. Set Git Identity to match Vercel owner
git config user.email "salmanajju2@gmail.com"
git config user.name "salmanajju2"

set TOKEN=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
set REPO_URL=https://%TOKEN%@github.com/salmanajju2/ALIENTERPRISES.git

:: 2. Add and Amend the last commit with correct author
echo [1/2] Amending last commit with correct identity...
git add .
git commit --amend --reset-author --no-edit

:: 3. Push to GitHub
echo [2/2] Pushing updated commit to GitHub...
git remote set-url origin %REPO_URL%
git push origin main --force

if %errorlevel% equ 0 (
    echo.
    echo ========================================
    echo SUCCESS! Identity fixed and code pushed.
    echo Vercel should now start the deployment.
    echo ========================================
) else (
    echo.
    echo FAILED! Please check your internet.
)

pause
