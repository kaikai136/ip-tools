# IP 诊断工具

一个基于 Tauri + React + Rust 的局域网扫描桌面工具，用来快速查看网段内主机在线状态、对选中 IP 执行端口扫描，并提供简单的 Ping 测试面板。

## 功能特性

- 扫描整个 `1-254` 主机范围的在线状态
- 对当前选中的单个 IP 执行 `1-65535` 端口扫描
- 网格化展示主机分布，适合快速定位在线设备
- 左侧内置 `Ping` 工具，可直接测试 IP 或域名连通性
- 底部状态栏实时显示扫描目标、进度、在线主机数和耗时
- 桌面端固定窗口尺寸，适合一屏查看主要信息

## 技术栈

- 前端：React 18 + TypeScript + Vite
- 桌面容器：Tauri 1.x
- 后端：Rust + Tokio
- 网络探测：`surge-ping`

## 适用场景

- 局域网设备巡检
- 常用主机在线探测
- 单台主机端口开放情况排查
- 内网环境下的快速 Ping / 扫描联动

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 开发运行

```bash
npm run tauri dev
```

### 3. 生产构建

```bash
npm run tauri build
```

构建完成后的 Windows 可执行文件默认位于：

```text
src-tauri/target/release/IP诊断工具.exe
```

## 使用说明

### IP 探活

1. 在顶部输入网段前三段，例如 `192.168.1`
2. 点击 `扫描 IP`
3. 在右侧网格中查看哪些主机在线
4. 点击任意主机格子可查看详情

### 端口扫描

1. 先在主机分布网格中选中一个 IP
2. 点击 `扫描端口`
3. 工具会对该 IP 执行 `1-65535` 端口探测
4. 结果会显示在右下角详情区域

### Ping 工具

1. 在左侧输入目标 IP 或域名
2. 选择 Ping 次数
3. 点击 `开始 Ping`
4. 下方会逐条输出响应结果

## 项目结构

```text
.
├─ public/                  # 网页图标等静态资源
├─ scripts/                 # 辅助脚本
├─ src/                     # React 前端
│  ├─ components/           # 页面组件
│  ├─ types/                # 类型定义
│  ├─ utils/                # 工具函数
│  ├─ App.tsx               # 主界面
│  └─ App.css               # 全局样式
├─ src-tauri/               # Tauri/Rust 后端
│  ├─ icons/                # 应用图标
│  ├─ src/
│  │  ├─ commands.rs        # Tauri 命令
│  │  ├─ network_utils.rs   # 网络参数解析
│  │  ├─ ping_engine.rs     # Ping 逻辑
│  │  ├─ scan_engine.rs     # 扫描逻辑
│  │  └─ task_manager.rs    # 扫描任务管理
│  └─ tauri.conf.json       # 桌面应用配置
├─ package.json
└─ README.md
```

## 环境要求

- Node.js 18+
- Rust stable
- Windows 下建议使用管理员权限运行，以获得更稳定的 ICMP/Ping 行为

## 发布版本

如需直接下载可执行文件，请前往仓库的 GitHub Releases 页面。

## License

MIT
