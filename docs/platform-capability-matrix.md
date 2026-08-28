# AISpur 平台能力矩阵

| 能力 | macOS | Windows | Linux |
| --- | --- | --- | --- |
| 全局快捷键 | 已实现，含 Shift companion | 通过原生 runner 验证 | 依赖桌面环境验证 |
| `Cmd/Ctrl + Shift + 数字` | 已有 parser/IPC 测试 | Windows CI 原生 target + E2E | parser 测试，桌面实测待补 |
| 托盘左键打开设置 | 已实现 | 已实现，任务栏/托盘由 Windows CI 验证 | 依赖托盘实现 |
| 持久窗口入口 | Dock 保留 Regular，关闭隐藏 | 关闭最小化保留任务栏 | 关闭最小化，桌面环境待验证 |
| 前台安全门禁 | System Events + 光标下窗口 | Win32 前台进程白名单 | 当前为兼容回退，列为 P1 |
| 输入权限恢复 | Accessibility 设置入口 | 隐私诊断 + UIPI/权限级别说明 | `xdg-open settings://`，发行版差异 |
| Rust 编译/测试 | 主机通过 | Windows runner 原生执行 | Linux CI 执行 |
| E2E | 本地 WebKit 已通过 | runner 有二进制时执行，否则输出诊断并跳过 | 未纳入桌面 E2E |

状态含义：`已实现` 表示代码和 host 测试覆盖；`runner 验证` 表示必须以对应平台 CI 的真实输出为准，不用 macOS 结果替代。
