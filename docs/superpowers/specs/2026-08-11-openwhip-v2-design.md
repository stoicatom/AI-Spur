# OpenWhip v2 — 完整设计规格

**文档版本：** 1.0  
**日期：** 2026-08-11  
**状态：** 已批准，可执行  
**约束优先级：** CLAUDE.md > 本文档 > 规则文件

---

## 一、产品需求

### 1.1 功能需求（FR）

| ID | 需求 | 验收标准 |
|---|---|---|
| FR-01 | 全局快捷键触发 | 默认 `Cmd+Shift+W`（macOS）/ `Ctrl+Shift+W`（Win/Linux），可自定义，支持录制 |
| FR-02 | 托盘图标触发（保留） | 点击托盘图标触发覆盖层，行为与快捷键一致 |
| FR-03 | 双轨动画模式 | 前 20 次：完整动画；20 次后：自动切换快速模式 |
| FR-04 | `Shift + 快捷键` 彩蛋 | 任何时候 Shift+快捷键 → 强制完整动画 |
| FR-05 | 自定义提示词 | 支持增删改提示词列表，随机选择发送 |
| FR-06 | 皮肤系统 | 内置 4 套皮肤（default/fire/electric/neon），支持用户自定义皮肤 |
| FR-07 | 快速模式动画 | 小鞭子图标飞入角落，自动 crack，碎裂消失 |
| FR-08 | 首次启动引导 | 3 步引导：快捷键设置 → 提示词选择 → 操作说明 |
| FR-09 | 设置窗口 | 可修改所有配置项，实时保存，重启后持久化 |
| FR-10 | 快捷键冲突检测 | 注册失败时提供 2 个推荐替代方案 |
| FR-11 | 使用统计展示 | 设置页面展示：总次数、今日次数 |
| FR-12 | 输入合成跨平台 | macOS/Windows/Linux 三平台统一行为（enigo） |

### 1.2 非功能需求（NFR）

详见 CLAUDE.md §六，性能预算为硬性约束。

---

## 二、架构概览

```
┌─────────────────────────────────────────────────────┐
│                  Tauri v2 主进程（Rust）               │
│                                                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ │
│  │ config.rs│ │ tray.rs  │ │shortcut.rs│ │skins.rs│ │
│  └──────────┘ └──────────┘ └──────────┘ └────────┘ │
│                     ↑ IPC Commands / Events ↓        │
│  ┌───────────────────────────────────────────────┐   │
│  │            macro_sender.rs (enigo)             │   │
│  └───────────────────────────────────────────────┘   │
└──────────────┬────────────────────┬─────────────────┘
               │ IPC                │ IPC
   ┌───────────▼──────┐  ┌──────────▼──────────┐
   │  overlay 窗口     │  │   settings 窗口      │
   │  (physics.ts)    │  │   (App.tsx)          │
   │  (renderer.ts)   │  │   (components/)      │
   │  (skins.ts)      │  │                      │
   └──────────────────┘  └─────────────────────┘
```

---

## 三、配置 Schema

### 3.1 TypeScript 端（Zod）

```typescript
// src/shared/config.ts
import { z } from 'zod';

export const AnimationModeSchema = z.enum(['standard', 'fast', 'auto']);
export type AnimationMode = z.infer<typeof AnimationModeSchema>;

export const ConfigSchema = z.object({
  version: z.literal('2.0'),
  hotkey: z.string().min(1).default('CommandOrControl+Shift+W'),
  phrases: z.array(z.string().min(1)).min(1).max(20).default([
    'FASTER', 'KEEP GOING', "DON'T STOP NOW", 'SHOW ME WHAT YOU GOT',
  ]),
  activeSkin: z.string().default('default'),
  animationMode: AnimationModeSchema.default('auto'),
  autoSwitchThreshold: z.number().int().min(1).max(100).default(20),
  usageCount: z.number().int().min(0).default(0),
  todayUsageCount: z.number().int().min(0).default(0),
  lastUsageDate: z.string().date().optional(),
  playSound: z.boolean().default(true),
  showBorderFlash: z.boolean().default(true),
  firstLaunch: z.boolean().default(true),
});

export type Config = z.infer<typeof ConfigSchema>;
```

