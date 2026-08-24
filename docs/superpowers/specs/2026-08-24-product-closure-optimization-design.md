# AISpur 产品闭环优化设计

## 背景

现有核心入口、快捷键解析/冲突回滚和 Windows 前台进程白名单已经完成，但审计仍发现反馈闭环、窗口恢复策略、构建验证和跨平台流水线不足。本设计只覆盖这些剩余项，不改变素材包和动画业务契约。

## 设计决策

1. 宏错误采用结构化分类：`SafetyGate`、`Permission`、`SendFailure`。Rust command 仍返回 `Result`，同时向 overlay 发出 `macro-failed` 事件；前端按分类显示可恢复提示。
2. 窗口入口策略默认保持当前纯托盘行为，新增 `windowPresence` 配置：`tray` 或 `persistent`。`persistent` 下关闭设置只隐藏窗口，Dock/任务栏入口保持可恢复；`tray` 下维持当前 accessory/隐藏任务栏策略。
3. 快捷键冲突信息扩展 `scope`（primary/shift-companion）和 `previousHotkey`，录制器提供恢复按钮；原有事务式 Rust rollback 作为最终一致性保障。
4. Vite 将 Three.js 特效按现有 effect-family 模块拆分，保留动态 `three-effect-host` 入口，避免一次性加载全部特效。
5. Windows CI 负责交叉编译和静态/单元验证；真实桌面托盘、前台进程和权限流程在 Windows runner 中显式标记，不能以 macOS 结果替代。

## 错误与状态流

`trigger_macro` 先通过平台安全门禁，再执行 sender。失败时构造 `{ code, message, retryable }`，发出 `macro-failed`；overlay 显示状态并允许重试，权限错误额外提供系统设置入口。成功路径保持现有 `Ctrl+C -> phrase -> Enter`。

## 验收标准

- 安全拒绝不会注入输入，用户能看到原因；权限/发送失败可以重试。
- 用户能在设置中选择纯托盘或保持窗口入口，重启后策略仍生效。
- 快捷键冲突能指出冲突成员，并能恢复上一有效组合。
- 生产构建不再把全部 Three.js 特效打入单一首屏 chunk。
- CI 有 Windows job，报告 target、Rust 测试、前端测试和 E2E 的实际状态。
- 现有单测、Rust 测试和 macOS E2E 不回归。
