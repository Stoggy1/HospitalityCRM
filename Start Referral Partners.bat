@echo off
cd /d "%~dp0"
echo Starting CovenantGO Referral Partners...
start "" http://localhost:5200
node server.mjs
pause
