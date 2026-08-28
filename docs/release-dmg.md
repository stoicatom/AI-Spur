# 发布流程 — macOS DMG 打包

## 构建步骤

```bash
# 1. 确保在仓库根目录
cd /Users/lorain/Coding/Private/2026/AI-Spur

# 2. 清理旧产物
rm -rf src-tauri/target/release/bundle/

# 3. 构建 release 版本
npm run tauri build

# 4. 产物位置
# - App bundle: src-tauri/target/release/bundle/macos/AISpur.app
# - DMG:        src-tauri/target/release/bundle/dmg/AISpur_<version>_<arch>.dmg
```

## DMG 内容检查清单

打包后，挂载 DMG 并验证以下内容：

```bash
# 挂载 DMG
hdiutil attach src-tauri/target/release/bundle/dmg/AISpur_*.dmg

# 检查内容
ls -la /Volumes/AISpur/
```

**标准内容**：

1. ✅ `AISpur.app` — 主应用
2. ✅ `Applications` 快捷方式（符号链接）
3. ✅ `.DS_Store` 和 `.VolumeIcon.icns`（可选，自动生成）

**不包含**：

- ❌ 修复脚本 — 用户从 GitHub 下载或直接用终端命令
- ❌ README / 文档 — 引导用户到仓库查看

## 安装障碍的解决方案

### 背景

macOS 会给未签名应用打隔离标记，导致用户看到「已损坏」提示。我们提供**三种解决途径**，由简到繁：

### 方案对比

| 方案 | 用户体验 | 技术复杂度 | 状态 |
|---|---|---|---|
| **终端命令** | 最快（30 秒） | 零 | ✅ 当前主推 |
| **下载脚本** | 友好（2 分钟） | 低 | ✅ 备选 |
| **DMG 内置脚本** | 最理想（1 分钟） | **不可行** | ❌ Tauri 限制 |

### 为什么不能把脚本打进 DMG？

Tauri 的 `bundle.resources` 将文件打包到 `AISpur.app/Contents/Resources/`，不是 DMG 根目录。用户打开 DMG 时看不到脚本。

**已验证**：
```bash
# 旧版 DMG 结构（2024-08-28 验证）
/Volumes/AISpur/
├── AISpur.app
│   └── Contents
│       └── Resources
│           ├── materials/
│           ├── packs/
│           └── skins/
└── Applications -> /Applications
```

资源文件在 app 内部，不在 DMG 根目录。

### 当前方案

- **README.md**：直接展示终端命令（最快）
- **INSTALL.md**：
  - 方法 1：终端命令（主推）
  - 方法 2：下载脚本链接（备选）
- **脚本仓库位置**：`scripts/fix-quarantine.command`
- **脚本 GitHub 直链**：`https://github.com/stoicatom/AI-Spur/raw/main/scripts/fix-quarantine.command`

## 发布前最终检查

- [ ] DMG 能正常挂载
- [ ] `AISpur.app` 可拖进 Applications
- [ ] 从 DMG 拖入后，手动运行终端命令能成功解除隔离
- [ ] README.md 引导清晰（终端命令可见）
- [ ] INSTALL.md 说明完整（两种方法都有）
- [ ] GitHub 上 `scripts/fix-quarantine.command` 可访问
- [ ] Release Notes 提示用户解决方法

## 发布 Release Notes 模板

```markdown
## macOS 安装说明

下载 DMG 后，若提示「已损坏，无法打开」，请运行：

\`\`\`bash
sudo xattr -r -d com.apple.quarantine /Applications/AISpur.app
\`\`\`

详见 [INSTALL.md](https://github.com/stoicatom/AI-Spur/blob/main/INSTALL.md)。

这是未签名应用的正常现象，应用本身完好。我们计划在项目成熟后申请 Apple 开发者签名。
```

## 未来优化

### 短期（无需外部依赖）

- [ ] 在 INSTALL.md 添加常见终端问题排查（命令未找到、权限不足、路径错误）
- [ ] 提供视频演示（YouTube / B站）

### 长期（需要投入）

- [ ] **Apple 开发者签名**（$99/年）+ 公证（notarization）
  - 根除隔离标记问题
  - 用户直接打开，无需任何额外步骤
  - 需要：开发者账号 + CI/CD 自动化签名流程

## 相关文件

- 安装指南：`INSTALL.md`
- 修复脚本：`scripts/fix-quarantine.command`（5.0KB，150 行）
- 主 README：`README.md`（安装章节）
