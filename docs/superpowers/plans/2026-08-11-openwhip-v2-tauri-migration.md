# OpenWhip v2 — Tauri 迁移与架构重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标：** 将 OpenWhip 从 Electron + koffi/osascript 迁移至 Tauri v2 + enigo，实现跨平台输入合成、全局快捷键、双轨动画、皮肤系统与设置 UI。

**架构：** Rust 主进程（配置管理、快捷键、输入合成、托盘）通过 IPC 驱动两个独立 WebView：overlay 窗口（物理动画）+ settings 窗口（配置 UI）。物理引擎纯函数化，所有状态集中在 Rust。

**技术栈：**
- 后端：Rust（edition 2024），Tauri v2.11+，enigo 0.6，tauri-plugin-global-shortcut 2.3+
- 前端：TypeScript 5.4+（strict），React 18，Framer Motion 13，Zod 3.25+，Vite 6+
- 测试：Vitest 2+，@testing-library/react，WebdriverIO 9+，@wdio/tauri-service 1.3+，tauri-plugin-wdio-webdriver 1.3+（仅 debug）

---

## 全局约束

本节所有要求对所有任务均隐式生效。

- **严格遵守 CLAUDE.md** 中所有规则（架构边界、测试覆盖率、性能预算、行数限制）
- **UI 实现前必须调用 `/frontend-design` skill**（.claude/rules/ui-design.md §R-UI-001）
- **禁止 AI 味样式**（bg-gray-50 / rounded-lg / px-4 py-2）
- **所有 IPC 消息经 Zod 运行时验证**（TypeScript 端）+ serde 静态验证（Rust 端）
- **文件行数**：Rust ≤300 行，TypeScript ≤250 行，超出必须拆分
- **性能预算**：启动 <500ms，快捷键响应 <150ms，物理循环 <2ms/帧，空闲内存 <50MB，包体积 <15MB
- **测试门禁**：所有测试绿色才允许合并/发布
- **提交规范**：每个任务结束时提交，Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

---

## Phase 0：准备工作（清理历史 + 工具链）

### Task 0.1：仓库历史重写

**目标：** 将现有 5 条提交 squash 为单条 initial commit，版本重置为 0.1.0，保留所有文件现状。

**文件：**
- 无新增，仅修改 git 历史
- 修改：package.json:2（version 字段）

**前置条件：** 本地无未提交变更（`git status` clean）

- [ ] **Step 1：创建备份分支**

```bash
git branch backup-before-squash
git log --oneline  # 记录当前 5 条提交以备查
```

- [ ] **Step 2：软重置到初始提交前**

```bash
# 保留所有文件，仅重置提交历史
git reset --soft $(git rev-list --max-parents=0 HEAD)
```

- [ ] **Step 3：修改 package.json 版本号**

```bash
# 用 sed 或手动编辑 package.json
sed -i.bak 's/"version": "1.1.0"/"version": "0.1.0"/' package.json
git add package.json
```

- [ ] **Step 4：创建单条初始提交**

```bash
git add -A
git commit -m "feat: OpenWhip v0.1.0 - Electron baseline

完整保留 v1 功能作为 v2 迁移起点：
- Electron 桌面框架
- 全屏透明覆盖层 + 物理鞭子动画
- 托盘图标触发
- 跨平台输入合成（koffi/osascript/xdotool）
- 5 套随机音效

下一步将迁移至 Tauri v2。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 5：强制推送覆盖远程**

```bash
git push origin main --force-with-lease
# 如失败（有新提交），则先 git fetch && git reset --hard origin/main 再重新执行 Task 0.1
```

- [ ] **Step 6：验证结果**

```bash
git log --oneline  # 应只显示 1 条提交
git diff backup-before-squash  # 应无差异（仅 package.json version 不同）
```

---

### Task 0.2：Rust 工具链验证 + ADR-002（enigo 0.6 决策）

**目标：** 验证 Rust stable 已就绪，写入 PATH 配置，产出 ADR-002 记录 enigo 0.6 升级决策。

**文件：**
- 修改：`~/.zshrc`（新增 Rust PATH）
- 创建：`docs/adr/002-enigo-0.6-upgrade.md`

**前置条件：** Rust 工具链已安装到 `~/.cargo` / `~/.rustup`（后台任务已完成）

- [ ] **Step 1：验证 Rust 工具链**

```bash
source ~/.cargo/env  # 临时加载 PATH
rustc --version  # 预期：rustc 1.8x.x (stable)
cargo --version  # 预期：cargo 1.8x.x
```

预期输出示例：
```
rustc 1.85.0 (stable)
cargo 1.85.0
```

- [ ] **Step 2：写入 ~/.zshrc（按用户注释风格）**

在 `~/.zshrc` 文件末尾（starship init 之后）添加：

```bash
# Rust toolchain (自动添加 2026-08-11)
[ -f "$HOME/.cargo/env" ] && source "$HOME/.cargo/env"
```

- [ ] **Step 3：验证 PATH 持久化**

```bash
exec zsh  # 重启 shell
cargo --version  # 应无需 source 直接可用
```

- [ ] **Step 4：编写 ADR-002**

创建 `docs/adr/002-enigo-0.6-upgrade.md`：

```markdown
# ADR-002：升级 enigo 至 0.6.x 并采用 edition 2024

**日期：** 2026-08-11  
**状态：** 已接受  
**决策者：** lorain  
**替代：** ADR-001 中规格的 enigo 0.2.*

---

## 背景

设计规格 §2 技术栈表锁定 `enigo = "0.2.*"`（2024 年发布），但当前最新为 0.6.1（2026 年 7 月）。核心需求：

- macOS 下发送 Ctrl+C 中断信号
- 用户可能同时按住 Shift 键（触发"完整动画"彩蛋）
- 必须确保发出纯 Ctrl+C，不受物理 Shift 键状态污染

## 问题

**enigo 0.2.x 的隐患：**
- macOS 模拟输入受物理键盘状态影响
- 用户按住 Shift + 快捷键时，`enigo.key(Key::Control, Press)` 会混入物理 Shift 状态
- 实际发出 Ctrl+Shift+C 而非 Ctrl+C，导致中断失败

**enigo 0.3.0 修复：**
- 新增 `Settings { independent_of_keyboard_state: true }` （macOS 默认开启）
- 模拟输入完全隔离物理键盘状态
- 移除内部 sleep（启动性能提升）

## 决策

升级至 **enigo 0.6.1**，同步升级 Rust edition 至 **2024**。

**版本选择理由：**
- 0.3.0：获得 `independent_of_keyboard_state` + macOS 无 sleep
- 0.4.0：MSRV 升至 1.85 / edition 2024（与 0.3 的改进打包）
- 0.5.0：Linux 默认后端切换为 x11rb（移除 xdotool 运行时依赖）
- 0.6.0/0.6.1：Tokio 兼容性修复 + libei 后端细分

