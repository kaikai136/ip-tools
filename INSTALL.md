# 安装和运行指南

## 前置要求

### 1. 安装 Node.js
- 下载并安装 Node.js 18 或更高版本
- 访问: https://nodejs.org/

### 2. 安装 Rust
- 访问: https://www.rust-lang.org/tools/install
- Windows: 下载并运行 rustup-init.exe
- 运行后重启终端

### 3. 安装 Tauri CLI（可选）
```bash
npm install -g @tauri-apps/cli
```

## 安装步骤

### 1. 安装前端依赖
在项目根目录运行：
```bash
npm install
```

### 2. 验证安装
检查是否安装成功：
```bash
npm run tauri --version
```

## 运行项目

### 开发模式
```bash
npm run tauri dev
```

**重要**: 程序需要管理员权限才能发送 ICMP 包：

#### Windows
1. 以管理员身份打开 PowerShell 或 CMD
2. 切换到项目目录
3. 运行 `npm run tauri dev`

或者：
1. 找到 VS Code 或终端的快捷方式
2. 右键 → 以管理员身份运行
3. 在终端中运行命令

#### Linux/macOS
```bash
sudo npm run tauri dev
```

### 构建生产版本
```bash
npm run tauri build
```

构建完成后，可执行文件位于：
- Windows: `src-tauri/target/release/bundle/msi/`
- macOS: `src-tauri/target/release/bundle/dmg/`
- Linux: `src-tauri/target/release/bundle/deb/` 或 `appimage/`

## 常见问题

### 1. 权限错误
**错误**: "缺少网络权限"
**解决**: 以管理员身份运行程序

### 2. Rust 编译错误
**错误**: "cargo not found"
**解决**: 
1. 确保已安装 Rust
2. 重启终端
3. 运行 `rustc --version` 验证

### 3. 依赖安装失败
**解决**:
```bash
# 清理缓存
npm cache clean --force
rm -rf node_modules package-lock.json

# 重新安装
npm install
```

### 4. 端口被占用
**错误**: "Port 1420 is already in use"
**解决**: 
1. 关闭占用端口的程序
2. 或修改 `vite.config.ts` 中的端口号

## 使用说明

1. **输入网络段**: 在输入框中输入网络段，例如 `192.168.1`
2. **开始扫描**: 点击 "Ping" 按钮
3. **查看结果**: 
   - 红色方块 = 在线
   - 灰色方块 = 离线/超时
   - 白色方块 = 未测试
4. **停止扫描**: 点击 "Stop" 按钮

## 性能说明

- 扫描 254 个 IP 地址通常需要 3-5 秒
- 使用 50 个并发连接
- 每个 IP 的超时时间为 2 秒

## 技术支持

如有问题，请检查：
1. 是否以管理员权限运行
2. 防火墙是否阻止了 ICMP 包
3. 网络连接是否正常
