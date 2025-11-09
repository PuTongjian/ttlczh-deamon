@echo off
REM Electron 应用调试启动脚本（批处理版本）

echo ========================================
echo Electron WSS Daemon Manager - 调试模式
echo ========================================
echo.

REM 检查是否以管理员权限运行
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo 警告: 当前未以管理员权限运行
    echo 某些操作（证书导入、hosts 修改）需要管理员权限
    echo.
    echo 正在以管理员权限重新启动...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
) else (
    echo [√] 正在以管理员权限运行
    echo.
)

REM 检查 Node.js
where node >nul 2>&1
if %errorLevel% neq 0 (
    echo [×] 未找到 Node.js，请先安装 Node.js
    pause
    exit /b 1
)

node --version >nul 2>&1
if %errorLevel% equ 0 (
    for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
    echo [√] Node.js 版本: %NODE_VERSION%
    echo.
)

REM 检查依赖
if not exist "node_modules" (
    echo 正在安装依赖...
    call npm install
    if %errorLevel% neq 0 (
        echo [×] 依赖安装失败
        pause
        exit /b 1
    )
)

echo.
echo 启动选项:
echo 1. 开发模式（推荐）- 启动 Vite 开发服务器和 Electron
echo 2. 仅启动 Electron（需要先手动启动 Vite）
echo 3. 查看日志文件
echo.

set /p choice="请选择 (1/2/3): "

if "%choice%"=="1" (
    echo.
    echo 启动开发模式...
    echo 提示: 日志将同时输出到控制台和日志文件
    echo 日志文件位置: %%APPDATA%%\electron-wss-daemon-manager\logs\
    echo.
    call npm run dev
) else if "%choice%"=="2" (
    echo.
    echo 启动 Electron...
    echo 提示: 确保 Vite 开发服务器已在 http://localhost:5173 运行
    echo.
    call npm run dev:main
) else if "%choice%"=="3" (
    set LOG_PATH=%APPDATA%\electron-wss-daemon-manager\logs
    if exist "%LOG_PATH%" (
        echo.
        echo 日志文件位置: %LOG_PATH%
        echo.
        explorer "%LOG_PATH%"
    ) else (
        echo 日志目录不存在: %LOG_PATH%
    )
) else (
    echo 无效的选择
)

echo.
pause

