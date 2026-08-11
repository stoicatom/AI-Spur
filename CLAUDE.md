# OpenWhip v2 — AI 工程宪法

> **这是 AI 编码会话的最高约束文档。所有规则文件、设计规格、ADR 均从属于此文档。
> 遇到矛盾时，以本文件为准。**

---

## 一、项目概述

OpenWhip 是一个跨平台（macOS / Windows / Linux）桌面托盘应用，用于向 Claude Code CLI 发送"催促"信号。

**核心循环：**
1. 用户按全局快捷键 → 触发鞭子动画（全屏透明覆盖层）
2. 鞭子甩出达到速度阈值 → crack 事件
3. 自动发送 `Ctrl+C` 中断信号 + 随机提示词 + `Enter`

**产品设计方向（已确认，不得更改）：**
- 双轨并行：快捷键（效率）+ 托盘点击（娱乐 / 演示）
- 渐进式动画：前 20 次完整动画，之后自动切换快速模式
- `Shift + 快捷键` 彩蛋：随时恢复完整动画
- 皮肤系统：内置 4 套 + 用户自定义皮肤包

---

## 二、技术栈（不可更改，需有 ADR 才能替换）

| 层 | 技术 | 版本约束 |
|---|---|---|
| 桌面框架 | **Tauri v2** | `tauri = "2"` |
| 前端 | **TypeScript + Vite** | TypeScript `^5.4`, strict mode |
| 前端测试 | **Vitest + Testing Library** | `vitest ^2` |
| 后端语言 | **Rust** | edition 2021, stable |
| 输入合成 | **enigo** | `0.2.*` |
| 全局快捷键 | **tauri-plugin-global-shortcut** | `2.*` |
| 配置验证（前端） | **Zod** | `^3` |
| E2E | **WebdriverIO + @wdio/tauri-service** | 内嵌驱动模式 |

**禁止引入的依赖：**
- `koffi` / `ffi-napi`（已被 enigo 替代）
- `osascript` 直接调用（已被 enigo 替代）
- `keybd_event`（deprecated Win32 API，用 `SendInput` via enigo）
- 任何 `npm install` 的 Electron 相关包
- 未经 ADR 批准的新框架

---

## 三、目录结构规范

```
openwhip/
├── src-tauri/              # Rust 后端（标准 Tauri 目录）
│   ├── src/
│   │   ├── main.rs         # app 入口，插件注册
│   │   ├── config.rs       # Config struct, load/save/migrate
│   │   ├── tray.rs         # 托盘菜单，click handler
│   │   ├── overlay.rs      # 覆盖层窗口生命周期
│   │   ├── shortcut.rs     # 快捷键注册 + 冲突检测
│   │   ├── macro_sender.rs # 输入合成（Trait + EnigoImpl）
│   │   └── skins.rs        # 皮肤发现 + manifest 解析
│   ├── tests/              # Rust 集成测试
│   └── Cargo.toml
├── src/                    # TypeScript 前端（Vite）
│   ├── overlay/
│   │   ├── physics.ts      # 鞭子物理引擎（确定性，固定 dt）
│   │   ├── renderer.ts     # Canvas 渲染器
│   │   └── skins.ts        # 皮肤加载器
│   ├── settings/
│   │   ├── App.tsx         # 设置窗口根组件
│   │   └── components/     # 各设置面板组件
│   ├── shared/
│   │   ├── ipc.ts          # 强类型 IPC 包装（命令 + 事件）
│   │   └── config.ts       # Config 类型 + Zod schema
│   └── __tests__/          # Vitest 单元 + 组件测试
├── tests/e2e/              # WebdriverIO E2E
├── skins/                  # 内置皮肤包
│   ├── default/manifest.json
│   ├── fire/manifest.json
│   ├── electric/manifest.json
│   └── neon/manifest.json
├── docs/
│   ├── adr/                # Architecture Decision Records
│   └── superpowers/specs/  # 设计规格文档
├── .claude/
│   ├── rules/              # 细粒度规则（按主题拆分）
│   ├── agents/             # 专用 AI agent 定义
│   └── settings.json       # hooks 自动化
└── CLAUDE.md               # 本文件
```

**单文件行数限制：**
- Rust 文件：≤ 300 行（main.rs 除外，≤ 150）
- TypeScript 文件：≤ 250 行
- 超出时必须拆分模块，不允许以"暂时"为由堆砌

---

## 四、架构约束

### 4.1 进程边界
```
[Rust 主进程]
  ├── 配置管理（唯一写者）
  ├── 全局快捷键（Tauri plugin）
  ├── 输入合成（enigo）
  ├── 托盘管理
  └── 窗口管理

[WebView 渲染进程]（通过 IPC 通信）
  ├── overlay 窗口：物理动画
  └── settings 窗口：配置 UI
```

