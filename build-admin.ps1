# 以管理员权限运行 Electron 构建脚本
# 解决 Windows 上符号链接权限问题

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Electron Builder - 管理员模式构建" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查是否以管理员权限运行
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "需要管理员权限来创建符号链接" -ForegroundColor Yellow
    Write-Host "正在以管理员权限重新启动..." -ForegroundColor Yellow
    Write-Host ""
    # 以管理员权限重新启动脚本
    Start-Process powershell -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    exit
} else {
    Write-Host "✓ 正在以管理员权限运行" -ForegroundColor Green
    Write-Host ""
}

# 检查 Node.js
try {
    $nodeVersion = node --version
    Write-Host "✓ Node.js 版本: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "✗ 未找到 Node.js" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "构建选项:" -ForegroundColor Cyan
Write-Host "1. 完整构建（包含代码签名）" -ForegroundColor White
Write-Host "2. 构建但不签名（跳过签名，避免符号链接问题）" -ForegroundColor White
Write-Host "3. 仅打包（不构建安装程序）" -ForegroundColor White
Write-Host "4. 清理缓存后构建" -ForegroundColor White
Write-Host ""

$choice = Read-Host "请选择 (1/2/3/4)"

switch ($choice) {
    "1" {
        Write-Host ""
        Write-Host "开始完整构建..." -ForegroundColor Yellow
        pnpm run build
        if ($LASTEXITCODE -eq 0) {
            electron-builder
        }
    }
    "2" {
        Write-Host ""
        Write-Host "开始构建（跳过签名）..." -ForegroundColor Yellow
        pnpm run build
        if ($LASTEXITCODE -eq 0) {
            electron-builder --win --config.win.sign=false
        }
    }
    "3" {
        Write-Host ""
        Write-Host "开始打包..." -ForegroundColor Yellow
        pnpm run build
        if ($LASTEXITCODE -eq 0) {
            pnpm run pack
        }
    }
    "4" {
        Write-Host ""
        Write-Host "清理 electron-builder 缓存..." -ForegroundColor Yellow
        $cachePath = "$env:LOCALAPPDATA\electron-builder\Cache"
        if (Test-Path $cachePath) {
            Remove-Item -Path $cachePath -Recurse -Force
            Write-Host "✓ 缓存已清理" -ForegroundColor Green
        }
        Write-Host ""
        Write-Host "开始构建..." -ForegroundColor Yellow
        pnpm run build
        if ($LASTEXITCODE -eq 0) {
            electron-builder
        }
    }
    default {
        Write-Host "无效的选择" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "按任意键退出..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