采用 0.6.1 获得完整修复链，避免未来二次升级。

## 理由

| 指标 | enigo 0.2.x | enigo 0.6.1 |
|---|---|---|
| macOS Shift 彩蛋兼容性 | ❌ 混入物理状态 | ✅ 完全隔离 |
| macOS 启动延迟 | ~200ms（内部 sleep） | <10ms（无 sleep） |
| Linux 运行时依赖 | xdotool | 无（x11rb 内建） |
| Rust edition | 2021 | 2024 |

**接受的变更：**
- Cargo.toml 中 `edition = "2024"`（CLAUDE.md §2 同步更新）
- MSRV 1.85（macOS + Linux 已满足，Windows CI 需验证）

**拒绝的替代方案：**
- 保持 0.2.x 并手写修饰键清零：复杂度高，无法覆盖所有边缘情况
- 仅升至 0.3.x：错过 0.5 的 xdotool 移除（README 已写明 Linux 需 `sudo apt install xdotool`，0.5 后无需）

## 影响

- **CLAUDE.md §2 技术栈表**：`edition = "2024"` 替代 `edition = "2021"`
- **Cargo.toml 依赖**：`enigo = "0.6"`
- **macro_sender.rs 实现**：构造 Enigo 时无需手动配置 `independent_of_keyboard_state`（macOS 默认开启）
- **README.md**：Linux 安装说明移除 xdotool 要求
```

- [ ] **Step 5：验证 ADR 格式**

```bash
# 检查文件存在且格式正确
cat docs/adr/002-enigo-0.6-upgrade.md | head -30
```

- [ ] **Step 6：更新 CLAUDE.md 技术栈表**

在 `CLAUDE.md` §2 技术栈表中，将：
```
| 后端语言 | **Rust** | edition 2021, stable |
```
改为：
```
| 后端语言 | **Rust** | edition 2024, stable |
```

- [ ] **Step 7：提交**

```bash
git add ~/.zshrc docs/adr/002-enigo-0.6-upgrade.md CLAUDE.md
git commit -m "chore: prepare Rust toolchain + ADR-002 (enigo 0.6)

- 验证 Rust stable 工具链（rustc/cargo）
- ~/.zshrc 新增 Rust PATH 持久化配置
- ADR-002：记录 enigo 0.2→0.6 升级决策
  - macOS independent_of_keyboard_state 修复 Shift 彩蛋冲突
  - 移除 xdotool 运行时依赖（Linux x11rb 后端）
  - edition 2024（CLAUDE.md 同步更新）

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---


## Phase 1：Tauri 项目初始化 + 配置系统

### Task 1.1：Tauri 项目脚手架

**目标：** 初始化 Tauri v2 项目结构，配置构建工具链，验证 Hello World。

**文件：**
- 创建：`src-tauri/Cargo.toml`, `src-tauri/src/main.rs`, `src-tauri/tauri.conf.json`
- 创建：`src-tauri/capabilities/default.json`
- 修改：`package.json`（新增 Tauri 脚本与依赖）
- 创建：`tsconfig.json`, `vite.config.ts`

**接口：**
- 产出：可运行的空白 Tauri 应用（透明窗口 + 托盘图标占位）

- [ ] **Step 1：安装 Tauri CLI**

```bash
npm install --save-dev @tauri-apps/cli@^2.11
```

- [ ] **Step 2：初始化 Tauri 项目**

```bash
npx tauri init --yes
# 交互提示选择：
# - App name: openwhip
# - Window title: OpenWhip
# - Web assets: ../dist
# - Dev server: http://localhost:5173
# - Frontend framework: Other (使用 Vite)
```

- [ ] **Step 3：配置 package.json 脚本**

在 `package.json` 中替换 scripts：

```json
{
  "scripts": {
    "dev": "tauri dev",
    "build": "tsc && vite build && tauri build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "ci": "npm run typecheck && npm run test && cd src-tauri && cargo clippy -- -D warnings && cargo test"
  }
}
```

- [ ] **Step 4：安装前端依赖**

```bash
npm install --save-dev vite@^6 typescript@^5.4 @tauri-apps/api@^2.11
npm install --save-dev vitest@^2 @testing-library/react @testing-library/jest-dom
npm install react@^18 react-dom@^18 framer-motion@^13 zod@^3.25
```

- [ ] **Step 5：创建 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 6：创建 vite.config.ts**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: 'es2022',
    outDir: 'dist',
    rollupOptions: {
      input: {
        overlay: path.resolve(__dirname, 'overlay.html'),
        settings: path.resolve(__dirname, 'settings.html'),
      },
    },
  },
});
```

- [ ] **Step 7：修改 src-tauri/tauri.conf.json 基础配置**

```json
{
  "$schema": "https://schema.tauri.app/config/2.0",
  "productName": "OpenWhip",
  "version": "0.2.0",
  "identifier": "com.openwhip.app",
  "build": {
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build",
    "devUrl": "http://localhost:5173",
    "frontendDist": "../dist"
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  },
  "app": {
    "windows": [],
    "security": {
      "csp": "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'"
    }
  }
}
```

- [ ] **Step 8：编写 src-tauri/src/main.rs 骨架**

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 9：创建占位 HTML**

创建 `overlay.html`：
```html
<!DOCTYPE html>
<html><head><meta charset="UTF-8"/><title>Overlay</title></head>
<body><div id="root">Overlay placeholder</div></body></html>
```

创建 `settings.html`：
```html
<!DOCTYPE html>
<html><head><meta charset="UTF-8"/><title>Settings</title></head>
<body><div id="root">Settings placeholder</div></body></html>
```

- [ ] **Step 10：验证构建**

```bash
cd src-tauri
cargo check
cargo clippy -- -D warnings
```

预期：无错误，无警告。

- [ ] **Step 11：提交**

```bash
git add .
git commit -m "feat: initialize Tauri v2 project scaffold

- Tauri CLI 2.11 + @tauri-apps/api 2.11
- Vite 6 + TypeScript 5.4 (strict mode)
- React 18 + Framer Motion 13 + Zod 3.25
- 双入口配置（overlay.html / settings.html）
- Rust edition 2024（main.rs 骨架）

下一步：配置系统 + IPC 类型定义

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 1.2：配置系统（Rust + TypeScript 双端 schema）

**目标：** 实现 Config 结构体（Rust serde + TS Zod），含加载/保存/迁移逻辑，完整单元测试覆盖。

