# IP 诊断工具 - 系统要求检查脚本

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "IP 诊断工具 - 系统要求检查" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

$allGood = $true

# 检查 Node.js
Write-Host "检查 Node.js..." -NoNewline
try {
    $nodeVersion = node --version 2>$null
    if ($nodeVersion) {
        Write-Host " ✓ 已安装 ($nodeVersion)" -ForegroundColor Green
    } else {
        Write-Host " ✗ 未安装" -ForegroundColor Red
        $allGood = $false
    }
} catch {
    Write-Host " ✗ 未安装" -ForegroundColor Red
    $allGood = $false
}

# 检查 npm
Write-Host "检查 npm..." -NoNewline
try {
    $npmVersion = npm --version 2>$null
    if ($npmVersion) {
        Write-Host " ✓ 已安装 ($npmVersion)" -ForegroundColor Green
    } else {
        Write-Host " ✗ 未安装" -ForegroundColor Red
        $allGood = $false
    }
} catch {
    Write-Host " ✗ 未安装" -ForegroundColor Red
    $allGood = $false
}

# 检查 Rust
Write-Host "检查 Rust..." -NoNewline
try {
    $rustVersion = rustc --version 2>$null
    if ($rustVersion) {
        Write-Host " ✓ 已安装 ($rustVersion)" -ForegroundColor Green
    } else {
        Write-Host " ✗ 未安装" -ForegroundColor Red
        $allGood = $false
    }
} catch {
    Write-Host " ✗ 未安装" -ForegroundColor Red
    $allGood = $false
}

# 检查 Cargo
Write-Host "检查 Cargo..." -NoNewline
try {
    $cargoVersion = cargo --version 2>$null
    if ($cargoVersion) {
        Write-Host " ✓ 已安装 ($cargoVersion)" -ForegroundColor Green
    } else {
        Write-Host " ✗ 未安装" -ForegroundColor Red
        $allGood = $false
    }
} catch {
    Write-Host " ✗ 未安装" -ForegroundColor Red
    $allGood = $false
}

# 检查 MSVC 链接器
Write-Host "检查 MSVC 链接器 (link.exe)..." -NoNewline
try {
    $linkPath = where.exe link.exe 2>$null | Select-Object -First 1
    if ($linkPath -and $linkPath -like "*Microsoft Visual Studio*") {
        Write-Host " ✓ 已安装" -ForegroundColor Green
        Write-Host "  路径: $linkPath" -ForegroundColor Gray
    } else {
        Write-Host " ✗ 未找到" -ForegroundColor Red
        Write-Host "  需要安装 Visual Studio Build Tools" -ForegroundColor Yellow
        $allGood = $false
    }
} catch {
    Write-Host " ✗ 未找到" -ForegroundColor Red
    Write-Host "  需要安装 Visual Studio Build Tools" -ForegroundColor Yellow
    $allGood = $false
}

# 检查 node_modules
Write-Host "检查项目依赖..." -NoNewline
if (Test-Path "node_modules") {
    Write-Host " ✓ 已安装" -ForegroundColor Green
} else {
    Write-Host " ✗ 未安装" -ForegroundColor Red
    Write-Host "  运行 'npm install' 安装依赖" -ForegroundColor Yellow
    $allGood = $false
}

Write-Host ""
Write-Host "=====================================" -ForegroundColor Cyan

if ($allGood) {
    Write-Host "✓ 所有要求已满足！" -ForegroundColor Green
    Write-Host ""
    Write-Host "可以运行项目了：" -ForegroundColor Green
    Write-Host "  npm run tauri dev" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "注意：程序需要管理员权限才能发送 ICMP 包" -ForegroundColor Yellow
} else {
    Write-Host "✗ 缺少必需组件" -ForegroundColor Red
    Write-Host ""
    Write-Host "请按照以下步骤操作：" -ForegroundColor Yellow
    Write-Host ""
    
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Write-Host "1. 安装 Node.js:" -ForegroundColor Yellow
        Write-Host "   https://nodejs.org/" -ForegroundColor Cyan
        Write-Host ""
    }
    
    if (-not (Get-Command rustc -ErrorAction SilentlyContinue)) {
        Write-Host "2. 安装 Rust:" -ForegroundColor Yellow
        Write-Host "   https://www.rust-lang.org/tools/install" -ForegroundColor Cyan
        Write-Host ""
    }
    
    try {
        $linkPath = where.exe link.exe 2>$null | Select-Object -First 1
        if (-not ($linkPath -and $linkPath -like "*Microsoft Visual Studio*")) {
            Write-Host "3. 安装 Visual Studio Build Tools:" -ForegroundColor Yellow
            Write-Host "   https://visualstudio.microsoft.com/zh-hans/downloads/" -ForegroundColor Cyan
            Write-Host "   选择 '使用 C++ 的桌面开发' 工作负载" -ForegroundColor Gray
            Write-Host ""
        }
    } catch {}
    
    if (-not (Test-Path "node_modules")) {
        Write-Host "4. 安装项目依赖:" -ForegroundColor Yellow
        Write-Host "   npm install" -ForegroundColor Cyan
        Write-Host ""
    }
    
    Write-Host "详细说明请查看 TROUBLESHOOTING.md 文件" -ForegroundColor Gray
}

Write-Host "=====================================" -ForegroundColor Cyan