### 3.2 Rust 端（serde）

```rust
// src-tauri/src/config.rs
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub version: String,           // "2.0"
    pub hotkey: String,
    pub phrases: Vec<String>,
    pub active_skin: String,
    pub animation_mode: AnimationMode,
    pub auto_switch_threshold: u32,
    pub usage_count: u32,
    pub today_usage_count: u32,
    pub last_usage_date: Option<String>,
    pub play_sound: bool,
    pub show_border_flash: bool,
    pub first_launch: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AnimationMode { Standard, Fast, Auto }
```

---

## 四、IPC 完整契约

### 4.1 Commands（TS 调用 Rust）

```typescript
// src/shared/ipc.ts — 完整接口列表

// 配置
getConfig(): Promise<Config>
saveConfig(config: Config): Promise<void>

// 快捷键
registerHotkey(hotkey: string): Promise<Result<void, AppError>>
checkHotkeyConflict(hotkey: string): Promise<ConflictInfo | null>
unregisterHotkey(): Promise<void>

// 宏触发
triggerMacro(phrase?: string): Promise<void>  // 直接触发，绕过动画
incrementUsage(): Promise<number>              // 使用次数+1，返回新值

// 皮肤
listSkins(): Promise<SkinManifest[]>
activateSkin(skinId: string): Promise<void>

// 窗口
openSettings(): Promise<void>
```

### 4.2 Events（Rust 发往 WebView）

```typescript
// 目标 overlay 窗口
'spawn-whip'    payload: void           // 触发完整动画
'drop-whip'     payload: void           // 鞭子下落退出
'mode-changed'  payload: AnimationMode  // 动画模式切换

// 目标 settings 窗口  
'config-updated' payload: Partial<Config>
```

---

## 五、物理引擎规格

### 5.1 物理参数（继承并冻结 v1 默认值）

```typescript
// src/overlay/physics.ts
export interface PhysicsParams {
  segments: number;        // 28
  segmentLength: number;   // 25px
  taper: number;           // 0.6
  gravity: number;         // 1.2
  dropGravity: number;     // 0.95
  damping: number;         // 0.96
  constraintIters: number; // 20
  maxStretchRatio: number; // 1.2
  crackSpeed: number;      // 340 px/frame
  crackCooldownMs: number; // 200
  firstCrackGraceMs: number; // 350
}
```

### 5.2 纯函数接口

```typescript
export interface WhipState {
  pts: Array<{ x: number; y: number; px: number; py: number }>;
  dropping: boolean;
  lastCrackTime: number;
  spawnTime: number;
  handleAngle: number;
  handleAngVel: number;
}

// 主步进函数（纯函数，返回新状态 + 是否 crack）
export function physicsStep(
  state: WhipState,
  input: { mouseX: number; mouseY: number; dt: number },
  params: PhysicsParams
): { nextState: WhipState; crackTriggered: boolean }

// 创建初始状态
export function createWhipState(
  mouseX: number,
  mouseY: number,
  params: PhysicsParams
): WhipState
```

---

## 六、皮肤系统规格

### 6.1 皮肤 Manifest Schema

```typescript
// src/shared/config.ts
export const SkinManifestSchema = z.object({
  specVersion: z.literal('1'),
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(40),
  description: z.string().max(100).optional(),
  author: z.string().optional(),
  visuals: z.object({
    handleColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    bodyGradient: z.tuple([
      z.string().regex(/^#[0-9a-fA-F]{6}$/),
      z.string().regex(/^#[0-9a-fA-F]{6}$/),
    ]),
    tipGlow: z.boolean().default(false),
    particleEffect: z.enum(['none', 'sparks', 'stars', 'lightning']).default('none'),
    outlineColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#ffffff'),
    bgAlpha: z.number().min(0).max(0.1).default(0.011),
  }),
  sounds: z.object({
    crack: z.array(z.string()).min(1).max(10),
    whoosh: z.array(z.string()).max(5).default([]),
  }),
});

export type SkinManifest = z.infer<typeof SkinManifestSchema>;
```

