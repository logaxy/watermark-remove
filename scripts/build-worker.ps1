$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$WorkerDir = Join-Path $Root "worker"
$OutDir = Join-Path $Root "resources\bin\win"
$VenvPython = Join-Path $Root ".venv\Scripts\python.exe"

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

if (-not (Test-Path $VenvPython)) {
  python -m venv (Join-Path $Root ".venv")
}

& $VenvPython -m pip install --upgrade pip
& $VenvPython -m pip install -r (Join-Path $WorkerDir "requirements.txt") pyinstaller

Push-Location $WorkerDir
& $VenvPython -m PyInstaller --noconfirm --clean worker.spec
Pop-Location

Copy-Item -Force (Join-Path $WorkerDir "dist\watermark-worker.exe") $OutDir
Write-Host "Worker 构建完成: $OutDir\watermark-worker.exe"
