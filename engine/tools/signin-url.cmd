@echo off
rem Lumi sets BROWSER to this file while `claude auth login` runs. Claude Code calls it with the sign-in URL (quoted)
rem instead of opening the default browser; Lumi reads the URL and opens it in a private Edge window (or the normal
rem browser if the person chose that). It never opens anything itself.
if "%LUMI_SIGNIN_URL_FILE%"=="" exit /b 1
>"%LUMI_SIGNIN_URL_FILE%" echo %1
exit /b 0
