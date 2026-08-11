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
