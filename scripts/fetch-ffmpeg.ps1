$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
# electron-builder 在 Windows 上 ${os} = win，输出目录必须与此一致
$OutDir = Join-Path $Root "resources\bin\win"
$TmpDir = Join-Path ([System.IO.Path]::GetTempPath()) ("ffmpeg-" + [guid]::NewGuid().ToString())
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
New-Item -ItemType Directory -Force -Path $TmpDir | Out-Null

$ArchiveUrl = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"
$ArchivePath = Join-Path $TmpDir "ffmpeg.zip"

Write-Host "下载 FFmpeg..."
Invoke-WebRequest -Uri $ArchiveUrl -OutFile $ArchivePath
Expand-Archive -Path $ArchivePath -DestinationPath $TmpDir -Force

$BinDir = Get-ChildItem -Path $TmpDir -Directory | Where-Object { $_.Name -like "ffmpeg-*-essentials_build" } | Select-Object -First 1
if (-not $BinDir) {
  throw "未找到 FFmpeg 解压目录"
}

Copy-Item -Force (Join-Path $BinDir.FullName "bin\ffmpeg.exe") $OutDir
Copy-Item -Force (Join-Path $BinDir.FullName "bin\ffprobe.exe") $OutDir
Remove-Item -Recurse -Force $TmpDir

Write-Host "FFmpeg 已就绪: $OutDir"
