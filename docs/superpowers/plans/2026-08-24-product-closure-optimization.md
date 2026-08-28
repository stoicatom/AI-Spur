# AISpur 产品闭环优化实施计划

> **For agentic workers:** 已按推荐方案拆分为独立任务；实现后必须运行前端、Rust、E2E 和构建验证。

**目标：** 将审计报告中的 P0/P1/P2 建议落地为可恢复的用户流程、可重复的跨平台验证和可维护的构建产物。

**架构：** Rust 负责宏安全门禁、输入后端状态和结构化错误；前端通过统一 IPC/event 显示可恢复反馈。设置页增加明确的窗口入口策略和快捷键回滚状态。Vite/CI 只调整构建与验证边界，不改变素材业务逻辑。

**技术栈：** Tauri 2、Rust、React/TypeScript、Vitest、WebdriverIO、GitHub Actions、Vite Rollup。

---

### 任务 1：宏失败和输入权限反馈

**文件：** `src-tauri/src/commands.rs`、`src-tauri/src/macro_sender.rs`、`src-tauri/src/main.rs`、`src/shared/ipc.ts`、`src/overlay/main.ts`、相关单测/E2E。

- [x] 定义结构化宏错误分类（安全门禁、权限、发送失败），保持 IPC 可序列化。
- [x] `trigger_macro` 失败时向 overlay 发出带分类的 `macro-failed` 事件，并保留日志。
- [x] 在 overlay 显示可恢复提示；权限类错误提供重试/打开设置入口，安全门禁显示当前应用不安全且不注入。
- [x] 为错误分类、事件载荷和重试行为补测试；运行 Rust/TS/E2E。

### 任务 2：窗口入口与快捷键可用性

**文件：** `src-tauri/src/config.rs`、`src-tauri/src/commands.rs`、`src-tauri/tauri.conf.json`、`src/settings/App.tsx`、`src/settings/components/HotkeyRecorder.tsx`、设置样式/i18n、相关测试。

- [x] 增加可持久化的窗口入口策略（纯托盘、保持 Dock/任务栏入口），并让关闭/恢复路径按策略执行。
- [x] 冲突信息区分 primary 与 Shift companion，显示占用对象/组合，提供一键恢复上一次有效快捷键。
- [x] 保证重绑定失败、窗口恢复和策略切换均有用户可见状态及回滚。
- [x] 补组件、Rust 和 E2E 测试。

### 任务 3：构建与平台验证

**文件：** `vite.config.mts`、`.github/workflows/ci.yml`、`package.json`、测试文件。

- [x] 将 `three-effects` 按特效族拆分为可缓存的 Rollup chunks，并验证产物体积下降。
- [x] 增加 Windows CI job：安装 target、构建/测试、E2E 所需驱动；平台不可用时输出明确诊断。
- [x] 治理高频 React `act` 警告，优先处理设置/快捷键核心测试。
- [x] 更新审计报告和平台能力矩阵。

### 任务 4：集中验证

- [x] `pnpm test`
- [x] `pnpm typecheck`
- [x] `pnpm build`
- [x] `pnpm test:e2e`
- [x] `cargo fmt --check`
- [x] `cargo test --all-targets --all-features`
- [x] `cargo clippy --all-targets --all-features -- -D warnings`
- [x] `git diff --check`

> Windows 真实桌面行为仍需等待原生 GitHub Actions runner；当前 macOS 主机未安装 `x86_64-pc-windows-msvc` 标准库，不能用本机结果替代。