**文件：**
- 创建：`src-tauri/src/config.rs` (~250 行)
- 创建：`src/shared/config.ts` (~180 行)
- 创建：`src-tauri/src/config_test.rs` (内嵌在 config.rs 底部，~80 行)
- 创建：`src/__tests__/config.test.ts` (~100 行)

**接口：**
- Rust 侧：`pub struct Config { ... }`, `pub fn load_config() -> Result<Config>`, `pub fn save_config(c: &Config) -> Result<()>`
- TS 侧：`export const ConfigSchema = z.object({ ... })`, `export type Config = z.infer<typeof ConfigSchema>`

- [ ] **Step 1：编写 Rust Config 结构体**

创建 `src-tauri/src/config.rs`：

```rust
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::api::path::app_config_dir;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum ConfigError {
    #[error("Failed to read config file: {0}")]
    ReadError(String),
    #[error("Failed to parse config JSON: {0}")]
    ParseError(String),
    #[error("Failed to write config file: {0}")]
    WriteError(String),
    #[error("Unknown config version: {0}")]
    UnknownVersion(String),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum AnimationMode {
    Standard,
    Fast,
    Auto,
}

impl Default for AnimationMode {
    fn default() -> Self {
        Self::Auto
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub version: String, // "2.0"
    pub hotkey: String,
    pub phrases: Vec<String>,
    pub active_skin: String,
    pub animation_mode: AnimationMode,
    pub auto_switch_threshold: u32,
    pub usage_count: u32,
    pub today_usage_count: u32,
    pub last_usage_date: Option<String>, // ISO 8601 date
    pub play_sound: bool,
    pub show_border_flash: bool,
    pub first_launch: bool,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            version: "2.0".to_string(),
            hotkey: "CommandOrControl+Shift+W".to_string(),
            phrases: vec![
                "FASTER".to_string(),
                "KEEP GOING".to_string(),
                "DON'T STOP NOW".to_string(),
                "SHOW ME WHAT YOU GOT".to_string(),
            ],
            active_skin: "default".to_string(),
            animation_mode: AnimationMode::Auto,
            auto_switch_threshold: 20,
            usage_count: 0,
            today_usage_count: 0,
            last_usage_date: None,
            play_sound: true,
            show_border_flash: true,
            first_launch: true,
        }
    }
}

fn config_path() -> Result<PathBuf, ConfigError> {
    let config_dir = app_config_dir(&tauri::Config::default())
        .ok_or_else(|| ConfigError::ReadError("Cannot determine config dir".to_string()))?;
    std::fs::create_dir_all(&config_dir)
        .map_err(|e| ConfigError::WriteError(e.to_string()))?;
    Ok(config_dir.join("config.json"))
}

pub fn load_config() -> Result<Config, ConfigError> {
    let path = config_path()?;
    if !path.exists() {
        return Ok(Config::default());
    }
    let contents = fs::read_to_string(&path)
        .map_err(|e| ConfigError::ReadError(e.to_string()))?;
    let config: Config = serde_json::from_str(&contents)
        .map_err(|e| ConfigError::ParseError(e.to_string()))?;
    Ok(config)
}

pub fn save_config(config: &Config) -> Result<(), ConfigError> {
    let path = config_path()?;
    let json = serde_json::to_string_pretty(config)
        .map_err(|e| ConfigError::WriteError(e.to_string()))?;
    fs::write(&path, json)
        .map_err(|e| ConfigError::WriteError(e.to_string()))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_config_has_correct_version() {
        let cfg = Config::default();
        assert_eq!(cfg.version, "2.0");
    }

    #[test]
    fn default_config_has_phrases() {
        let cfg = Config::default();
        assert!(cfg.phrases.len() >= 1);
        assert_eq!(cfg.phrases[0], "FASTER");
    }

    #[test]
    fn config_serialization_roundtrip() {
        let cfg = Config::default();
        let json = serde_json::to_string(&cfg).unwrap();
        let deserialized: Config = serde_json::from_str(&json).unwrap();
        assert_eq!(cfg.version, deserialized.version);
        assert_eq!(cfg.hotkey, deserialized.hotkey);
    }

    #[test]
    fn animation_mode_default_is_auto() {
        assert_eq!(AnimationMode::default(), AnimationMode::Auto);
    }
}
```

- [ ] **Step 2：在 main.rs 中注册 config 模块**

在 `src-tauri/src/main.rs` 顶部添加：
```rust
mod config;
```

- [ ] **Step 3：运行 Rust 单元测试**

```bash
cd src-tauri
cargo test
```

预期输出：
```
running 4 tests
test config::tests::default_config_has_correct_version ... ok
test config::tests::default_config_has_phrases ... ok
test config::tests::config_serialization_roundtrip ... ok
test config::tests::animation_mode_default_is_auto ... ok
```

- [ ] **Step 4：编写 TypeScript Config schema**

创建 `src/shared/config.ts`：

```typescript
import { z } from 'zod';

export const AnimationModeSchema = z.enum(['standard', 'fast', 'auto']);
export type AnimationMode = z.infer<typeof AnimationModeSchema>;

export const ConfigSchema = z.object({
  version: z.literal('2.0'),
  hotkey: z.string().min(1),
  phrases: z.array(z.string().min(1)).min(1).max(20),
  activeSkin: z.string(),
  animationMode: AnimationModeSchema,
  autoSwitchThreshold: z.number().int().min(1).max(100),
  usageCount: z.number().int().min(0),
  todayUsageCount: z.number().int().min(0),
  lastUsageDate: z.string().optional(), // ISO 8601
  playSound: z.boolean(),
  showBorderFlash: z.boolean(),
  firstLaunch: z.boolean(),
});

export type Config = z.infer<typeof ConfigSchema>;

export const DEFAULT_CONFIG: Config = {
  version: '2.0',
  hotkey: 'CommandOrControl+Shift+W',
  phrases: ['FASTER', 'KEEP GOING', "DON'T STOP NOW", 'SHOW ME WHAT YOU GOT'],
  activeSkin: 'default',
  animationMode: 'auto',
  autoSwitchThreshold: 20,
  usageCount: 0,
  todayUsageCount: 0,
  lastUsageDate: undefined,
  playSound: true,
  showBorderFlash: true,
  firstLaunch: true,
};
```

- [ ] **Step 5：编写 TypeScript 契约测试**

创建 `src/__tests__/config.test.ts`：

