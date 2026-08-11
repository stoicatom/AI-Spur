# 架构规则

## 进程边界规则

### R-ARCH-001：渲染进程无直接系统调用
渲染进程（WebView）不得直接调用任何操作系统 API。
所有系统交互必须通过 `invoke()` 进入 Rust 命令层。

**违反示例：**
```typescript
// ❌ 禁止
import { writeTextFile } from '@tauri-apps/api/fs';
writeTextFile('/etc/hosts', '...'); // 直接文件系统
```

**正确示例：**
```typescript
// ✅ 通过定义好的命令
import { saveConfig } from '../shared/ipc';
await saveConfig(config); // 经过 Rust 验证和路径限制
```

### R-ARCH-002：全局状态唯一写者
配置、使用次数、皮肤状态等全局状态只能由 Rust 主进程持有和修改。
前端通过 `get_*` 命令读取，通过 `save_*` 命令触发写入，不自行维护权威状态。

### R-ARCH-003：IPC 强类型
所有 Tauri 命令和事件必须在 `src/shared/ipc.ts` 中有对应的类型定义。
不允许裸调用 `invoke<any>()` 或 `listen<any>()`。

## 模块边界规则

### R-ARCH-004：overlay 与 settings 窗口完全解耦
两个 WebView 窗口不得共享 JavaScript 状态。
跨窗口通信唯一路径：
```
settings window → Rust command → Rust emits event → overlay window listens
```

### R-ARCH-005：物理引擎纯函数化
`src/overlay/physics.ts` 中的物理计算不得有副作用（无 DOM 操作、无 IPC 调用）。
所有状态通过参数传入，通过返回值传出，便于单元测试。

### R-ARCH-006：皮肤加载器与渲染器解耦
`skins.ts` 只负责加载和验证皮肤数据，不负责渲染。
`renderer.ts` 只负责渲染，接受 SkinConfig 作为参数，不直接加载文件。

## Rust 模块规则

### R-ARCH-007：MacroSender 必须为 Trait
输入合成功能必须通过 Trait 抽象，以便测试时替换为 FakeInputBackend：

```rust
// macro_sender.rs
pub trait MacroSender: Send + Sync {
    fn send_interrupt(&self) -> Result<(), MacroError>;
    fn type_text(&self, text: &str) -> Result<(), MacroError>;
    fn press_enter(&self) -> Result<(), MacroError>;
}

pub struct EnigoSender { /* enigo 实现 */ }
pub struct FakeInputBackend { pub calls: Arc<Mutex<Vec<MacroCall>>> }
```

### R-ARCH-008：Tauri 命令无业务逻辑
`#[tauri::command]` 函数只做参数解包和结果包装，业务逻辑在独立模块中：

```rust
// ✅ 正确
#[tauri::command]
async fn save_config(config: Config, state: State<'_, AppState>) -> Result<(), String> {
    state.config_manager.save(&config).await.map_err(|e| e.to_string())
}

// ❌ 禁止——业务逻辑直接在命令中
#[tauri::command]
async fn save_config(config: Config) -> Result<(), String> {
    let path = dirs::config_dir().unwrap().join("openwhip/config.json");
    std::fs::write(path, serde_json::to_string(&config).unwrap()).map_err(|e| e.to_string())
}
```

## 安全规则

### R-ARCH-009：皮肤资产路径白名单
Tauri 资产协议（`asset://`）的访问范围必须明确限制在皮肤目录，
不允许用户皮肤 manifest 中的路径逃逸到其他目录（防路径遍历）。
在 `tauri.conf.json` 的 `security.assetProtocol.scope` 中明确配置。

### R-ARCH-010：配置迁移向前兼容
每次更改 Config schema，必须在 `config.rs` 中实现迁移函数：
```rust
fn migrate(raw: serde_json::Value) -> Result<Config, ConfigError> {
    let version = raw.get("version").and_then(|v| v.as_str()).unwrap_or("1.0");
    match version {
        "1.0" => migrate_v1_to_v2(raw),
        "2.0" => serde_json::from_value(raw).map_err(Into::into),
        _ => Err(ConfigError::UnknownVersion(version.to_string())),
    }
}
```
