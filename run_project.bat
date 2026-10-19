@echo off
title Grand Bistro Smart Table Service
cd /d "%~dp0"

echo ========================================================================
echo    Grand Bistro - Smart Table Service & Waiter Routing System
echo ========================================================================
echo.
echo Starting Backend (FastAPI on Port 8000)...
echo Starting Frontend (Web App on Port 3000)...
echo Connected to MySQL (hotel_waiter_db)...
echo.

python start.py --all --open

pause
