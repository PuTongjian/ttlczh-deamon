@echo off
REM 以管理员权限运行 Electron 构建脚本

echo ========================================
echo Electron Builder - 管理员模式构建
echo ========================================
echo.

REM 检查是否以管理员权限运行
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo 需要管理员权限来创建符号链接
    echo 正在以管理员权限重新启动...
    echo.
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
) else (
    echo [√] 正在以管理员权限运行
    echo.
)

REM 检查 Node.js
where node >nul 2>&1
if %errorLevel% neq 0 (
    echo [×] 未找到 Node.js
    pause
    exit /b 1
)

echo.
echo 构建选项:
echo 1. 完整构建（包含代码签名）
echo 2. 构建但不签名（跳过签名，避免符号链接问题）
echo 3. 仅打包（不构建安装程序）
echo 4. 清理缓存后构建
echo.

set /p choice="请选择 (1/2/3/4): "

if "%choice%"=="1" (
    echo.
    echo 开始完整构建...
    call pnpm run build
    if %errorLevel% equ 0 (
        call electron-builder
    )
) else if "%choice%"=="2" (
    echo.
    echo 开始构建（跳过签名）...
    call pnpm run build
    if %errorLevel% equ 0 (
        call electron-builder --win --config.win.certificateFile=null --config.win.signingHashAlgorithms=null
    )
) else if "%choice%"=="3" (
    echo.
    echo 开始打包...
    call pnpm run build
    if %errorLevel% equ 0 (
        call pnpm run pack
    )
) else if "%choice%"=="4" (
    echo.
    echo 清理 electron-builder 缓存...
    set CACHE_PATH=%LOCALAPPDATA%\electron-builder\Cache
    if exist "%CACHE_PATH%" (
        rd /s /q "%CACHE_PATH%"
        echo [√] 缓存已清理
    )
    echo.
    echo 开始构建...
    call pnpm run build
    if %errorLevel% equ 0 (
        call electron-builder
    )
) else (
    echo 无效的选择
)

echo.
pause

