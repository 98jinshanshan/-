@echo off
chcp 65001 >nul
echo ========================================
echo   IDE Bridge 插件一键安装
echo ========================================
echo.

REM VS Code 扩展目录命名规则：publisher.name-version
set "EXT_DIR=%USERPROFILE%\.vscode\extensions\novelcraft.ide-bridge-0.1.0"

echo [1/4] 清理旧版本...
if exist "%EXT_DIR%" rmdir /S /Q "%EXT_DIR%"

echo [2/4] 创建扩展目录...
mkdir "%EXT_DIR%"

echo [3/4] 复制插件文件...
REM %~dp0 就是当前脚本所在目录（ide-bridge-extension/）
REM 排除 node_modules、.vsix、bat 等不需要的文件
xcopy /E /Y /Q "%~dp0package.json" "%EXT_DIR%\"
xcopy /E /Y /Q "%~dp0extension.js" "%EXT_DIR%\"
xcopy /E /Y /Q "%~dp0README.md" "%EXT_DIR%\"
xcopy /E /Y /Q "%~dp0assets\*" "%EXT_DIR%\assets\"
xcopy /E /Y /Q "%~dp0src\*" "%EXT_DIR%\src\"

echo [4/4] 安装依赖...
cd /d "%EXT_DIR%"
call npm install --production

echo.
echo ========================================
echo   安装完成！
echo ========================================
echo.
echo 现在重启你的三个 IDE（Codex / OpenClaw / Cursor），
echo 插件就会自动生效。
echo.
echo 每个 IDE 首次启动时，左下角会显示「Bridge 未配置」，
echo 点一下选角色就行。
echo.
pause