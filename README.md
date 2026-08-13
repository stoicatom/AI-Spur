# AI-Spur

Sometimes Claude Code is too slow — spur it into shape.

AI-Spur 是一个跨平台桌面托盘应用（macOS / Windows / Linux），用来给 Claude Code CLI 发送「催促」信号：按一下全局快捷键，甩一鞭子（全屏透明动画），应用随即把 `Ctrl+C` 中断 + 一条提示词打进当前活跃终端。

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
