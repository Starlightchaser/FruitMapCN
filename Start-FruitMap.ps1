param([ValidateRange(1024,65535)][int]$Port = 8018)
$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$pythonPath = Join-Path $projectRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $pythonPath)) {
    throw 'Install the project environment first. See README.md.'
}
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'frontend\dist\index.html'))) {
    throw 'Build the frontend first: cd frontend; pnpm run build'
}
Write-Host "FruitMap: http://127.0.0.1:$Port"
Write-Host 'Press Ctrl+C to stop.'
Push-Location $projectRoot
try {
    & $pythonPath -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port $Port
} finally {
    Pop-Location
}
