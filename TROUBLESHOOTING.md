# 故障排除指南

## 当前问题：Rust 编译失败

### 错误信息
```
error: linker `link.exe` not found
note: the msvc targets depend on the msvc linker but `link.exe` was not found
note: please ensure that Visual Studio 2017 or later, or Build Tools for Visual Studio were installed with the Visual C++ option.
```

### 原因
Windows 上编译 Rust 项目需要 Microsoft Visual C++ (MSVC) 构建工具，但系统中未安装。

---

## 解决方案

### 方法 1：安装 Visual Studio Build Tools（推荐）

这是最轻量级的解决方案，只安装必需的构建工具。

#### 步骤：

1. **下载 Build Tools**
   - 访问：https://visualstudio.microsoft.com/zh-hans/downloads/
   - 向下滚动到"所有下载"部分
   - 找到"Visual Studio 2022 生成工具"
   - 点击"下载"

2. **运行安装程序**
   - 双击下载的 `vs_BuildTools.exe`
   - 等待安装程序启动

3. **选择工作负载**
   - 在"工作负载"选项卡中
   - 勾选"使用 C++ 的桌面开发"
   - 确保右侧"安装详细信息"中包含：
     - MSVC v143 - VS 2022 C++ x64/x86 生成工具
     - Windows 11 SDK（或 Windows 10 SDK）
     - C++ CMake tools for Windows

4. **开始安装**
   - 点击右下角"安装"按钮
   - 等待安装完成（可能需要 10-30 分钟，取决于网速）

5. **重启终端**
   - 关闭所有终端窗口
   - 重新打开终端或 VS Code

---

### 方法 2：安装完整的 Visual Studio Community

如果你需要完整的 IDE 功能，可以选择这个方案。

#### 步骤：

1. **下载 Visual Studio**
   - 访问：https://visualstudio.microsoft.com/zh-hans/vs/community/
   - 点击"免费下载"

2. **运行安装程序**
   - 双击下载的安装程序
   - 等待安装程序启动

3. **选择工作负载**
   - 勾选"使用 C++ 的桌面开发"
   - 可选：勾选其他你需要的工作负载

4. **开始安装**
   - 点击"安装"按钮
   - 等待安装完成

5. **重启终端**
   - 关闭所有终端窗口
   - 重新打开终端或 VS Code

---

## 验证安装

安装完成后，运行以下命令验证：

```bash
# 验证 Rust 工具链
rustc --version

# 验证 Cargo
cargo --version

# 验证 MSVC 链接器（应该能找到）
where link.exe
```

如果 `where link.exe` 返回路径（类似 `C:\Program Files\Microsoft Visual Studio\...`），说明安装成功。

---

## 重新运行项目

安装完成并验证后：

```bash
# 清理之前的构建缓存
cd src-tauri
cargo clean
cd ..

# 重新运行项目
npm run tauri dev
```

---

## 常见问题

### Q1: 安装后仍然报错
**A**: 确保已经重启终端。如果还是不行，尝试重启电脑。

### Q2: 下载速度很慢
**A**: Visual Studio 安装程序会下载大量文件。可以：
- 使用稳定的网络连接
- 或者使用离线安装包

### Q3: 磁盘空间不足
**A**: Build Tools 需要约 6-8 GB 空间，完整的 Visual Studio 需要 10-20 GB。

### Q4: 我已经安装了 Visual Studio Code
**A**: VS Code 和 Visual Studio 是不同的产品。VS Code 是代码编辑器，不包含 C++ 构建工具。你仍然需要安装 Build Tools。

---

## 替代方案：使用 GNU 工具链（不推荐）

如果你不想安装 Visual Studio，可以使用 GNU 工具链，但这不是官方推荐的方式：

```bash
# 切换到 GNU 工具链
rustup default stable-x86_64-pc-windows-gnu

# 安装 MinGW
# 需要手动下载并配置 MinGW-w64
```

**注意**：这种方式可能会遇到兼容性问题，不推荐新手使用。

---

## 项目状态

当前项目已完成：
- ✅ 前端代码（React + TypeScript）
- ✅ 后端代码（Rust + Tauri）
- ✅ 所有配置文件
- ✅ 完整的项目结构

只需要安装 C++ 构建工具即可运行！

---

## 需要帮助？

如果遇到其他问题，请检查：
1. Rust 是否正确安装：`rustc --version`
2. Node.js 是否正确安装：`node --version`
3. npm 依赖是否安装：检查 `node_modules` 文件夹是否存在

---

## 安装完成后的下一步

1. 重启终端
2. 运行 `npm run tauri dev`
3. 等待编译完成（首次编译可能需要 5-10 分钟）
4. 应用程序窗口会自动打开
5. 输入网络段（如 `192.168.1`）并点击 Ping 按钮测试

**重要提示**：程序需要管理员权限才能发送 ICMP 包。如果遇到权限错误，请以管理员身份运行终端。
