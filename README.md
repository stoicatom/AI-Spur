# AISpur

AISpur —AI 终端加速器。一个跨平台（macOS / Windows / Linux）桌面托盘应用，通过全局快捷键向终端 AI 工具（Claude Code、Codex 等）发送"催促"信号。

## 技术栈

- **前端**：React 18 + TypeScript + Vite + Framer Motion
- **后端**：Tauri v2 + Rust
- **输入合成**：enigo 0.2
- **测试**：Vitest + @testing-library/react（前端）+ cargo test（Rust）

## 开发环境要求

- Node.js ≥18.0.0
- pnpm 10.x（已锁定 10.34.5）
- Rust 1.70+
- macOS 10.15+ / Windows 10+ / Linux（X11 或 Wayland）

## 快速开始

```bash
# 克隆仓库
git clone https://github.com/stoicatom/AISpur.git
cd AISpur

# 安装依赖
pnpm install

# 开发模式（热重载）
pnpm run tauri:dev

# 类型检查
pnpm run typecheck

# 运行测试
pnpm run test        # 前端单元测试
cd src-tauri && cargo test  # Rust 测试

# CI 全量检查
pnpm run ci
```

## 打包构建

### 生产版本（Release）

```bash
# 完整打包（前端构建 + Rust release + DMG/App bundle）
pnpm run build:tauri

# 输出位置：src-tauri/target/release/bundle/
# - macOS: .app + .dmg
# - Windows: .msi + .exe
# - Linux: .deb + .AppImage
```

### 调试版本（Debug）

```bash
# 调试构建（保留符号表，快速编译）
pnpm run build:debug

# 输出位置：src-tauri/target/debug/bundle/
```

### 仅重新打包（跳过编译）

```bash
# 如果 Rust 二进制已构建，仅生成安装包
pnpm run bundle
```

## 项目结构

```
AISpur/
├── src/                    # 前端源码（React + TS）
│   ├── overlay/           # 鞭子动画叠加层
│   ├── settings/          # 设置窗口
│   ├── onboarding/        # 首次启动向导
│   └── shared/            # 共享代码（config、IPC、utils）
├── src-tauri/             # Tauri 后端（Rust）
│   ├── src/
│   │   ├── commands.rs    # IPC 命令
│   │   ├── config.rs      # 配置管理
│   │   ├── macro_sender.rs # 输入合成
│   │   ├── shortcut.rs    # 全局快捷键
│   │   ├── skins.rs       # 皮肤系统
│   │   └── usage.rs       # 使用统计
│   └── tauri.conf.json    # Tauri 配置
├── .claude/               # Claude Code AI 工程规则
│   └── rules/             # 架构、测试、UI 设计约束
├── docs/                  # 设计文档与 ADR
└── package.json           # 依赖与脚本
```

## 脚本说明

| 脚本 | 功能 |
|---|---|
| `pnpm run dev` | Vite 开发服务器（前端） |
| `pnpm run tauri:dev` | Tauri 开发模式（前后端集成，热重载） |
| `pnpm run build` | 构建前端生产包（TypeScript → dist/） |
| `pnpm run build:tauri` | **完整生产打包**（前端 + Rust release + 安装包） |
| `pnpm run build:debug` | 调试版本打包（保留符号表） |
| `pnpm run bundle` | 仅生成安装包（跳过编译） |
| `pnpm run typecheck` | TypeScript 类型检查 |
| `pnpm run test` | 前端单元测试（Vitest） |
| `pnpm run test:watch` | 测试监视模式 |
| `pnpm run ci` | CI 全量检查（typecheck + test + clippy + cargo test） |

## 架构规则

项目遵循严格的 AI 工程规范（详见 `.claude/rules/`）：

- **R-ARCH-001**：Tauri IPC 规范（单向 command，双向 emit/listen）
- **R-ARCH-008**：纯函数可测（业务逻辑与框架解耦）
- **R-TEST-003**：Rust 测试同文件（`#[cfg(test)] mod tests`）
- **R-UI-004**：组件文件行数 ≤200（含测试 ≤250）

## 许可证

MIT

## 贡献

欢迎提交 Issue 和 Pull Request！请确保：
1. 运行 `pnpm run ci` 通过
2. 遵循 `.claude/rules/` 中的架构约束
3. 更新相关测试


Sometimes your AI is too slow — spur it into shape.

AISpur 是一个跨平台桌面托盘应用（macOS / Windows / Linux），用来给终端 AI 工具（Claude Code、Codex、等）发送「催促」信号：按一下全局快捷键，甩一鞭子（全屏透明动画），应用随即把 `Ctrl+C` 中断 + 一条提示词打进当前活跃终端。

## 核心循环

1. 按全局快捷键（默认 `Cmd/Ctrl + Shift + W`）→ 全屏鞭子动画
2. 快速甩动鼠标达到速度阈值 → crack
3. 自动发送 `Ctrl+C` + 随机提示词（如 `FASTER`）+ `Enter`

## 功能

- **双轨触发**：全局快捷键（效率）+ 托盘菜单「挥鞭」（演示/娱乐）
- **渐进式动画**：前 N 次完整动画，之后自动切换角落快速模式（可在设置调整阈值）
- **Shift 彩蛋**：任何时候按住 `Shift + 快捷键` 强制完整动画
- **皮肤系统**：内置 4 套（Classic / Fire Whip / Electric / Neon），支持用户自定义
- **设置窗口**：快捷键录制（含冲突检测+替代建议）、提示词管理、音效开关、使用统计
- **首次启动引导**：3 步向导（快捷键 → 提示词 → 皮肤）
- **跨平台输入合成**：基于 enigo，三平台统一行为

## 构建与运行

前置：Rust stable（edition 2024）、Node 20+、Tauri v2 系统依赖（macOS 无需额外安装）。

```bash
# 开发（热重载前端 + Rust 后端）
npm run tauri dev

# 前端单测 + typecheck
npm run test
npm run typecheck

# Rust 测试 + 静态检查
cd src-tauri && cargo test && cargo clippy -- -D warnings

# 打包（macOS 产出 .app + .dmg）
npm run tauri build
```

macOS 首次使用需在 系统设置 → 隐私与安全性 → 辅助功能 中授予权限（enigo 发送键盘事件需要）。

## 架构

```
[Rust 主进程 (Tauri v2)]
  ├─ config.rs      配置持久化 (serde + dirs)
  ├─ tray.rs        托盘图标 + 菜单
  ├─ shortcut.rs    全局快捷键 + 冲突检测
  ├─ skins.rs       皮肤 manifest 加载/校验
  └─ macro_sender.rs 输入合成 (enigo 0.6, Trait 抽象)
         │  IPC (Commands + Events)
  ┌──────▼────────┐   ┌───────────────┐
  │ overlay 窗口    │   │ settings 窗口  │
  │ physics.ts    │   │ React + Framer│
  │ renderer.ts   │   │  Motion       │
  └───────────────┘   └───────────────┘
```

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面框架 | Tauri v2.11, Rust edition 2024 |
| 输入合成 | enigo 0.6（`independent_of_keyboard_state` 保证 Shift 彩蛋不污染 Ctrl+C） |
| 前端 | TypeScript 5.x strict, React 18, Vite 6, Zod 3 |
| 测试 | Vitest 137 单测, cargo 41 测试, WebdriverIO E2E |

## 许可

MIT
