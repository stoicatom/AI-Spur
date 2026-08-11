# ADR-001：使用 Tauri v2 替代 Electron

**日期：** 2026-08-11  
**状态：** 已接受  
**决策者：** lorain

---

## 背景

OpenWhip v1 使用 Electron 构建。v2 需要：
- 更快的启动速度（< 500ms）
- 更小的包体积（< 15MB）
- 跨平台输入合成（替代 osascript + koffi）
- 全局快捷键插件支持

## 决策

使用 **Tauri v2** + **enigo** 替代 **Electron + koffi/osascript**。

## 理由

| 指标 | Electron | Tauri v2 |
|---|---|---|
| 典型安装包 | 150MB | 3-10MB |
| 空闲内存 | 120-150MB | 20-40MB |
| 启动耗时 | 1500-3000ms | 200-500ms |
| 输入合成 API | koffi（Win）+ osascript（mac）| enigo（统一跨平台） |
| macOS osascript 延迟 | 200-300ms（两次 execFile 调用） | ~10ms（enigo CGEvent） |
| 全局快捷键 | Electron 内置 | tauri-plugin-global-shortcut |
| WebView | Chromium（独立打包） | 系统 WebView（WKWebView/WebView2/WebKitGTK） |

## 取舍

**接受的限制：**
- macOS E2E 需要使用 `@wdio/tauri-service` 内嵌驱动（而非 tauri-driver，后者不支持 macOS）
- 系统 WebView 版本不受控，需要注意 CSS 兼容性（使用 autoprefixer）
- Rust 学习曲线比 Node.js 高

**拒绝的替代方案：**
- 继续用 Electron：包体积和启动速度无法满足性能预算
- NW.js：生态更弱，无 Rust 后端优势
- 纯 Rust TUI：无法实现现有的 Canvas 物理动画

## 影响

- 后端语言从 Node.js 变为 Rust（edition 2021）
- 输入合成从 `koffi` + `osascript` 变为 `enigo 0.2`
- 构建工具链需要安装 Rust stable toolchain
- 所有 v1 的 `ipcMain.on` 替换为 `#[tauri::command]`
