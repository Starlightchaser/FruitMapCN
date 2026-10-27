@echo off
setlocal
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Python environment not found. See CMD-GUIDE.md.
  pause
  exit /b 1
)
if not exist "frontend\dist\index.html" (
  echo Frontend build not found. See CMD-GUIDE.md.
  pause
  exit /b 1
)
echo FruitMap: http://127.0.0.1:8018
echo Keep this window open. Press Ctrl+C to stop.
".venv\Scripts\python.exe" -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8018
if errorlevel 1 pause
