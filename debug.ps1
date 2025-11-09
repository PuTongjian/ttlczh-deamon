# Electron 应用调试启动脚本
# 用于在 Windows 上以管理员权限启动应用并查看日志

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Electron WSS Daemon Manager - 调试模式" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查是否以管理员权限运行
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "警告: 当前未以管理员权限运行" -ForegroundColor Yellow
    Write-Host "某些操作（证书导入、hosts 修改）需要管理员权限" -ForegroundColor Yellow
    Write-Host ""
    $response = Read-Host "是否以管理员权限重新启动? (Y/N)"
    if ($response -eq 'Y' -or $response -eq 'y') {
        # 以管理员权限重新启动脚本
        Start-Process powershell -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
        exit
    }
} else {
    Write-Host "✓ 正在以管理员权限运行" -ForegroundColor Green
    Write-Host ""
}

# 检查 Node.js 是否安装
try {
    $nodeVersion = node --version
    Write-Host "✓ Node.js 版本: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "✗ 未找到 Node.js，请先安装 Node.js" -ForegroundColor Red
    exit 1
}

# 检查依赖是否安装
if (-not (Test-Path "node_modules")) {
    Write-Host "正在安装依赖..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "✗ 依赖安装失败" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "启动选项:" -ForegroundColor Cyan
Write-Host "1. 开发模式（推荐）- 启动 Vite 开发服务器和 Electron" -ForegroundColor White
Write-Host "2. 仅启动 Electron（需要先手动启动 Vite）" -ForegroundColor White
Write-Host "3. 查看日志文件" -ForegroundColor White
Write-Host ""

$choice = Read-Host "请选择 (1/2/3)"

switch ($choice) {
    "1" {
        Write-Host ""
        Write-Host "启动开发模式..." -ForegroundColor Yellow
        Write-Host "提示: 日志将同时输出到控制台和日志文件" -ForegroundColor Cyan
        Write-Host "日志文件位置: %APPDATA%\electron-wss-daemon-manager\logs\" -ForegroundColor Cyan
        Write-Host ""
        npm run dev
    }
    "2" {
        Write-Host ""
        Write-Host "启动 Electron..." -ForegroundColor Yellow
        Write-Host "提示: 确保 Vite 开发服务器已在 http://localhost:5173 运行" -ForegroundColor Cyan
        Write-Host ""
        npm run dev:main
    }
    "3" {
        $logPath = "$env:APPDATA\electron-wss-daemon-manager\logs"
        if (Test-Path $logPath) {
            Write-Host ""
            Write-Host "日志文件位置: $logPath" -ForegroundColor Cyan
            Write-Host ""
            $logFiles = Get-ChildItem -Path $logPath -Filter "*.log" | Sort-Object LastWriteTime -Descending
            if ($logFiles.Count -gt 0) {
                Write-Host "找到以下日志文件:" -ForegroundColor Green
                $index = 1
                foreach ($file in $logFiles) {
                    Write-Host "$index. $($file.Name) - $($file.LastWriteTime)" -ForegroundColor White
                    $index++
                }
                Write-Host ""
                $fileChoice = Read-Host "选择要查看的日志文件 (1-$($logFiles.Count))"
                $selectedFile = $logFiles[$fileChoice - 1]
                if ($selectedFile) {
                    Write-Host ""
                    Write-Host "打开日志文件: $($selectedFile.FullName)" -ForegroundColor Cyan
                    notepad $selectedFile.FullName
                }
            } else {
                Write-Host "未找到日志文件" -ForegroundColor Yellow
            }
        } else {
            Write-Host "日志目录不存在: $logPath" -ForegroundColor Yellow
        }
    }
    default {
        Write-Host "无效的选择" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "按任意键退出..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