### 6.2 内置皮肤定义

| ID | 名称 | 颜色方案 | 粒子效果 |
|---|---|---|---|
| `default` | Classic | `#111111` → `#333333` | none |
| `fire` | Fire Whip | `#FF4400` → `#FF8C00` | sparks |
| `electric` | Electric | `#00AAFF` → `#0044FF` | lightning |
| `neon` | Neon | `#FF00FF` → `#00FFFF` | stars |

### 6.3 皮肤加载路径
- 内置皮肤：Tauri asset scope 内的 `skins/` 目录
- 用户皮肤：`app_data_dir()/skins/<id>/`
- manifest 必须通过 `SkinManifestSchema.parse()` 验证才使用

---

## 七、UI 设计规格

**⚠️ 重要：所有 UI 实现前必须先调用 `/frontend-design` skill，详见 `.claude/rules/ui-design.md`。**

### 7.1 设计约束

- **禁止 AI 味**：不使用 `bg-gray-50`、`rounded-lg`、`px-4 py-2` 等默认 Tailwind 样式
- **品牌色**：基于 OpenWhip 产品定位（趣味 + 效率）推导活力色系
- **暗色模式**：独立设计，不是简单反转
- **动效**：所有过渡使用自定义贝塞尔曲线（如 `cubic-bezier(0.34, 1.56, 0.64, 1)`）
- **字重**：标题 `650`，正文 `400`，次要 `350`

### 7.2 首次启动引导（3 步）

**步骤 1/3：快捷键设置**
```
┌──────────────────────────────────────────┐
│        🎉 欢迎使用 OpenWhip v2！          │
│  ──────────────────────────────────────  │
│     有时候 Claude Code 太慢了...          │
│                                          │
│  设置全局快捷键：                          │
│  ┌──────────────────────┐                │
│  │  按下你的快捷键组合...  │  [录制中 ●]  │
│  └──────────────────────┘                │
│  推荐：Ctrl+Shift+W / Cmd+Shift+W         │
│  ⚠ 冲突时显示提示 + 推荐替代方案           │
│                                          │
│  [ 跳过 ]               [ 下一步 → ]     │
└──────────────────────────────────────────┘
```

**步骤 2/3：提示词**
```
选择默认提示词（可随时修改）：
[✓] FASTER          [✓] KEEP GOING
[✓] DON'T STOP NOW  [ ] 自定义...
```

**步骤 3/3：皮肤选择 + 说明**
```
选择初始皮肤：[default ▼]  [预览]
1. 按快捷键召唤鞭子
2. 快速移动鼠标挥动鞭子（或等待自动 crack）
3. 自动发送中断 + 提示词
💡 20 次后自动切换快速模式
```

### 7.3 设置窗口布局

**视觉要求（通过 frontend-design 实现）：**
- 侧边导航宽度 `200px`，使用毛玻璃背景（`backdrop-filter: blur(20px)`）
- 导航项分组（"配置" / "外观"），组标签使用小号大写字母（`text-transform: uppercase; letter-spacing: 0.08em`）
- 活跃导航项使用品牌色背景 + 白色文字，非活跃项 hover 时半透明背景
- 内容面板切换使用 Framer Motion，`x: 10 → 0` 滑入动画
- 所有输入框 focus 时显示品牌色描边 + 3px 外扩阴影

```
┌───────────────────────────────────────────────┐
│  OpenWhip 设置                       [×]      │
├─────────────┬─────────────────────────────────┤
│  配置        │                                 │
│  🎯 触发     │                                 │
│  💬 提示词   │  [内容区域，按左侧导航切换]        │
│  ──────────│                                 │
│  外观        │                                 │
│  🎨 皮肤    │                                 │
│  ⚙️  动画    │                                 │
│  🔊 音效    │                                 │
│  ──────────│                                 │
│  📊 统计    │                                 │
└─────────────┴─────────────────────────────────┘
```

