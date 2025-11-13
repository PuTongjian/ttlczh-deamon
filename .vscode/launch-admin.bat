@echo off
REM 以管理员权限启动 Electron 并启用调试
REM 此脚本用于启动 Electron 应用，然后使用 VSCode 的 "Debug Main Process (Attach)" 配置附加调试

echo ========================================
echo 以管理员权限启动 Electron (调试模式)
echo ========================================
echo.

REM 检查是否以管理员权限运行
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo 未以管理员权限运行，正在请求管理员权限...
    echo.
    
    REM 获取脚本所在目录（.vscode）
    set "SCRIPT_DIR=%~dp0"
    REM 获取工作区根目录
    set "WORKSPACE_ROOT=%SCRIPT_DIR%.."
    
    REM 构建 Electron 路径
    set "ELECTRON_EXE=%WORKSPACE_ROOT%\node_modules\.bin\electron.cmd"
    if not exist "%ELECTRON_EXE%" (
        set "ELECTRON_EXE=%WORKSPACE_ROOT%\node_modules\electron\dist\electron.exe"
    )
    
    REM 构建主进程入口文件
    set "MAIN_JS=%WORKSPACE_ROOT%\dist\main\index.js"
    
    REM 设置环境变量
    set "NODE_ENV=development"
    
    REM 以管理员权限启动 Electron（启用调试端口 9229）
    echo 正在以管理员权限启动 Electron...
    echo 调试端口: 9229
    echo 请在 VSCode 中使用 "Debug Main Process (Attach)" 配置附加到进程
    echo.
    
    powershell -Command "Start-Process '%ELECTRON_EXE%' -Verb RunAs -ArgumentList '%MAIN_JS%', '--inspect=9229' -WorkingDirectory '%WORKSPACE_ROOT%'"
    exit /b
)

echo [√] 已以管理员权限运行
echo.

REM 获取脚本所在目录（.vscode）
set "SCRIPT_DIR=%~dp0"
REM 获取工作区根目录
set "WORKSPACE_ROOT=%SCRIPT_DIR%.."

REM 构建 Electron 路径
set "ELECTRON_EXE=%WORKSPACE_ROOT%\node_modules\.bin\electron.cmd"
if not exist "%ELECTRON_EXE%" (
    set "ELECTRON_EXE=%WORKSPACE_ROOT%\node_modules\electron\dist\electron.exe"
)

if not exist "%ELECTRON_EXE%" (
    echo [×] 错误: 找不到 Electron 可执行文件
    echo 请确保已安装 Electron: npm install
    pause
    exit /b 1
)

REM 构建主进程入口文件
set "MAIN_JS=%WORKSPACE_ROOT%\dist\main\index.js"

if not exist "%MAIN_JS%" (
    echo [×] 错误: 找不到主进程文件: %MAIN_JS%
    echo 请先编译主进程: npm run build:main
    pause
    exit /b 1
)

REM 设置环境变量
set "NODE_ENV=development"
set "NODE_OPTIONS=--inspect=9229"

echo 启动 Electron: %MAIN_JS%
echo 调试端口: 9229
echo.
echo 请在 VSCode 中使用 "Debug Main Process (Attach)" 配置附加到进程
echo 或者等待 3 秒后自动启动...
timeout /t 3 /nobreak >nul
echo.

REM 切换到工作区目录并启动 Electron
cd /d "%WORKSPACE_ROOT%"
"%ELECTRON_EXE%" "%MAIN_JS%" --inspect=9229

pause