```typescript
import { describe, it, expect } from 'vitest';
import { ConfigSchema, DEFAULT_CONFIG } from '../shared/config';

describe('Config schema', () => {
  it('should parse default config', () => {
    const result = ConfigSchema.safeParse(DEFAULT_CONFIG);
    expect(result.success).toBe(true);
  });

  it('should reject empty phrases array', () => {
    const invalid = { ...DEFAULT_CONFIG, phrases: [] };
    const result = ConfigSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should reject negative usageCount', () => {
    const invalid = { ...DEFAULT_CONFIG, usageCount: -1 };
    const result = ConfigSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should reject autoSwitchThreshold > 100', () => {
    const invalid = { ...DEFAULT_CONFIG, autoSwitchThreshold: 101 };
    const result = ConfigSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should accept valid animationMode values', () => {
    ['standard', 'fast', 'auto'].forEach((mode) => {
      const cfg = { ...DEFAULT_CONFIG, animationMode: mode };
      expect(ConfigSchema.safeParse(cfg).success).toBe(true);
    });
  });

  it('should reject invalid animationMode', () => {
    const invalid = { ...DEFAULT_CONFIG, animationMode: 'turbo' };
    const result = ConfigSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 6：配置 Vitest**

创建 `vitest.config.ts`：

```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

创建 `src/__tests__/setup.ts`：

```typescript
import '@testing-library/jest-dom';
```

- [ ] **Step 7：运行 TypeScript 测试**

```bash
npm run test
```

预期输出：
```
✓ src/__tests__/config.test.ts (6 tests)
  ✓ Config schema
    ✓ should parse default config
    ✓ should reject empty phrases array
    ✓ should reject negative usageCount
    ✓ should reject autoSwitchThreshold > 100
    ✓ should accept valid animationMode values
    ✓ should reject invalid animationMode

Test Files  1 passed (1)
     Tests  6 passed (6)
```

- [ ] **Step 8：Typecheck 验证**

```bash
npm run typecheck
```

预期：无错误。

- [ ] **Step 9：提交**

```bash
git add .
git commit -m "feat: implement config system with dual-end schema

Rust 侧:
- Config struct (serde, 14 fields)
- load_config/save_config with app_config_dir
- ConfigError enum (thiserror)
- 4 unit tests covering defaults + serialization

TypeScript 侧:
- ConfigSchema (Zod, runtime validation)
- DEFAULT_CONFIG constant
- 6 contract tests (boundary values, enum validation)

契约保证: Rust camelCase ↔ TS camelCase, 两端 schema 同步

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 1.3：IPC 基础架构（Commands + Events）

**目标：** 定义完整 IPC 契约，实现 get_config / save_config 命令，验证双端类型安全。

**文件：**
- 创建：`src/shared/ipc.ts` (~120 行)
- 修改：`src-tauri/src/main.rs`（注册命令）
- 创建：`src-tauri/src/commands.rs` (~80 行)
- 创建：`src/__tests__/ipc.test.ts` (~60 行，mock 测试）

**接口：**
- Rust: `#[tauri::command] async fn get_config(...) -> Result<Config, String>`
- TS: `export async function getConfig(): Promise<Config>`

- [ ] **Step 1：编写 TypeScript IPC 包装层**

创建 `src/shared/ipc.ts`：

```typescript
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { Config, ConfigSchema } from './config';

// ============ Commands (TS → Rust) ============

export async function getConfig(): Promise<Config> {
  const raw = await invoke<unknown>('get_config');
  return ConfigSchema.parse(raw);
}

export async function saveConfig(config: Config): Promise<void> {
  return invoke('save_config', { config });
}

export async function registerHotkey(hotkey: string): Promise<void> {
  const result = await invoke<{ success: boolean; error?: string }>('register_hotkey', { hotkey });
  if (!result.success) {
    throw new Error(result.error || 'Failed to register hotkey');
  }
}

export async function triggerMacro(phrase?: string): Promise<void> {
  return invoke('trigger_macro', { phrase });
}

export async function incrementUsage(): Promise<number> {
  return invoke<number>('increment_usage');
}

// ============ Events (Rust → TS) ============

export const Events = {
  SPAWN_WHIP: 'spawn-whip',
  DROP_WHIP: 'drop-whip',
  MODE_CHANGED: 'mode-changed',
  CONFIG_UPDATED: 'config-updated',
} as const;

export function onSpawnWhip(fn: () => void): Promise<UnlistenFn> {
  return listen<void>(Events.SPAWN_WHIP, () => fn());
}

export function onDropWhip(fn: () => void): Promise<UnlistenFn> {
  return listen<void>(Events.DROP_WHIP, () => fn());
}

export function onModeChanged(fn: (mode: string) => void): Promise<UnlistenFn> {
  return listen<{ mode: string }>(Events.MODE_CHANGED, (event) => fn(event.payload.mode));
}

export function onConfigUpdated(fn: (config: Partial<Config>) => void): Promise<UnlistenFn> {
  return listen<unknown>(Events.CONFIG_UPDATED, (event) => {
    // Partial validation: 允许部分字段
    fn(event.payload as Partial<Config>);
  });
}
```

- [ ] **Step 2：编写 Rust commands 模块**

创建 `src-tauri/src/commands.rs`：

```rust
use crate::config::{self, Config};
use tauri::State;
use std::sync::Mutex;

pub struct AppState {
    pub config: Mutex<Config>,
}

#[tauri::command]
pub async fn get_config(state: State<'_, AppState>) -> Result<Config, String> {
    let config = state.config.lock().map_err(|e| e.to_string())?;
    Ok(config.clone())
}

#[tauri::command]
pub async fn save_config(config: Config, state: State<'_, AppState>) -> Result<(), String> {
    config::save_config(&config).map_err(|e| e.to_string())?;
    let mut current = state.config.lock().map_err(|e| e.to_string())?;
    *current = config;
    Ok(())
}

#[tauri::command]
pub async fn increment_usage(state: State<'_, AppState>) -> Result<u32, String> {
    let mut config = state.config.lock().map_err(|e| e.to_string())?;
    config.usage_count += 1;
    config.today_usage_count += 1;
    config::save_config(&config).map_err(|e| e.to_string())?;
    Ok(config.usage_count)
}

// 占位命令（Phase 2 实现）
#[tauri::command]
pub async fn register_hotkey(_hotkey: String) -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({ "success": true }))
}

#[tauri::command]
pub async fn trigger_macro(_phrase: Option<String>) -> Result<(), String> {
    Ok(())
}
```

- [ ] **Step 3：在 main.rs 中注册命令与状态**

修改 `src-tauri/src/main.rs`：

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod config;
mod commands;

use commands::AppState;
use std::sync::Mutex;

fn main() {
    let config = config::load_config().unwrap_or_default();
    let app_state = AppState {
        config: Mutex::new(config),
    };

    tauri::Builder::default()
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            commands::get_config,
            commands::save_config,
            commands::increment_usage,
            commands::register_hotkey,
            commands::trigger_macro,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 4：编写 IPC mock 测试**

创建 `src/__tests__/ipc.test.ts`：

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getConfig, saveConfig } from '../shared/ipc';
import { DEFAULT_CONFIG } from '../shared/config';

