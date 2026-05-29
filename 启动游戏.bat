@echo off
chcp 65001 >nul
title 五子棋游戏

echo.
echo   ╔════════════════════════════╗
echo   ║       五 子 棋           ║
echo   ╚════════════════════════════╝
echo.
echo   1. 本地双人对战
echo   2. 联网对战 (需要分享链接)
echo.
set /p choice="请选择 (1 或 2): "

if "%choice%"=="1" (
    echo.
    echo 正在打开本地版...
    start "" "%~dp0index.html"
    goto :end
)

if "%choice%"=="2" (
    echo.
    echo 正在启动联网模式...
    echo.

    REM 启动 HTTP 服务器
    echo [1/3] 启动本地服务器...
    start "五子棋服务器" /min cmd /c "cd /d %~dp0 && node server.js"
    timeout /t 2 /nobreak >nul

    REM 启动 localtunnel
    echo [2/3] 建立公网隧道...
    start "公网隧道" /min cmd /c "cd /d %~dp0 && npx --yes localtunnel --port 3000 > %~dp0tunnel_url.txt 2>&1"

    REM 等待隧道建立
    echo [3/3] 等待隧道建立...
    timeout /t 8 /nobreak >nul

    REM 读取隧道 URL
    if exist "%~dp0tunnel_url.txt" (
        for /f "tokens=*" %%a in ('type "%~dp0tunnel_url.txt" ^| findstr "url"') do (
            set TUNNEL_URL=%%a
        )
    )

    REM 清理临时文件
    del "%~dp0tunnel_url.txt" 2>nul

    echo.
    echo ════════════════════════════════════════════
    echo   公网地址: https://smooth-chicken-fail.loca.lt
    echo.
    echo   请手动在浏览器打开上面的地址
    echo   或者打开: http://localhost:3000
    echo ════════════════════════════════════════════
    echo.
    echo   进入后: 联网对战 → 创建房间 → 复制链接 → 分享
    echo.

    REM 打开浏览器
    start http://localhost:3000

    pause
    goto :end
)

echo 无效选择
:end
