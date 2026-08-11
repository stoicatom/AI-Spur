# 测试规则

## 测试金字塔

```
        ┌─────────────────────┐
        │   E2E (10 条旅程)    │  WebdriverIO
        ├─────────────────────┤
        │  集成测试 (Rust)     │  cargo test --test
        ├─────────────────────┤
        │  组件测试 (TS)       │  Vitest + Testing Library
        ├─────────────────────┤
        │  契约测试 (双端)     │  Zod + serde 验证
        ├─────────────────────┤
        │  单元测试 (TS+Rust)  │  Vitest + cargo test
        └─────────────────────┘
```

## 单元测试规则

### R-TEST-001：物理引擎必须有确定性测试
`physics.ts` 的每个函数都必须有独立单元测试，使用固定输入验证输出。
物理步进使用固定 `dt = 1/60`，结果必须确定性可重现。

```typescript
// src/__tests__/physics.test.ts
it('crack 触发阈值：tip 速度超过 340 时触发', () => {
  const state = createWhipState(/* ... */);
  // 给 tip 施加足够速度
  state.pts[27].px = state.pts[27].x - 350; // vx = 350 > crackSpeed
  const result = physicsStep(state, { dt: 1/60 });
  expect(result.crackTriggered).toBe(true);
});
```

### R-TEST-002：Config schema 必须测试边界值
```typescript
it('phrases 为空数组时 Zod 应拒绝', () => {
  expect(() => ConfigSchema.parse({ ...validConfig, phrases: [] })).toThrow();
});
it('usageCount 为负数时应拒绝', () => {
  expect(() => ConfigSchema.parse({ ...validConfig, usageCount: -1 })).toThrow();
});
```

### R-TEST-003：Rust 单元测试与被测代码同文件
```rust
// config.rs 底部
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrate_v1_config_preserves_hotkey() {
        let v1 = serde_json::json!({ "version": "1.0", "hotkey": "ctrl+w" });
        let migrated = migrate(v1).unwrap();
        assert_eq!(migrated.hotkey, "ctrl+w");
    }
}
```

## 组件测试规则

### R-TEST-004：设置 UI 每个交互路径必须有测试
必须覆盖：
- 添加自定义提示词
- 删除提示词（最后一条时应禁用删除按钮）
- 快捷键录制（模拟 keydown 事件）
- 快捷键冲突提示展示
- 皮肤切换
- 动画模式切换
- 保存后 IPC 被调用

```typescript
it('删除最后一条提示词时删除按钮应被禁用', async () => {
  render(<PhraseEditor phrases={['FASTER']} onChange={vi.fn()} />);
  const deleteBtn = screen.getByRole('button', { name: /删除/ });
  expect(deleteBtn).toBeDisabled();
});
```

### R-TEST-005：IPC 必须 mock，不允许真实 invoke
组件测试中所有 `invoke` 调用必须通过 `vi.mock('../shared/ipc')` 替换，
不允许依赖真实 Tauri 运行时。

## 契约测试规则

### R-TEST-006：每条 IPC 消息都有契约测试
在 `src/__tests__/contracts/` 下，每个 Tauri 命令和事件对应一个测试文件，
验证 Zod schema 能解析来自 Rust 的所有合法响应结构，并拒绝非法结构。

```typescript
// src/__tests__/contracts/config.contract.test.ts
describe('get_config 响应契约', () => {
  it('解析合法配置', () => {
    const response = { version: '2.0', hotkey: 'CmdOrCtrl+W', /* ... */ };
    expect(() => ConfigSchema.parse(response)).not.toThrow();
  });
  it('拒绝缺失 version 字段', () => {
    expect(() => ConfigSchema.parse({ hotkey: 'x' })).toThrow();
  });
});
```

## 集成测试规则

### R-TEST-007：MacroSender 集成测试使用 FakeInputBackend
```rust
// src-tauri/tests/macro_integration.rs
#[test]
fn whip_crack_sends_interrupt_then_text() {
    let fake = FakeInputBackend::new();
    handle_whip_crack(&fake, "FASTER").unwrap();
    let calls = fake.calls.lock().unwrap();
    assert_eq!(calls[0], MacroCall::Interrupt);
    assert!(matches!(calls[1], MacroCall::TypeText(ref t) if t == "FASTER"));
    assert_eq!(calls[2], MacroCall::Enter);
}
```

## E2E 测试规则

### R-TEST-008：E2E 必须覆盖以下 10 条用户旅程
1. 应用启动 → 托盘图标可见
2. 托盘点击 → 覆盖层出现
3. 全局快捷键 → 覆盖层出现
4. 覆盖层中甩鞭 → crack 触发（通过 log 或事件验证）
5. 覆盖层消失后 → 托盘仍可见
6. 打开设置 → 可修改提示词
7. 保存设置 → 重启后持久化
8. 切换皮肤 → 覆盖层使用新皮肤
9. 20 次触发后 → 自动切换快速模式
10. `Shift + 快捷键` → 恢复完整动画

### R-TEST-009：E2E 环境配置
使用 `driverProvider: 'embedded'` 支持 macOS：
```javascript
// wdio.conf.ts
capabilities: [{
  'tauri:options': {
    application: '../src-tauri/target/release/openwhip',
    driverProvider: 'embedded',
  }
}]
```

## 覆盖率目标

| 模块 | 目标 |
|---|---|
| src/overlay/physics.ts | 90% |
| src/shared/config.ts | 100% |
| src/shared/ipc.ts（类型层） | 100% |
| src-tauri/src/config.rs | 85% |
| src-tauri/src/macro_sender.rs | 90% |
| 设置 UI 组件 | 80% |

覆盖率检查在 CI 中运行，低于目标时构建失败。