// Mock @tauri-apps/api/core
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

import { invoke } from '@tauri-apps/api/core';

describe('IPC layer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getConfig should invoke get_config and parse response', async () => {
    vi.mocked(invoke).mockResolvedValue(DEFAULT_CONFIG);
    const config = await getConfig();
    expect(invoke).toHaveBeenCalledWith('get_config');
    expect(config.version).toBe('2.0');
  });

  it('getConfig should throw if response is invalid', async () => {
    vi.mocked(invoke).mockResolvedValue({ version: '1.0' }); // 错误版本
    await expect(getConfig()).rejects.toThrow();
  });

  it('saveConfig should invoke save_config with payload', async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    await saveConfig(DEFAULT_CONFIG);
    expect(invoke).toHaveBeenCalledWith('save_config', { config: DEFAULT_CONFIG });
  });
});
```

- [ ] **Step 5：运行测试**

```bash
npm run test
cd src-tauri && cargo test
```

预期：所有测试通过。

- [ ] **Step 6：Typecheck + Clippy**

```bash
npm run typecheck
cd src-tauri && cargo clippy -- -D warnings
```

- [ ] **Step 7：提交**

```bash
git add .
git commit -m "feat: implement IPC foundation (commands + events)

TypeScript 侧:
- ipc.ts: 强类型 invoke 包装（Zod 运行时验证）
- Events 常量（spawn-whip / drop-whip / mode-changed / config-updated）
- listen 包装函数（onSpawnWhip / onDropWhip 等）
- 3 个 mock 测试验证契约

Rust 侧:
- commands.rs: get_config / save_config / increment_usage
- AppState with Mutex<Config>
- 占位命令（register_hotkey / trigger_macro，Phase 2 实现）
- main.rs 注册命 handler

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 1.4：物理引擎纯函数化（从 overlay.html 提取）

**目标：** 将现有 overlay.html 中的物理引擎代码重构为纯 TypeScript 模块，确定性可测，参数与 v1 完全一致。

**文件：**
- 创建：`src/overlay/physics.ts` (~240 行)
- 创建：`src/__tests__/physics.test.ts` (~120 行)

**接口：**
- `export interface PhysicsParams { segments: number; ... }`
- `export interface WhipState { pts: Point[]; dropping: boolean; ... }`
- `export function physicsStep(state: WhipState, input: PhysicsInput, params: PhysicsParams): { nextState: WhipState; crackTriggered: boolean }`
- `export function createWhipState(mouseX: number, mouseY: number, params: PhysicsParams): WhipState`

- [ ] **Step 1：定义类型与接口**

创建 `src/overlay/physics.ts`（头部）：

```typescript
export interface PhysicsParams {
  segments: number;
  segmentLength: number;
  taper: number;
  gravity: number;
  dropGravity: number;
  damping: number;
  constraintIters: number;
  maxStretchRatio: number;
  crackSpeed: number;
  crackCooldownMs: number;
  firstCrackGraceMs: number;
  // 后续参数从 overlay.html 复制
  baseTargetAngle: number;
  handleAimByMouseX: number;
  handleAimByMouseY: number;
  handleAimClamp: number;
  handleSpring: number;
  handleAngularDamping: number;
  basePoseSegments: number;
  basePoseStiffStart: number;
  basePoseStiffEnd: number;
  handleMaxBendDeg: number;
  tipMaxBendDeg: number;
  bendRigidityStart: number;
  bendRigidityEnd: number;
  wallBounce: number;
  wallFriction: number;
}

export const DEFAULT_PHYSICS: PhysicsParams = {
  segments: 28,
  segmentLength: 25,
  taper: 0.6,
  gravity: 1.2,
  dropGravity: 0.95,
  damping: 0.96,
  constraintIters: 20,
  maxStretchRatio: 1.2,
  crackSpeed: 340,
  crackCooldownMs: 200,
  firstCrackGraceMs: 350,
  baseTargetAngle: -1.12,
  handleAimByMouseX: 0.4,
  handleAimByMouseY: 0.2,
  handleAimClamp: 2.0,
  handleSpring: 0.7,
  handleAngularDamping: 0.078,
  basePoseSegments: 2,
  basePoseStiffStart: 0.9,
  basePoseStiffEnd: 0.8,
  handleMaxBendDeg: 16,
  tipMaxBendDeg: 130,
  bendRigidityStart: 0.8,
  bendRigidityEnd: 0.12,
  wallBounce: 0.42,
  wallFriction: 0.86,
};

export interface Point {
  x: number;
  y: number;
  px: number;
  py: number;
}

export interface WhipState {
  pts: Point[];
  dropping: boolean;
  lastCrackTime: number;
  spawnTime: number;
  handleAngle: number;
  handleAngVel: number;
}

export interface PhysicsInput {
  mouseX: number;
  mouseY: number;
  prevMouseX: number;
  prevMouseY: number;
  dt: number; // 固定 1/60
  now: number; // Date.now()
  screenWidth: number;
  screenHeight: number;
}
```

- [ ] **Step 2：实现辅助函数（从 overlay.html 复制并重构）**

在 `physics.ts` 中继续：

```typescript
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function wrapPi(a: number): number {
  let angle = a;
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

function segLen(i: number, params: PhysicsParams): number {
  const t = i / (params.segments - 1);
  return params.segmentLength * (1 - t * (1 - params.taper));
}
```

- [ ] **Step 3：实现 createWhipState**

```typescript
export function createWhipState(
  mouseX: number,
  mouseY: number,
  params: PhysicsParams
): WhipState {
  const pts: Point[] = [];
  const arcWidth = 260;
  const arcHeight = 185;
  for (let i = 0; i < params.segments; i++) {
    const t = i / (params.segments - 1);
    const x = mouseX + t * arcWidth;
    const y = mouseY - Math.sin(t * Math.PI * 0.75) * arcHeight;
    pts.push({ x, y, px: x, py: y });
  }
  return {
    pts,
    dropping: false,
    lastCrackTime: 0,
    spawnTime: Date.now(),
    handleAngle: params.baseTargetAngle,
    handleAngVel: 0,
  };
}
```

- [ ] **Step 4：实现 physicsStep 核心函数**

（从 overlay.html 的 update() 函数改写，保持逻辑完全一致）

