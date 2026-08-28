# AISpur 安装指南

## macOS 用户 —「已损坏」提示的解决方案

### 为什么会出现这个提示？

AISpur 是开源软件，没有购买 Apple 的付费开发者签名（每年 $99）。macOS 会给所有从网络下载的未签名应用打上「隔离」标记，并显示：

> **"AISpur.app 已损坏，无法打开"**

这个提示是**误导性的** — 应用本身完好，只是缺少 Apple 的付费签名背书。

### 一键解决（推荐）

**方法 1：终端命令（最快，30 秒）**

1. 打开「终端」（在启动台或应用程序/实用工具中）
2. 拷贝下面的命令并粘贴到终端：

```bash
sudo xattr -r -d com.apple.quarantine /Applications/AISpur.app
```

3. 按回车，输入你的 Mac 登录密码（输入时不会显示），再次回车
4. 完成 — 直接打开 AISpur

**方法 2：自动脚本（图形化，2 分钟）**

1. 下载 [fix-quarantine.command](https://github.com/stoicatom/AI-Spur/raw/main/scripts/fix-quarantine.command)（右键 → 下载链接文件）
2. 拖动 AISpur.app 到「应用程序」文件夹
3. 双击 `fix-quarantine.command`
4. 按提示输入密码 → 完成

> 脚本是开源的纯文本，你可以用文本编辑器打开查看 — 它只做一件事：移除隔离标记。

---

## 首次运行 — 授予辅助功能权限

AISpur 的核心功能是「甩鞭后自动向终端发送按键」，这需要 macOS 的**辅助功能权限**。

首次打开 AISpur 时，系统会弹窗请求权限。如果你错过了提示，或者应用无法正常工作：

1. 打开「系统设置」
2. 前往「隐私与安全性 → 辅助功能」
3. 确保 **AISpur** 的开关是打开的

**导航路径**：系统设置 → 隐私与安全性 → 辅助功能 → 勾选 AISpur

> **注意**：如果列表里没有 AISpur，尝试重启应用，或点击「+」号手动添加 `/Applications/AISpur.app`。

---

## 验证安装

安装成功后，你应该看到：

- ✅ 菜单栏右上角出现 AISpur 的托盘图标
- ✅ 点击图标显示菜单（设置、退出等）
- ✅ 按下默认快捷键（`Cmd+Shift+W`）触发鞭子动画

如果动画触发后按键没有发送到终端，检查「辅助功能」权限。

---

## 常见问题

### Q: 为什么需要管理员密码？

移除隔离标记（`com.apple.quarantine`）是受系统保护的操作，需要 `sudo` 权限。这是 macOS 的设计，不是 AISpur 的要求。

### Q: 这个脚本安全吗？

完全安全。脚本是纯文本（`.command` 就是 bash 脚本），你可以用任何文本编辑器打开查看 — 它**只做一件事**：移除隔离标记。不联网、不上传、不修改应用代码。

如果不信任，可以用手动方法（见上方）。

### Q: 我已经运行了脚本，但还是提示「已损坏」

可能的原因：

1. **应用不在「应用程序」文件夹** — 脚本会自动查找，但如果你放在了其他位置，可以手动运行：
   ```bash
   sudo xattr -r -d com.apple.quarantine /path/to/AISpur.app
   ```

2. **系统版本过低** — AISpur 需要 macOS 10.15 (Catalina) 或更高。

3. **应用被改动** — 如果你修改了 app bundle 的内容，macOS 可能会阻止运行。重新下载原始安装包。

### Q: 撤销脚本的操作

如果想恢复隔离标记（虽然没必要），运行：

```bash
sudo xattr -w com.apple.quarantine "0081;00000000;;" /Applications/AISpur.app
```

### Q: 有没有根本的解决方案？

有 — 开发者购买 Apple 开发者账号（$99/年）并对应用进行「公证」（notarization）。公证后的应用不会被隔离。

我们计划在项目成熟后申请签名。在那之前，需要用户手动解除隔离标记。

---

## Windows 用户

> 🚧 Windows 支持正在开发中

Windows 版本将支持：

- ✅ 全局快捷键触发鞭子动画
- ✅ 自动向命令提示符/PowerShell/Windows Terminal 发送按键
- ✅ 托盘图标和设置面板

SmartScreen 可能会阻止未签名的应用 — 解决方法与 macOS 类似，需要在警告界面点击「仍要运行」。

---

## Linux 用户

> 🚧 Linux 支持正在开发中

AppImage 或 deb/rpm 包将支持主流桌面环境（GNOME、KDE、XFCE）。无需特殊配置。

---

## 开发者 — 从源码构建

如果你想从源码构建 AISpur：

```bash
# 1. 克隆仓库
git clone https://github.com/stoicatom/AI-Spur.git
cd AI-Spur

# 2. 安装依赖
npm install

# 3. 构建（需要 Rust 工具链）
npm run tauri build

# 4. 安装包在 src-tauri/target/release/bundle/
```

详见 `README.md` 的开发者部分。

---

## 获取帮助

- **文档**：[README.md](README.md)
- **问题反馈**：[GitHub Issues](https://github.com/stoicatom/AI-Spur/issues)
- **快捷键列表**：打开 AISpur → 托盘菜单 → 设置

---

**感谢使用 AISpur！催起来！** 🚀
