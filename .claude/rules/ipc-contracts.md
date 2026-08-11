# IPC 契约规则

## 定义

"IPC 契约"指 Rust 主进程与 TypeScript 渲染进程之间所有通信消息的结构定义。
契约文件为 `src/shared/ipc.ts`（TS 端）和 `src-tauri/src/ipc_types.rs`（Rust 端）。

---

## 命令契约（TS → Rust）

### R-IPC-001：所有 Tauri 命令必须在 ipc.ts 中有包装函数
不允许在业务代码中直接调用 `invoke()`。每个命令对应一个类型安全的包装：

```typescript
// src/shared/ipc.ts

export async function getConfig(): Promise<Config> {
  const raw = await invoke<unknown>('get_config');
  return ConfigSchema.parse(raw); // 契约验证
}

export async function saveConfig(config: Config): Promise<void> {
  return invoke('save_config', { config });
}

export async function registerHotkey(
  hotkey: string
): Promise<Result<void, HotkeyError>> {
  return invoke('register_hotkey', { hotkey });
}

export async function listSkins(): Promise<SkinManifest[]> {
  const raw = await invoke<unknown[]>('list_skins');
  return raw.map(s => SkinManifestSchema.parse(s));
}
```

### R-IPC-002：命令响应必须经过 Zod 解析
从 `invoke()` 返回的所有数据必须通过对应的 Zod schema 解析后才能使用，
不允许直接 `as Config` 类型断言绕过运行时验证。

---

## 事件契约（Rust → TS）

### R-IPC-003：事件监听必须有类型包装和契约验证
```typescript
// src/shared/ipc.ts

export function onSpawnWhip(fn: () => void): UnlistenFn {
  return listen<void>('spawn-whip', () => fn());
}

export function onConfigUpdated(fn: (config: Config) => void): UnlistenFn {
  return listen<unknown>('config-updated', (event) => {
    fn(ConfigSchema.parse(event.payload));
  });
}
```

### R-IPC-004：事件名称使用 kebab-case 枚举常量
```typescript
// src/shared/ipc.ts
export const Events = {
  SPAWN_WHIP: 'spawn-whip',
  DROP_WHIP: 'drop-whip',
  CONFIG_UPDATED: 'config-updated',
  SKIN_CHANGED: 'skin-changed',
  MODE_CHANGED: 'mode-changed',
} as const;
```

---

## Rust 端契约规则

### R-IPC-005：Rust 命令参数和返回值使用 serde 类型
所有 `#[tauri::command]` 的参数和返回值必须 `#[derive(Serialize, Deserialize)]`，
不允许裸 `String` 传递 JSON。

```rust
// ✅ 正确
#[tauri::command]
fn get_config(state: State<AppState>) -> Result<Config, AppError> {
    Ok(state.config.lock().unwrap().clone())
}

// ❌ 禁止
#[tauri::command]
fn get_config(state: State<AppState>) -> String {
    serde_json::to_string(&*state.config.lock().unwrap()).unwrap()
}
```

### R-IPC-006：错误类型必须可序列化为用户友好字符串
```rust
#[derive(Debug, Serialize)]
#[serde(tag = "type", content = "message")]
pub enum AppError {
    HotkeyConflict { hotkey: String },
    ConfigCorrupted { reason: String },
    SkinNotFound { id: String },
    InputPermissionDenied,
}
```

---

## 完整命令列表（需实现的全部命令）

| 命令名 | 入参 | 出参 | 描述 |
|---|---|---|---|
| `get_config` | — | `Config` | 读取当前配置 |
| `save_config` | `Config` | `void` | 保存配置 |
| `register_hotkey` | `{ hotkey: string }` | `Result<void, AppError>` | 注册全局快捷键 |
| `trigger_macro` | `{ phrase?: string }` | `void` | 直接触发（绕过动画） |
| `list_skins` | — | `SkinManifest[]` | 列出所有可用皮肤 |
| `open_settings` | — | `void` | 打开设置窗口 |
| `increment_usage` | — | `number` | 使用次数 +1，返回新值 |
| `check_hotkey_conflict` | `{ hotkey: string }` | `ConflictInfo \| null` | 检查快捷键是否冲突 |

## 完整事件列表（Rust 发往 WebView）

| 事件名 | 载荷类型 | 目标窗口 | 描述 |
|---|---|---|---|
| `spawn-whip` | `void` | overlay | 触发鞭子出现 |
| `drop-whip` | `void` | overlay | 触发鞭子下落 |
| `config-updated` | `Partial<Config>` | settings | 配置在 Rust 侧更新 |
| `skin-changed` | `{ skinId: string }` | overlay | 皮肤切换通知 |
| `mode-changed` | `{ mode: AnimationMode }` | overlay | 动画模式切换 |