### 7.4 快捷键录制组件

**视觉要求：**
- 未录制状态：虚线边框（`border: 2px dashed`），提示"点击录制"
- 录制中状态：实线边框 + 品牌色 + 脉冲动画（`@keyframes pulse`）
- 已录制状态：显示快捷键组合，右侧显示"重新录制"按钮
- 录制指示器：8px 圆点，闪烁动画（`@keyframes blink`）

### 7.5 动画模式选择

```
⚪ 标准模式（完整动画，每次都展示，推荐新用户）
⚫ 快速模式（角落小动画，高效）
⚪ 自动切换（前 N 次标准，之后快速）★ 推荐
   使用次数阈值：[20 ↕]
💡 提示：任何模式下按住 Shift + 快捷键恢复完整动画
```

---

## 八、测试规格（可执行）

### 8.1 E2E 用户旅程（10 条）

```typescript
// tests/e2e/journeys.test.ts

describe('J01: 应用启动', () => {
  it('启动后 500ms 内托盘图标可见', async () => { ... });
});

describe('J02: 托盘触发', () => {
  it('点击托盘 → 覆盖层窗口出现', async () => { ... });
  it('再次点击 → 覆盖层消失', async () => { ... });
});

describe('J03: 快捷键触发', () => {
  it('Ctrl+Shift+W → 覆盖层出现（< 150ms）', async () => { ... });
});

describe('J04: Crack 触发', () => {
  it('高速鼠标移动 → trigger_macro 被调用', async () => { ... });
});

describe('J05: 设置持久化', () => {
  it('修改提示词 → 保存 → 重启 → 提示词仍在', async () => { ... });
});

describe('J06: 皮肤切换', () => {
  it('切换皮肤 → 下次 spawn-whip 使用新皮肤颜色', async () => { ... });
});

describe('J07: 快速模式自动切换', () => {
  it('触发 20 次后动画模式变为 fast', async () => { ... });
});

describe('J08: Shift 彩蛋', () => {
  it('快速模式下 Shift+快捷键 → 完整动画展示', async () => { ... });
});

describe('J09: 首次启动引导', () => {
  it('首次启动弹出引导窗口', async () => { ... });
  it('引导完成后 firstLaunch = false', async () => { ... });
});

describe('J10: 跨平台键盘输入', () => {
  it('trigger_macro 发送 Ctrl+C + text + Enter', async () => { ... });
});
```

---

## 九、实施路线图

### Phase 1：架构迁移（Electron → Tauri）
1. 初始化 Tauri v2 项目（`cargo tauri init`）
2. 迁移 overlay.html 物理引擎到 `src/overlay/physics.ts`（纯函数化）
3. 实现 `macro_sender.rs`（enigo，Trait 抽象）
4. 实现 `config.rs`（含 v1→v2 迁移）
5. 实现基础 IPC 命令（get/save config，trigger_macro）
6. 基础单元测试覆盖

### Phase 2：快捷键 + 双模式
1. `shortcut.rs`：注册、冲突检测、Shift 修饰键检测
2. 快速模式动画（角落小鞭子）
3. 使用次数追踪 + 自动模式切换
4. 完整单元 + 集成测试

### Phase 3：皮肤系统
1. 皮肤 manifest schema + 加载器
2. 4 套内置皮肤资产
3. 渲染器接受 SkinConfig 参数
4. 皮肤切换 IPC + 事件
5. 皮肤相关测试

### Phase 4：设置 UI + 引导
1. 设置窗口框架（侧边导航）
2. 各设置面板组件
3. 首次启动引导（3 步）
4. 快捷键录制组件
5. 组件测试全覆盖

### Phase 5：E2E + 打包优化
1. WebdriverIO 配置（embedded provider）
2. 10 条 E2E 用户旅程
3. 性能测试 + 优化
4. CI 流水线（GitHub Actions）
5. 各平台构建验证