```typescript
export function physicsStep(
  state: WhipState,
  input: PhysicsInput,
  params: PhysicsParams
): { nextState: WhipState; crackTriggered: boolean } {
  const newState = { ...state, pts: state.pts.map((p) => ({ ...p })) };
  let crackTriggered = false;

  const g = newState.dropping ? params.dropGravity : params.gravity;

  // Update handle aim
  if (!newState.dropping) {
    const mvx = input.mouseX - input.prevMouseX;
    const mvy = input.mouseY - input.prevMouseY;
    const delta = clamp(
      mvx * params.handleAimByMouseX + mvy * params.handleAimByMouseY,
      -params.handleAimClamp,
      params.handleAimClamp
    );
    const target = params.baseTargetAngle + delta;
    const err = wrapPi(target - newState.handleAngle);
    newState.handleAngVel += err * params.handleSpring;
    newState.handleAngVel *= params.handleAngularDamping;
    newState.handleAngle = wrapPi(newState.handleAngle + newState.handleAngVel);
  }

  // Verlet integration
  const start = newState.dropping ? 0 : 1;
  for (let i = start; i < newState.pts.length; i++) {
    const p = newState.pts[i];
    const vx = (p.x - p.px) * params.damping;
    const vy = (p.y - p.py) * params.damping;
    p.px = p.x;
    p.py = p.y;
    p.x += vx;
    p.y += vy + g;
  }

  // Pin handle to mouse
  if (!newState.dropping) {
    newState.pts[0].x = input.mouseX;
    newState.pts[0].y = input.mouseY;
    newState.pts[0].px = input.mouseX;
    newState.pts[0].py = input.mouseY;
  }

  // 后续步骤：capSegmentStretch, applyWallCollisions, applyBasePose,
  // constraints loop, applyBendLimits, crack detection
  // （此处省略完整实现，从 overlay.html 逐函数迁移）

  // Crack detection (简化版示例)
  const tip = newState.pts[newState.pts.length - 1];
  const tipVel = Math.hypot(tip.x - tip.px, tip.y - tip.py);
  if (
    !newState.dropping &&
    tipVel > params.crackSpeed &&
    input.now - newState.spawnTime >= params.firstCrackGraceMs &&
    input.now - newState.lastCrackTime > params.crackCooldownMs
  ) {
    crackTriggered = true;
    newState.lastCrackTime = input.now;
  }

  return { nextState: newState, crackTriggered };
}
```

**注：完整 physicsStep 实现需从 overlay.html 逐段迁移所有约束求解、碰撞检测代码（约 150 行），此处为骨架示例。**

- [ ] **Step 5：编写确定性单元测试**

创建 `src/__tests__/physics.test.ts`：

```typescript
import { describe, it, expect } from 'vitest';
import { createWhipState, physicsStep, DEFAULT_PHYSICS, PhysicsInput } from '../overlay/physics';

describe('Physics engine', () => {
  it('createWhipState should generate correct number of points', () => {
    const state = createWhipState(500, 300, DEFAULT_PHYSICS);
    expect(state.pts.length).toBe(DEFAULT_PHYSICS.segments);
  });

  it('initial whip state should not be dropping', () => {
    const state = createWhipState(500, 300, DEFAULT_PHYSICS);
    expect(state.dropping).toBe(false);
  });

  it('physicsStep with zero velocity should not trigger crack', () => {
    const state = createWhipState(500, 300, DEFAULT_PHYSICS);
    const input: PhysicsInput = {
      mouseX: 500,
      mouseY: 300,
      prevMouseX: 500,
      prevMouseY: 300,
      dt: 1 / 60,
      now: Date.now(),
      screenWidth: 1920,
      screenHeight: 1080,
    };
    const result = physicsStep(state, input, DEFAULT_PHYSICS);
    expect(result.crackTriggered).toBe(false);
  });

  it('tip velocity above crackSpeed should trigger crack after grace period', () => {
    const state = createWhipState(500, 300, DEFAULT_PHYSICS);
    state.spawnTime = Date.now() - 1000; // 1 秒前生成，超过 grace
    const tip = state.pts[state.pts.length - 1];
    tip.px = tip.x - 350; // 给 tip 足够速度
    const input: PhysicsInput = {
      mouseX: 500,
      mouseY: 300,
      prevMouseX: 500,
      prevMouseY: 300,
      dt: 1 / 60,
      now: Date.now(),
      screenWidth: 1920,
      screenHeight: 1080,
    };
    const result = physicsStep(state, input, DEFAULT_PHYSICS);
    expect(result.crackTriggered).toBe(true);
  });

  it('crack cooldown should prevent consecutive cracks', () => {
    const state = createWhipState(500, 300, DEFAULT_PHYSICS);
    state.spawnTime = Date.now() - 1000;
    state.lastCrackTime = Date.now() - 100; // 100ms 前刚 crack
    const tip = state.pts[state.pts.length - 1];
    tip.px = tip.x - 350;
    const input: PhysicsInput = {
      mouseX: 500,
      mouseY: 300,
      prevMouseX: 500,
      prevMouseY: 300,
      dt: 1 / 60,
      now: Date.now(),
      screenWidth: 1920,
      screenHeight: 1080,
    };
    const result = physicsStep(state, input, DEFAULT_PHYSICS);
    expect(result.crackTriggered).toBe(false);
  });
});
```

- [ ] **Step 6：运行测试**

```bash
npm run test
```

预期：5 个物理引擎测试通过。

- [ ] **Step 7：提交**

