# Arranca backend (8000) y frontend (5173) en ventanas propias.
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

$py = Join-Path $root ".venv\Scripts\python.exe"
if (-not (Test-Path $py)) {
  Write-Host "Falta el venv. Ejecuta: py -3.13 -m venv .venv" -ForegroundColor Red
  exit 1
}

Write-Host "Backend  -> http://localhost:8000" -ForegroundColor Cyan
Start-Process -FilePath $py `
  -ArgumentList "-m", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000" `
  -WorkingDirectory $root -WindowStyle Minimized

Start-Sleep -Seconds 2

Write-Host "Frontend -> http://localhost:5173" -ForegroundColor Cyan
Start-Process -FilePath "npm.cmd" -ArgumentList "run", "dev" `
  -WorkingDirectory (Join-Path $root "dashboard") -WindowStyle Minimized

Start-Sleep -Seconds 3
Write-Host ""
Write-Host "Dashboard listo en http://localhost:5173" -ForegroundColor Green
Write-Host "Para parar: Get-Process python,node | Stop-Process" -ForegroundColor DarkGray