**规则：**
- 渲染进程不得直接调用系统 API
- 所有系统调用通过 Tauri Commands（`#[tauri::command]`）进入 Rust
- 全局状态只能在 Rust 主进程中持有（`Arc<Mutex<AppState>>`）

### 4.2 错误处理
- Rust：`thiserror` 定义领域错误，所有 `unwrap()` 需有注释说明为何安全
- TypeScript：所有 IPC 调用使用 `Result<T, E>` 模式，不允许裸 `invoke(...)` 不捕获错误
- 用户可见错误：通过 Tauri notification 或设置 UI 内 toast 展示，不允许 `console.error` 了事

### 4.3 配置管理
- 配置文件位置：`app_config_dir() / config.json`（跨平台由 Tauri 解析）
- 版本迁移：`config.rs` 中实现 `migrate_v1_to_v2()`，读取时自动检测旧格式
- 配置校验：Rust 端 serde + 前端端 Zod，两端 schema 必须保持同步

---

## 五、测试要求（不可妥协）

详见 `.claude/rules/testing.md`，摘要如下：

| 测试类型 | 工具 | 覆盖率要求 |
|---|---|---|
| 单元测试（TS） | Vitest | 物理引擎、Config schema、IPC 序列化 |
| 单元测试（Rust） | cargo test | config.rs, macro_sender.rs, shortcut.rs |
| 组件测试 | Vitest + @testing-library/react | 设置 UI 所有交互路径 |
| 集成测试（Rust） | cargo test --test | MacroSender trait 模拟后端 |
| 契约测试 | Zod runtime validation | 所有跨进程消息 |
| E2E | WebdriverIO + @wdio/tauri-service | 10 条核心用户旅程 |

**CI 门禁：所有测试绿色才允许合并/发布。**

---

## 六、性能预算（不可逾越）

| 指标 | 限制 |
|---|---|
| 应用启动到托盘可见 | < 500ms |
| 快捷键按下到覆盖层可见 | < 150ms |
| 动画帧率 | ≥ 60 FPS（16.6ms/帧） |
| 物理循环耗时 | < 2ms/帧 |
| 空闲内存占用 | < 50MB |
| 覆盖层激活峰值内存 | < 80MB |
| 安装包体积 | < 15MB |

物理引擎必须使用**固定时间步长**（`dt = 1/60`），不允许与渲染帧率耦合。

---

## 七、皮肤系统规范

详见设计规格 §6。摘要：

- 皮肤为目录，包含 `manifest.json` + 音效文件
- 内置皮肤：`skins/` 目录，随 app 打包
- 用户皮肤：`app_data_dir() / skins/<id>/`
- manifest 版本：`"specVersion": "1"`
- 加载安全：Tauri asset scope 限定为皮肤目录，禁止路径遍历

---

## 八、AI 编码规则速查

| 场景 | 规则 |
|---|---|
| 实现任何 UI | **必须先调用 `/frontend-design` skill**，禁止 AI 味 |
| 新增 Tauri 命令 | 必须同步更新 `src/shared/ipc.ts` 类型，并添加契约测试 |
| 修改配置 schema | Rust + TS 两端同步修改，添加迁移函数 |
| 修改物理参数 | 单元测试覆盖 crack 触发逻辑 |
| 新增皮肤 | 必须包含 manifest.json，通过 schema 验证测试 |
| 修改 IPC 消息 | 更新契约测试，两端同步 |
| 任何 unsafe Rust | 必须有 SAFETY 注释 |
| 文件超过行数限制 | 必须先拆分，不允许继续添加 |

---

## 九、运行 / 验证命令

```bash
# 开发
npm run tauri dev

# 前端测试
npm run test          # Vitest 单元 + 组件
npm run typecheck     # tsc --noEmit

# Rust 测试
cargo test            # 单元 + 集成
cargo clippy -- -D warnings
cargo fmt --check

# E2E（需 app 已构建）
npm run test:e2e

# 完整 CI 检查
npm run ci
```

---

## 十、不允许的行为

- ❌ 实现 UI 前不调用 `/frontend-design` skill
- ❌ 使用 AI 味样式（`bg-gray-50`、`rounded-lg`、`px-4 py-2`）
- ❌ 跳过任何测试类型（"先实现，后补测试"）
- ❌ 在 WebView 端调用 Node.js API 或原生 API
- ❌ 硬编码路径（用 Tauri path API）
- ❌ 使用 `any` 类型（TypeScript strict，所有 `any` 需 `// eslint-disable` + 注释）
- ❌ 不处理 IPC 错误
- ❌ 在 Rust 中 `unwrap()` 外部输入（文件、IPC、用户配置）
- ❌ 修改 `docs/superpowers/specs/` 下的规格文档（除非明确获得用户批准）
- ❌ 绕过 hooks（`--no-verify`）
