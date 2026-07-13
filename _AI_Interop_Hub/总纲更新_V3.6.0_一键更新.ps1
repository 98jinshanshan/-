# 总纲 V3.6.0 一键更新脚本
# 使用方法：将此脚本和 总纲更新包_V3.6.0_20260713.zip 放在同一目录下，右键"使用 PowerShell 运行"

$ErrorActionPreference = "Stop"

# 自动查找同目录下的 zip 文件
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$zipFile = Join-Path $scriptDir "总纲更新包_V3.6.0_20260713.zip"
$targetDir = "G:\_AI_Interop_Hub"
$govDir = Join-Path $targetDir "00-governance"

# 检查 zip 是否存在
if (-not (Test-Path $zipFile)) {
    Write-Host "[错误] 找不到更新包: $zipFile" -ForegroundColor Red
    Write-Host "请确保此脚本和 zip 文件在同一目录下" -ForegroundColor Yellow
    Read-Host "按回车退出"
    exit 1
}

# 检查目标目录是否存在
if (-not (Test-Path $govDir)) {
    Write-Host "[错误] 目标目录不存在: $govDir" -ForegroundColor Red
    Read-Host "按回车退出"
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  总纲更新包 V3.6.0 — 一键更新" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 创建临时解压目录
$tempDir = Join-Path $env:TEMP "constitution_update_v360"
if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force }
New-Item -ItemType Directory -Path $tempDir | Out-Null

# 解压
Write-Host "[1/4] 解压更新包..." -ForegroundColor White
Expand-Archive -Path $zipFile -DestinationPath $tempDir -Force
Write-Host "      解压完成" -ForegroundColor Green

# 定义文件映射：zip内相对路径 → 目标路径，以及操作类型
$sourceBase = Join-Path $tempDir "总纲更新包_V3.6.0_20260713\00-governance"

$overwriteFiles = @(
    "开发总纲_人类可读版.md",
    "开发总纲_可执行版.json",
    "开发总纲_问答题框架.md",
    "AGENT_INSTRUCTION.md",
    "Agent子节点沟通模板.md",
    "orchestrator.js"
)

$newFiles = @(
    "三IDE角色自动化联通协议_V1.0.md",
    "开发总纲_V3.5_优化方案.md"
)

# 覆盖更新
Write-Host "[2/4] 覆盖更新 6 个文件..." -ForegroundColor White
foreach ($f in $overwriteFiles) {
    $src = Join-Path $sourceBase $f
    $dst = Join-Path $govDir $f
    if (Test-Path $src) {
        Copy-Item -Path $src -Destination $dst -Force
        Write-Host "      [覆盖] $f" -ForegroundColor Yellow
    } else {
        Write-Host "      [跳过] $f (zip 中不存在)" -ForegroundColor DarkGray
    }
}

# 新增文件
Write-Host "[3/4] 新增 2 个文件..." -ForegroundColor White
foreach ($f in $newFiles) {
    $src = Join-Path $sourceBase $f
    $dst = Join-Path $govDir $f
    if (Test-Path $src) {
        if (Test-Path $dst) {
            Copy-Item -Path $src -Destination $dst -Force
            Write-Host "      [覆盖] $f (已存在，覆盖)" -ForegroundColor Yellow
        } else {
            Copy-Item -Path $src -Destination $dst
            Write-Host "      [新增] $f" -ForegroundColor Green
        }
    } else {
        Write-Host "      [跳过] $f (zip 中不存在)" -ForegroundColor DarkGray
    }
}

# 追加 CHANGELOG
Write-Host "[4/4] 追更 CHANGELOG..." -ForegroundColor White
$changelogAppend = Join-Path $sourceBase "CHANGELOG_APPEND_V3.6.0.md"
$changelogExisting = Join-Path $govDir "CHANGELOG.md"
if ((Test-Path $changelogAppend) -and (Test-Path $changelogExisting)) {
    $appendContent = Get-Content $changelogAppend -Raw -Encoding UTF8
    Add-Content -Path $changelogExisting -Value "`n`n$appendContent" -Encoding UTF8
    Write-Host "      [追加] CHANGELOG.md" -ForegroundColor Green
} elseif (Test-Path $changelogAppend) {
    Copy-Item -Path $changelogAppend -Destination $changelogExisting
    Write-Host "      [创建] CHANGELOG.md (不存在，直接复制)" -ForegroundColor Green
} else {
    Write-Host "      [跳过] CHANGELOG 追加内容不存在" -ForegroundColor DarkGray
}

# 清理临时目录
Remove-Item $tempDir -Recurse -Force

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  更新完成！" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "已更新：" -ForegroundColor White
Write-Host "  00-governance\ 下 8 个文件（6 覆盖 + 2 新增）"
Write-Host "  CHANGELOG.md 已追加 V3.6.0 记录"
Write-Host ""
Write-Host "未动：" -ForegroundColor White
Write-Host "  00-governance\rules\  子文件夹"
Write-Host "  00-governance\scripts\ 子文件夹"
Write-Host "  00-governance\manifest.json"
Write-Host ""

Read-Host "按回车退出"