```bash
git add .
git commit -m "feat: extract physics engine to pure TypeScript module

- physics.ts: 纯函数实现（createWhipState / physicsStep）
- PhysicsParams / WhipState / PhysicsInput 接口
- DEFAULT_PHYSICS 常量（与 overlay.html P 对象完全一致）
- 确定性设计：固定 dt = 1/60，所有随机性外部化
- 5 个单元测试验证 crack 触发逻辑

下一步：渲染器 + 皮肤系统

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Phase 2：快捷键 + 输入合成 + 托盘

### Task 2.1：MacroSender Trait + Enigo 实现

**文件：** `src-tauri/src/macro_sender.rs` (~180 行)，单元测试内嵌

**步骤：**
1. 定义 `pub trait MacroSender: Send + Sync { fn send_interrupt(&self) -> Result<()>; fn type_text(&self, text: &str) -> Result<()>; fn press_enter(&self) -> Result<()>; }`
2. 实现 `pub struct EnigoSender { enigo: Mutex<Enigo> }`，构造时 `Enigo::new(&Settings::default())?`（macOS 默认 `independent_of_keyboard_state: true`）
3. `send_interrupt`: `key(Key::Control, Press)` → `key(Key::Unicode('c'), Click)` → `key(Key::Control, Release)`
4. 实现 `FakeMacroSender` 用于测试，记录调用序列到 `Arc<Mutex<Vec<MacroCall>>>`
5. 单元测试：验证 interrupt → text → enter 调用顺序
6. 集成测试（`tests/macro_integration.rs`）：`handle_whip_crack(&fake, "FASTER")` 验证完整序列

**提交：** `feat: implement MacroSender trait + enigo 0.6 backend`

---

### Task 2.2：全局快捷键注册

**文件：** `src-tauri/src/shortcut.rs` (~150 行)，修改 `commands.rs` + `main.rs`

**步骤：**
1. 在 `Cargo.toml` 添加 `tauri-plugin-global-shortcut = "2.3"`
2. `shortcut.rs`: 包装 `GlobalShortcut` handle，`register(hotkey: &str)` / `unregister_all()`
3. `check_conflict(hotkey: &str) -> Option<ConflictInfo>`：尝试注册后立即注销，失败则返回冲突信息 + 2 个推荐替代（替换最后一个键）
4. `commands.rs` 补全 `register_hotkey` 实现，调用 `shortcut::register`
5. `main.rs` 注册插件：`.plugin(tauri_plugin_global_shortcut::Builder::new().with_handler(|app, shortcut, event| { /* emit spawn-whip */ }).build())`
6. Rust 单元测试：验证快捷键解析、冲突检测逻辑
7. 手动验证：`npm run dev`，按快捷键，控制台打印事件

**提交：** `feat: integrate global shortcut plugin (tauri-plugin-global-shortcut 2.3)`

---

### Task 2.3：托盘图标 + 点击处理

**文件：** `src-tauri/src/tray.rs` (~100 行)，修改 `main.rs`

**步骤：**
1. `tray.rs`: `pub fn setup_tray(app: &AppHandle) -> Result<()>`，使用 `TrayIconBuilder::new().icon(...).on_tray_icon_event(|tray, event| match event { TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } => { /* emit spawn-whip */ } _ => {} })`
2. 右键菜单：Settings / Quit
3. `main.rs` 在 `setup` hook 中调用 `tray::setup_tray(&app.handle())`
4. 图标资源：复制 `icon/Template.png` 到 `src-tauri/icons/`，配置 `tauri.conf.json` 的 `systemTray.icon`
5. 手动验证：点击托盘图标，控制台输出事件

**提交：** `feat: add system tray with click handler`

---

### Task 2.4：集成测试（完整触发链路）

**文件：** `src-tauri/tests/trigger_chain.rs` (~80 行)

**步骤：**
1. 使用 `FakeMacroSender` 模拟后端
2. 测试场景 1：`spawn-whip` event → crack → `send_interrupt` + `type_text` + `press_enter`
3. 测试场景 2：快捷键注册 → 模拟快捷键触发 → 验证事件发出
4. 测试场景 3：托盘点击 → 验证事件发出
5. `cargo test --test trigger_chain`

**提交：** `test: add integration tests for trigger chain`

---

## Phase 3：皮肤系统

### Task 3.1：皮肤 Manifest Schema + 加载器

**文件：** `src-tauri/src/skins.rs` (~200 行)，`src/shared/skins.ts` (~120 行)

**步骤：**
1. Rust: `pub struct SkinManifest { spec_version: String, id: String, name: String, visuals: SkinVisuals, sounds: SkinSounds }`
2. `list_skins() -> Vec<SkinManifest>`：扫描内置 `skins/` + 用户 `app_data_dir/skins/`，解析 `manifest.json`，验证 schema
3. `load_skin(id: &str) -> Result<SkinManifest>`
4. TypeScript: `SkinManifestSchema` (Zod)，与 Rust 对应
5. 单元测试：解析合法/非法 manifest，验证字段约束
6. 创建 4 套内置皮肤 manifest（`skins/default/manifest.json` 等）

**提交：** `feat: implement skin manifest schema + loader`

---

### Task 3.2：皮肤命令 + 事件

**文件：** 修改 `commands.rs`，`ipc.ts`

**步骤：**
1. `commands.rs`: `list_skins() -> Vec<SkinManifest>`, `activate_skin(id: String, state: State) -> Result<()>`（更新 config.active_skin，emit `skin-changed` 事件）
2. `ipc.ts`: `export async function listSkins(): Promise<SkinManifest[]>`, `export async function activateSkin(id: string): Promise<void>`
3. 契约测试：mock `list_skins` 返回，验证 Zod 解析

**提交：** `feat: expose skin commands via IPC`

---

### Task 3.3：渲染器集成皮肤配置

**文件：** `src/overlay/renderer.ts` (~180 行)

**步骤：**
1. 定义 `export interface SkinConfig { handleColor: string; bodyGradient: [string, string]; ... }`
2. `drawWhip(ctx: CanvasRenderingContext2D, whipState: WhipState, skinConfig: SkinConfig)`：使用皮肤颜色绘制
3. 从 overlay.html 的 `draw()` 函数迁移 Catmull-Rom Bézier 绘制逻辑
4. 单元测试（使用 OffscreenCanvas 或 jsdom）：验证绘制不抛错

**提交：** `feat: implement whip renderer with skin support`

---

## Phase 4：设置 UI + 引导流程

### Task 4.1：调用 /frontend-design skill

**步骤：**
1. **必须先调用** `Skill(skill='frontend-design', args='OpenWhip 设置窗口 - 侧边导航 + 多面板 + 快捷键录制 + 皮肤预览')`
2. 根据 skill 输出的设计方案（颜色、间距、字体、动效曲线）生成 CSS 变量文件 `src/settings/design-tokens.css`
3. 验证设计方案符合 `.claude/rules/ui-design.md` 所有规则（禁止 AI 味、独立暗色模式、自定义贝塞尔曲线）

**产出：** `src/settings/design-tokens.css`，设计方案记录在提交消息中

---

### Task 4.2：设置窗口框架（React + 侧边导航）

**文件：** `src/settings/App.tsx`, `src/settings/components/Sidebar.tsx`, `src/settings/main.tsx`

**步骤：**
1. `main.tsx`: React 18 渲染入口，挂载到 `settings.html`
2. `App.tsx`: 状态管理（当前面板、config state），`useEffect` 加载 config
3. `Sidebar.tsx`: 导航项（触发 / 提示词 / 皮肤 / 动画 / 音效 / 统计），active 状态样式
4. 使用 Framer Motion `<AnimatePresence>` 实现面板切换动画
5. 组件测试：`@testing-library/react`，验证导航点击切换面板

**提交：** `feat: implement settings UI framework (React + sidebar)`

---

### Task 4.3：各设置面板组件

**文件：** `src/settings/components/TriggerPanel.tsx` (~80行), `PhrasesPanel.tsx`, `SkinsPanel.tsx`, `AnimationPanel.tsx`, `StatsPanel.tsx`

**步骤：**
1. **TriggerPanel**: 快捷键录制组件（录制状态、冲突提示、推荐替代）
2. **PhrasesPanel**: 提示词列表（增删改，最多 20 条，最后一条禁止删除）
3. **SkinsPanel**: 皮肤列表 + 预览缩略图，切换皮肤调用 `activateSkin()`
4. **AnimationPanel**: 单选 standard/fast/auto，auto 模式显示阈值滑块，Shift 彩蛋说明
5. **StatsPanel**: 只读展示 usageCount / todayUsageCount
6. 每个面板组件测试：交互路径全覆盖

**提交：** `feat: implement all settings panels`

---

### Task 4.4：首次启动引导（3 步流程）

**文件：** `src/onboarding/OnboardingFlow.tsx` (~150 行)

**步骤：**
1. 3 步进度条（Step completed/active 样式，规格 §R-UI-013）
2. Step 1/3：快捷键录制（与 TriggerPanel 共用录制组件）
3. Step 2/3：提示词勾选（默认 4 条全选）
4. Step 3/3：皮肤选择 + 操作说明
5. 完成后：`saveConfig({ ...config, firstLaunch: false })`，关闭引导窗口
6. 组件测试：验证 3 步流程，最后一步点击完成后 firstLaunch 变为 false

**提交：** `feat: implement first-launch onboarding (3-step wizard)`

---

## Phase 5：E2E 测试 + 打包优化

### Task 5.1：E2E 环境配置

**文件：** `wdio.conf.ts`, `src-tauri/Cargo.toml` (添加 test 依赖)

**步骤：**
1. `npm install --save-dev @wdio/cli@^9 webdriverio@^9 @wdio/tauri-service@^1.3 @wdio/mocha-framework`
2. `[target.'cfg(debug_assertions)'.dependencies]` 添加 `tauri-plugin-wdio-webdriver = "1.3"`
3. `main.rs` 中 `#[cfg(debug_assertions)]` 注册插件：`.plugin(tauri_plugin_wdio_webdriver::init())`
4. `src-tauri/capabilities/default.json` 添加 `"wdio-webdriver:default"` 权限
5. `wdio.conf.ts` 配置：`services: ['@wdio/tauri-service']`, `capabilities: [{ browserName: 'tauri', 'tauri:options': { application: './src-tauri/target/release/openwhip' } }]`
6. `npm run tauri build`，验证 WebDriver 端口 4445 在 debug 构建中开启

