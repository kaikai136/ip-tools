# IP 诊断工具

基于 Tauri + React + TypeScript 的桌面应用程序，用于批量检测局域网内 IP 地址的在线状态。

## 功能特性

- 🔍 批量 Ping 扫描 254 个 IP 地址
- ⚡ 高性能并发扫描（50 个并发）
- 🎨 可视化网格界面展示 IP 状态
- 🔴 红色表示在线，灰色表示离线/超时
- ⏱️ 实时显示扫描进度和统计信息
- 💾 自动保存网络段配置
- 🛑 支持随时停止扫描

## 技术栈

- **前端**: React 18 + TypeScript + Vite
- **后端**: Rust + Tauri
- **网络**: surge-ping (ICMP)
- **并发**: Tokio 异步运行时

## 安装依赖

### 前端依赖
```bash
npm install
```

### 后端依赖
Rust 依赖会在构建时自动下载。

## 开发运行

```bash
npm run tauri dev
```

**注意**: 由于需要发送 ICMP 包，程序需要管理员权限：
- **Windows**: 右键以管理员身份运行
- **Linux**: 使用 `sudo` 运行
- **macOS**: 使用 `sudo` 运行

## 构建生产版本

```bash
npm run tauri build
```

构建完成后，可执行文件位于 `src-tauri/target/release/bundle/` 目录。

## 使用说明

1. 输入网络段（例如: `192.168.1`）
2. 点击 "Ping" 按钮开始扫描
3. 实时查看 IP 状态变化
4. 点击 "Stop" 按钮可随时停止扫描

## 项目结构

```
.
├── src/                    # 前端源代码
│   ├── components/         # React 组件
│   ├── types/             # TypeScript 类型定义
│   ├── utils/             # 工具函数
│   ├── App.tsx            # 主应用组件
│   └── main.tsx           # 入口文件
├── src-tauri/             # Tauri 后端
│   └── src/
│       ├── commands.rs    # Tauri 命令
│       ├── error.rs       # 错误类型
│       ├── network_utils.rs  # 网络工具
│       ├── ping_engine.rs    # Ping 引擎
│       ├── task_manager.rs   # 任务管理
│       └── main.rs        # 主函数
└── README.md
```

## 许可证

MIT
