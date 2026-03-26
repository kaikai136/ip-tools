# 快速修复指南

## 问题诊断

Visual Studio 2022 已安装，但 `link.exe` 还没有添加到 PATH 环境变量中。

## 解决方案（3 种方法）

### 方法 1：重启电脑（最简单，推荐）

安装 Visual Studio Build Tools 后，需要重启电脑才能使环境变量生效。

1. 保存所有工作
2. 重启电脑
3. 重新打开终端
4. 运行 `npm run tauri dev`

---

### 方法 2：使用 Visual Studio Developer Command Prompt

1. 按 `Win` 键，搜索 "Developer Command Prompt for VS 2022"
2. 以管理员身份运行
3. 切换到项目目录：
   ```cmd
   cd C:\Users\kaikai\Desktop\ip工具
   ```
4. 运行项目：
   ```cmd
   npm run tauri dev
   ```

---

### 方法 3：手动设置环境变量（临时）

在当前 PowerShell 会话中手动添加 MSVC 工具路径：

```powershell
# 找到 MSVC 工具路径
$vsPath = "C:\Program Files\Microsoft Visual Studio\2022"
$vcToolsPath = Get-ChildItem -Path "$vsPath" -Recurse -Filter "link.exe" | Select-Object -First 1 -ExpandProperty DirectoryName

# 添加到 PATH
$env:PATH = "$vcToolsPath;$env:PATH"

# 验证
where.exe link.exe

# 运行项目
npm run tauri dev
```

---

## 推荐步骤

**最简单的方法是重启电脑**，这样可以确保所有环境变量正确加载。

重启后：
1. 打开终端（以管理员身份）
2. 切换到项目目录
3. 运行 `npm run tauri dev`
4. 等待编译完成（首次编译需要 5-10 分钟）
5. 应用程序窗口会自动打开

---

## 验证安装

重启后，运行以下命令验证：

```powershell
# 应该显示 Visual Studio 的 link.exe 路径
where.exe link.exe

# 应该显示 Rust 版本
rustc --version

# 应该显示 Node.js 版本
node --version
```

如果 `where.exe link.exe` 返回路径，说明环境变量已生效。

---

## 为什么需要重启？

Windows 在安装程序时会修改系统环境变量，但这些更改只有在重启后才会对所有进程生效。Visual Studio Build Tools 会添加多个路径到 PATH 环境变量，包括：

- MSVC 编译器和链接器
- Windows SDK
- CMake 工具

重启后，这些工具就可以在任何终端中使用了。

---

## 如果重启后仍然有问题

1. 确认 Visual Studio Build Tools 安装时选择了"使用 C++ 的桌面开发"
2. 重新运行 Visual Studio Installer
3. 修改安装，确保以下组件已勾选：
   - MSVC v143 - VS 2022 C++ x64/x86 生成工具
   - Windows 11 SDK（或 Windows 10 SDK）
   - C++ CMake tools for Windows

---

## 项目已准备就绪

一旦环境变量生效，项目就可以运行了：

✅ 所有代码已完成
✅ 所有配置已完成
✅ 依赖已安装
✅ Visual Studio 已安装

只需要重启电脑，让环境变量生效即可！
