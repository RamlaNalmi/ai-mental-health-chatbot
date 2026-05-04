@echo off
echo Starting AI Chatbot Microservices in E:\Research...
echo.

echo [1/3] Attempting to start Stress API (Port 5000)...
start "Stress API" cmd /c "python Api.py & pause"

echo [2/3] Starting Emotion Detection API (Port 5001)...
start "Emotion API" cmd /c "cd emotion_backend && python API.py & pause"

echo [3/3] Starting API Gateway (Port 5002)...
start "API Gateway" cmd /c "python api_gateway.py & pause"

echo.
echo All background windows launched!
echo.
pause
