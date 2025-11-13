# PowerShell 脚本：以管理员权限启动 Electron 并启用调试
# 此脚本由 VSCode 任务调用，用于以管理员权限启动 Electron

# 检查是否以管理员权限运行
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "未以管理员权限运行，正在请求管理员权限..." -ForegroundColor Yellow
    
    # 获取当前脚本路径和工作区根目录
    $scriptPath = $MyInvocation.MyCommand.Path
    $workspaceRoot = Split-Path -Parent (Split-Path -Parent $scriptPath)
    
    # 获取 Electron 可执行文件路径
    $electronExe = Join-Path $workspaceRoot "node_modules\.bin\electron.cmd"
    if (-not (Test-Path $electronExe)) {
        $electronExe = Join-Path $workspaceRoot "node_modules\electron\dist\electron.exe"
    }
    
    if (-not (Test-Path $electronExe)) {
        Write-Host "错误: 找不到 Electron 可执行文件" -ForegroundColor Red
        Write-Host "请确保已安装 Electron: npm install" -ForegroundColor Yellow
        exit 1
    }
    
    # 构建 Electron 入口文件路径
    $mainJs = Join-Path $workspaceRoot "dist\main\index.js"
    
    # 设置环境变量
    $env:NODE_ENV = "development"
    $env:ELECTRON_RUN_AS_NODE = ""
    
    # 构建启动参数（启用调试）
    $electronArgs = @(
        $mainJs,
        "--inspect=9229"
    )
    
    # 以管理员权限启动 Electron
    Write-Host "正在以管理员权限启动 Electron..." -ForegroundColor Cyan
    Write-Host "调试端口: 9229" -ForegroundColor Cyan
    Write-Host "请在 VSCode 中使用 'Debug Main Process (Attach)' 配置附加到进程" -ForegroundColor Yellow
    
    Start-Process $electronExe -Verb RunAs -ArgumentList $electronArgs -WorkingDirectory $workspaceRoot
    exit
}

Write-Host "已以管理员权限运行" -ForegroundColor Green

# 获取工作区根目录
$scriptPath = $MyInvocation.MyCommand.Path
$workspaceRoot = Split-Path -Parent (Split-Path -Parent $scriptPath)

# 获取 Electron 可执行文件路径
$electronExe = Join-Path $workspaceRoot "node_modules\.bin\electron.cmd"
if (-not (Test-Path $electronExe)) {
    $electronExe = Join-Path $workspaceRoot "node_modules\electron\dist\electron.exe"
}

if (-not (Test-Path $electronExe)) {
    Write-Host "错误: 找不到 Electron 可执行文件" -ForegroundColor Red
    Write-Host "请确保已安装 Electron: npm install" -ForegroundColor Yellow
    exit 1
}

# 构建 Electron 入口文件路径
$mainJs = Join-Path $workspaceRoot "dist\main\index.js"

# 设置环境变量
$env:NODE_ENV = "development"
$env:ELECTRON_RUN_AS_NODE = ""

# 启用 Node.js 调试
$env:NODE_OPTIONS = "--inspect=9229"

Write-Host "启动 Electron: $mainJs" -ForegroundColor Cyan
Write-Host "调试端口: 9229" -ForegroundColor Cyan
Write-Host "请在 VSCode 中使用 'Debug Main Process (Attach)' 配置附加到进程" -ForegroundColor Yellow

# 启动 Electron
Set-Location $workspaceRoot
& $electronExe $mainJs --inspect=9229

