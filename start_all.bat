@echo off
echo Starting frontend and backend...

start "Frontend Server" cmd /k "cd frontend && npm run dev"
start "Backend Server" cmd /k "cd backend && python run.py"

echo Both servers are starting in separate windows.
echo Waiting for servers to start...
timeout /t 3 /nobreak >nul

echo Opening browser...
start http://localhost:3000

echo All done! Close this window to continue.
pause
