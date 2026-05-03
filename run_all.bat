@echo off
:: ============================================================
:: run_all.bat - Start all microservices in E:\Research
:: ============================================================
::
:: Services started:
::   [Port 5000] Facial Stress API (Api.py) - Only if exists
::   [Port 5001] Emotion Detection API (emotion_backend/API.py)
::   [Port 5002] API Gateway

echo Starting AI Chatbot Microservices in E:\Research...
echo.

:: 1. Start the Stress API (Api.py)
if exist Api.py (
    echo [1/3] Starting Facial Stress API (Port 5000)...
    start "Stress API" cmd /c "python Api.py & pause"
    timeout /t 2 /nobreak >nul
) else (
    echo [1/3] Stress API (Api.py) not found, skipping...
)

:: 2. Start the Emotion API (emotion_backend/API.py)
echo [2/3] Starting Emotion Detection API (Port 5001)...
start "Emotion API" cmd /c "cd emotion_backend && python API.py & pause"
timeout /t 2 /nobreak >nul

:: 3. Start the API Gateway (api_gateway.py)
echo [3/3] Starting API Gateway (Port 5002)...
start "API Gateway" cmd /c "python api_gateway.py & pause"

echo.
echo Services have been launched in separate windows!
echo Unified Endpoint: http://localhost:5002/final-result
echo.
pause