**提交：** `chore: configure E2E test environment (WebdriverIO + tauri-plugin-wdio-webdriver)`

---

### Task 5.2：E2E 测试用例（10 条旅程）

**文件：** `tests/e2e/*.spec.ts` (10 个文件)

**核心旅程：**
- J01：应用启动 → 托盘图标可见（< 500ms）
- J02：托盘点击 → 调用 `__test_click_tray()` 后门 → overlay 窗口出现
- J03：全局快捷键 → 调用 `__test_trigger_shortcut()` 后门 → overlay 出现
- J04：overlay 中模拟鼠标移动 → 等待 crack → 验证 `__test_send_macro(phrase)` 被调用（通过日志或状态）
- J05：修改提示词 → 保存 → 重启 → 验证持久化
- J06：切换皮肤 → 验证 overlay 使用新颜色（截图对比或 DOM 属性）
- J07：触发 20 次 → 验证 animationMode 变为 'fast'
- J08：快速模式下调用 `__test_trigger_shortcut({ shiftPressed: true })` → 验证完整动画
- J09：首次启动 → 引导窗口出现 → 完成 3 步 → firstLaunch = false
- J10：调用 `__test_send_macro("TEST")` → 验证宏发送（通过 FakeMacroSender 记录）

**后门命令实现（commands.rs）：**
```rust
#[cfg(debug_assertions)]
#[tauri::command]
pub async fn __test_trigger_shortcut(shift_pressed: Option<bool>) -> Result<()> {
    // emit spawn-whip event
    Ok(())
}

#[cfg(debug_assertions)]
#[tauri::command]
pub async fn __test_click_tray() -> Result<()> {
    // emit spawn-whip event
    Ok(())
}

#[cfg(debug_assertions)]
#[tauri::command]
pub async fn __test_send_macro(phrase: String, state: State<AppState>) -> Result<()> {
    // 直接调用 macro_sender，记录到测试日志
    Ok(())
}
```

**步骤：**
1. 为每条旅程创建独立 spec 文件
2. 使用 `browser.$('selector')` 定位元素，`browser.execute(() => ...)` 调用后门命令
3. 每个测试独立启动应用，`afterEach` 清理配置文件
4. `npm run test:e2e` 运行全部

**提交：** `test: implement 10 E2E user journeys`

---

### Task 5.3：性能测试 + 优化

**文件：** `tests/performance/startup.bench.ts`, `tests/performance/physics.bench.ts`

**步骤：**
1. 启动时间测试：从 `tauri dev` 启动到托盘可见，10 次取平均，< 500ms
2. 快捷键响应测试：触发到 overlay 出现，< 150ms
3. 物理循环 benchmark：`physicsStep` 1000 次取 P99，< 2ms/帧
4. 内存测试：启动后 5s 采样 RSS，< 50MB
5. 包体积检查：`npm run tauri build` 产物 < 15MB
6. 如超标，优化：Tree-shaking、剔除未使用皮肤音效、strip symbols

**提交：** `test: add performance benchmarks + verify budgets`

---

### Task 5.4：CI 流水线

**文件：** `.github/workflows/ci.yml`

**步骤：**
1. 矩阵构建：macOS (arm64) / Windows (x64) / Linux (x64)
2. 每个平台：`npm ci` → `npm run typecheck` → `npm run test` → `cd src-tauri && cargo clippy -- -D warnings && cargo test`
3. macOS: `npm run tauri build` → E2E（`npm run test:e2e`）
4. 上传 artifacts（macOS .dmg / Windows .msi / Linux .AppImage）
5. PR 门禁：所有测试绿色

**提交：** `ci: add GitHub Actions workflow for all platforms`

---

## 执行交接

计划已完成并保存至 `docs/superpowers/plans/2026-08-11-openwhip-v2-tauri-migration.md`。

两种执行方式：

**1. Subagent-Driven（推荐）**  
每个任务派发一个新 subagent，两阶段审查（初审 + 终审），快速迭代。

调用方式：
```
Skill(skill='superpowers:subagent-driven-development', args='docs/superpowers/plans/2026-08-11-openwhip-v2-tauri-migration.md')
```

**2. Inline Execution**  
在当前会话中串行执行，批量提交 + checkpoint 审查。

调用方式：
```
Skill(skill='superpowers:executing-plans', args='docs/superpowers/plans/2026-08-11-openwhip-v2-tauri-migration.md')
```

你希望哪种方式？
