$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

Write-Host "==> 安装 Node 依赖"
npm install

Write-Host "==> 构建前端与主进程"
npm run build

Write-Host "==> 注入版本信息"
bash scripts/inject-version.sh

Write-Host "==> 下载 FFmpeg"
powershell -ExecutionPolicy Bypass -File "$Root\scripts\fetch-ffmpeg.ps1"

Write-Host "==> 下载中文字体"
$FontDir = Join-Path $Root "resources\fonts"
$FontTarget = Join-Path $FontDir "NotoSansSC-Regular.otf"
$FontUrls = @(
  "https://github.com/notofonts/noto-cjk/releases/download/Sans2.004/03_NotoSansCJKsc-Regular.otf",
  "https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf"
)
if (-not (Test-Path $FontTarget)) {
  New-Item -ItemType Directory -Force -Path $FontDir | Out-Null
  $downloaded = $false
  foreach ($url in $FontUrls) {
    try {
      Write-Host "尝试下载字体: $url"
      Invoke-WebRequest -Uri $url -OutFile $FontTarget -MaximumRedirection 5 -TimeoutSec 60
      if ((Get-Item $FontTarget).Length -gt 0) {
        $downloaded = $true
        Write-Host "字体下载成功"
        break
      }
    } catch {
      Write-Host "字体下载失败: $url - $($_.Exception.Message)"
    }
  }
  if (-not $downloaded) {
    Write-Host "警告: 无法下载字体，尝试使用系统字体"
    $systemFont = "C:\Windows\Fonts\msyh.ttc"
    if (Test-Path $systemFont) {
      Copy-Item $systemFont $FontTarget
      Write-Host "已复制系统字体"
    } else {
      Write-Host "警告: 无法获取中文字体，应用可能无法正确显示中文"
    }
  }
}

Write-Host "==> 构建 Python Worker"
powershell -ExecutionPolicy Bypass -File "$Root\scripts\build-worker.ps1"

Write-Host "==> 打包 Windows 应用"
npx electron-builder --win --publish never

Write-Host "==> 完成，产物位于 release\"
