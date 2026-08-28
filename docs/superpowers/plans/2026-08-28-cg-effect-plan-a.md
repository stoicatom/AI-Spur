# AISpur CG 特效 — 计划 A（基座 M0–M3）

> **For agentic workers:** 本计划由 workflow 逐任务派发 subagent 执行。每个任务包含：目标、文件、步骤（TDD：先写失败测试→跑红→实现→跑绿→提交）。subagent 必须完整执行任务内所有步骤后提交。

**Goal:** 完成 CG 特效基座：专业 3D 库接入、画质档位（config + Rust 迁移 + 设置 UI + 渲染参数化 + 自动降档）、CG 场景类型体系与注册表、样板间场景（black-hole / fireworks 两个场景建立 CG 标准）。

**Architecture:** 保留 three.js 为 3D 底层；接入 `three.quarks`（GPU 粒子）、`postprocessing`（后处理）、`cannon-es`（刚体）、`three-good-godrays`（体积光）。新增 `CgScene` / `CgStage` 类型与 `CgSceneRegistry`（packId → 场景）。新增 `quality` 配置（auto/cinematic/high/medium/low），config schema 升级 v4.0。

**Tech Stack:** TypeScript 5.9 strict / Vitest 2 / three 0.185 / three.quarks ^0.17 / postprocessing ^6.39 / cannon-es ^0.20 / three-good-godrays ^0.12 / React 18 / Zod ^3 / Rust edition 2024 / serde。

## Global Constraints（逐任务必须遵守）

- 所有代码用简体中文注释，匹配现有代码风格（见 src/overlay/three-*.ts）。
- TDD：每个任务先写失败测试 → 跑红（`pnpm vitest run <file>`）→ 实现 → 跑绿 → `pnpm typecheck` → 提交。
- 提交信息带 `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`。
- 禁止引入任何 Electron / koffi / osascript 相关包。
- 不修改 `docs/superpowers/specs/` 下的任何既有文档（新增计划文件除外）。
- 单文件 Rust ≤ 300 行，TS ≤ 250 行（超出拆文件）。
- 所有 IPC 调用走 `src/shared/ipc.ts` 类型包装，禁止裸 `invoke`。
- `three.quarks` 导入方式：`import { ParticleSystem, Emitter } from 'three.quarks'`；若实际 API 名在 `@types` 中不同，以包自带的 `.d.ts` 为准并在此任务中记录。

---

### Task A1: 接入专业 3D 库依赖与 ADR

**Files:**
- Modify: `package.json`（dependencies）
- Create: `docs/adr/2026-08-28-cg-effects-stack.md`

**Interfaces:**
- Produces: 可用 `import { ParticleSystem } from 'three.quarks'`、`import { EffectComposer, EffectPass, RenderPass, BloomEffect, GodRaysEffect, SMAAEffect, ChromaticAberrationEffect, VignetteEffect } from 'postprocessing'`、`import * as CANNON from 'cannon-es'`、`import { GodRays } from 'three-good-godrays'`。

- [ ] **Step 1: 安装依赖**

```bash
pnpm add three.quarks@^0.17 postprocessing@^6.39.4 cannon-es@^0.20 three-good-godrays@^0.12
```

预期：lockfile 更新，无 peer 冲突报错。若 three.quarks 与 three 0.185 peer 冲突，`pnpm add three.quarks@0.17 --config.confirmModulesPurge=false` 或直接用 `--no-strict-peer-dependencies` 跳过 peer 检查（记录于 ADR）。

- [ ] **Step 2: 验证可导入**

```bash
cat > /tmp/cg-smoke.ts <<'EOF'
import { ParticleSystem } from 'three.quarks';
import { EffectComposer, BloomEffect, GodRaysEffect } from 'postprocessing';
import * as CANNON from 'cannon-es';
import type { GodRays } from 'three-good-godrays';
export const smoke = [ParticleSystem, EffectComposer, BloomEffect, GodRaysEffect, CANNON.World, GodRays];
EOF
pnpm exec tsc --noEmit /tmp/cg-smoke.ts 2>&1 | head -20
```

预期：无 error（允许仅在 `three-good-godrays` 的 `GodRays` 类型导入上出 warning/error，若有则改为 `import 'three-good-godrays'` 副作用导入并在 ADR 记录）。

- [ ] **Step 3: 写 ADR**

创建 `docs/adr/2026-08-28-cg-effects-stack.md`，内容必须包含：
- 背景与决策：CG 级特效需 GPU 粒子、电影级后处理、刚体物理、体积光；选用 four 库（three.quarks / postprocessing / cannon-es / three-good-godrays）。
- 各库版本、用途、选型理由（对照 `docs/superpowers/specs/2026-08-28-material-cg-effects-design.md` §2 表格）。
- **禁止自研边界**：引擎级能力由专业库承担；逐素材"特效配方"（Stage 编排 + ShaderMaterial + GPUComputationRenderer）属于 Three.js 公开编程接口上的组合描述，不构成自研引擎。
- 兼容性备注：three@0.185 与各库版本兼容矩阵；发现问题时的替代库清单。
- 状态：Accepted，日期 2026-08-28。

- [ ] **Step 4: 校验**

```bash
pnpm typecheck && pnpm vitest run src/__tests__/config.test.ts
```

预期：通过（未改业务代码，原测试应绿）。

- [ ] **Step 5: 提交**

```bash
git add package.json pnpm-lock.yaml docs/adr/2026-08-28-cg-effects-stack.md
git commit -m "feat(cg): 接入专业3D库栈(quarks/postprocessing/cannon-es/godrays) + ADR

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task A2: 画质档位 Config 类型（TS 端）

**Files:**
- Modify: `src/shared/config.ts`
- Test: `src/__tests__/config.test.ts`（追加）

**Interfaces:**
- Consumes: `ConfigSchema`（zod，v3.0）
- Produces: `QualitySchema = z.enum(['auto','cinematic','high','medium','low'])`；`type EffectQuality`；`ConfigSchema.version` 升级为 `z.literal('4.0')`；`quality: EffectQuality`；`DEFAULT_CONFIG.quality = 'auto'`。

- [ ] **Step 1: 写失败测试**

在 `src/__tests__/config.test.ts` 追加：

```typescript
describe('v4 quality', () => {
  const base = { version: '4.0', hotkey: 'CommandOrControl+Shift+W', phrases: ['FASTER'], animationMode: 'auto', autoSwitchThreshold: 20, usageCount: 0, todayUsageCount: 0, playSound: true, showBorderFlash: true, crackSensitivity: 1, theme: 'auto', language: 'auto', firstLaunch: true, windowPresence: 'tray', activePackId: 'rocket' } as const;

  it('解析 quality=cinematic', () => {
    const cfg = ConfigSchema.parse({ ...base, quality: 'cinematic' });
    expect(cfg.quality).toBe('cinematic');
  });
  it('quality 缺省为 auto', () => {
    const cfg = ConfigSchema.parse(base);
    expect(cfg.quality).toBe('auto');
  });
  it('拒绝非法 quality', () => {
    expect(() => ConfigSchema.parse({ ...base, quality: 'ultra' })).toThrow();
  });
  it('拒绝 v3 版本', () => {
    expect(() => ConfigSchema.parse({ ...base, version: '3.0' })).toThrow();
  });
});
```

- [ ] **Step 2: 跑红**

```bash
pnpm vitest run src/__tests__/config.test.ts
```

预期：FAIL（v3 literal 不匹配 / quality 未知字段）。

- [ ] **Step 3: 实现**

修改 `src/shared/config.ts`：

```typescript
export const EffectQualitySchema = z.enum(['auto', 'cinematic', 'high', 'medium', 'low']);
export type EffectQuality = z.infer<typeof EffectQualitySchema>;
```

替换 `version: z.literal('3.0')` → `version: z.literal('4.0')`；在 `activePackId` 后加：

```typescript
  /** 特效画质档位：auto = 运行时自适应（最流畅优先）。 */
  quality: EffectQualitySchema.default('auto'),
```

`DEFAULT_CONFIG` 加 `quality: 'auto'`，`version: '4.0'`。

- [ ] **Step 4: 跑绿 + typecheck**

```bash
pnpm vitest run src/__tests__/config.test.ts && pnpm typecheck
```

预期：PASS。

- [ ] **Step 5: 提交**

```bash
git add src/shared/config.ts src/__tests__/config.test.ts
git commit -m "feat(cg): config v4.0 + quality 档位 schema

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task A3: Rust 侧 quality 迁移（v3→v4）

**Files:**
- Modify: `src-tauri/src/config.rs`
- Test: `src-tauri/src/config.rs` 内 `#[cfg(test)]` 模块（同文件测试，符合 R-TEST-003）

**Interfaces:**
- Consumes: `Config` struct，`migrate()`（v3 现为 `parse_v3` 直解析）
- Produces: `EffectQuality` enum（serde `rename_all = "lowercase"`，`Auto` 默认）；`Config.quality: EffectQuality`；`migrate()` 匹配 `"4.0" => parse_v4(raw)`、`"3.0" => migrate_v3_to_v4(raw)`。

- [ ] **Step 1: 写失败测试**

在 `src-tauri/src/config.rs` 测试模块追加：

```rust
#[test]
fn migrate_v3_adds_default_quality() {
    // v3 老配置没有 quality 键，迁移后应为 Auto。
    let raw = serde_json::json!({
        "version": "3.0",
        "hotkey": "CmdOrCtrl+W",
        "phrases": ["FASTER"],
        "animationMode": "auto",
        "autoSwitchThreshold": 20,
        "usageCount": 3,
        "todayUsageCount": 1,
        "playSound": true,
        "showBorderFlash": true,
        "crackSensitivity": 1.0,
        "theme": "auto",
        "language": "auto",
        "firstLaunch": false,
        "windowPresence": "tray",
        "activePackId": "rocket"
    });
    let cfg = migrate(raw).unwrap();
    assert_eq!(cfg.version, "3.0");
    assert_eq!(cfg.quality, EffectQuality::Auto);
}

#[test]
fn migrate_v4_keeps_quality() {
    let raw = serde_json::json!({
        "version": "4.0",
        "hotkey": "CmdOrCtrl+W",
        "phrases": ["FASTER"],
        "animationMode": "auto",
        "autoSwitchThreshold": 20,
        "usageCount": 0,
        "todayUsageCount": 0,
        "playSound": true,
        "showBorderFlash": true,
        "crackSensitivity": 1.0,
        "theme": "auto",
        "language": "auto",
        "firstLaunch": false,
        "windowPresence": "tray",
        "activePackId": "rocket",
        "quality": "cinematic"
    });
    let cfg = migrate(raw).unwrap();
    assert_eq!(cfg.quality, EffectQuality::Cinematic);
}
```

- [ ] **Step 2: 跑红**

```bash
cd src-tauri && cargo test migrate_v3_adds_default_quality migrate_v4_keeps_quality
```

预期：编译失败（EffectQuality 不存在）。

- [ ] **Step 3: 实现**

```rust
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum EffectQuality {
    Cinematic,
    High,
    Medium,
    Low,
    #[default]
    Auto,
}
```

`Config` 加字段：

```rust
    #[serde(default)]
    pub quality: EffectQuality,
```

`Default` 实现加 `quality: EffectQuality::Auto,`，`version: "4.0".to_string()`。`migrate()`：

```rust
    let parsed = match version {
        "4.0" => parse_v4(raw),
        "3.0" => migrate_v3_to_v4(raw),
        "2.0" => migrate_v2_to_v3(raw),
        _ => Err(ConfigError::UnknownVersion(version.to_string())),
    }?;
```

新增：

```rust
/// v3 → v4：新增 quality 档位，缺省 auto；其余字段原样带过。
fn migrate_v3_to_v4(raw: serde_json::Value) -> Result<Config, ConfigError> {
    let mut merged = serde_json::to_value(Config::default())
        .map_err(|e| ConfigError::ParseError(e.to_string()))?;
    if let (Some(base), Some(given)) = (merged.as_object_mut(), raw.as_object()) {
        for (key, value) in given { base.insert(key.clone(), value.clone()); }
    }
    serde_json::from_value(merged).map_err(|e| ConfigError::ParseError(e.to_string()))
}

fn parse_v4(raw: serde_json::Value) -> Result<Config, ConfigError> {
    serde_json::from_value(raw).map_err(|e| ConfigError::ParseError(e.to_string()))
}
```

- [ ] **Step 4: 跑绿 + clippy**

```bash
cd src-tauri && cargo test && cargo clippy -- -D warnings
```

预期：全绿（若 v3 旧测试断言 `version == "3.0"`，改为断言 `"4.0"`——迁移后归一化为 4.0 是正确语义，只改测试预期不动实现）。

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/config.rs
git commit -m "feat(cg): rust config v3->v4 迁移 quality 档位

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task A4: 设置 UI 画质选择器

**Files:**
- Modify: `src/settings/components/AnimationPanel.tsx`（若行数将超 250 且无设计文档，先看现有面板结构）
- Modify: `src/settings/panels.css`
- Test: `src/__tests__/settings-app.test.tsx`（追加组件测试）

**Interfaces:**
- Consumes: `Config.quality`、`EffectQualitySchema`；现有 `PanelProps { config, onPatch }`
- Produces: UI 中「特效画质」分组（auto/cinematic/high/medium/low 五选一，RadioGroup 样式），`onPatch({ quality })`。

- [ ] **Step 1: 写失败测试**

在 `src/__tests__/settings-app.test.tsx` 追加：

```typescript
it('切到动画面板可设置特效画质 cinematic', async () => {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole('tab', { name: /动画/ });
  await user.click(screen.getByRole('tab', { name: /动画/ }));
  const group = await screen.findByRole('radiogroup', { name: /特效画质/ });
  const radio = within(group).getByRole('radio', { name: /电影级/ });
  await user.click(radio);
  expect(saveConfigSpy).toHaveBeenCalledWith(expect.objectContaining({ quality: 'cinematic' }));
});
```

（沿用现有 settings 测试的 `vi.mock('../../shared/ipc')` 模式；若测试文件无 spy 结构则按现有文件中的 save mock 方式补。）

- [ ] **Step 2: 跑红 → Step 3: 实现**

在 AnimationPanel 加（组件结构沿用现有 panel 的 CSS class 命名）：

```tsx
<section className="quality-group" role="radiogroup" aria-label="特效画质">
  <h3 className="quality-group__title">特效画质</h3>
  {QUALITY_OPTIONS.map((opt) => (
    <button
      key={opt.id}
      type="button"
      role="radio"
      aria-checked={config.quality === opt.id}
      className={`quality-radio${config.quality === opt.id ? ' quality-radio--active' : ''}`}
      onClick={() => onPatch({ quality: opt.id })}
    >
      <span className="quality-radio__name">{opt.label}</span>
      <span className="quality-radio__desc">{opt.desc}</span>
    </button>
  ))}
</section>
```

`QUALITY_OPTIONS`（本文件内定义）：auto=自动（实测最流畅）/ cinematic=电影级 / high=高 / medium=中 / low=低。CSS 加到 `panels.css`（非 4 的倍数间距、非默认色，沿用现有 tokens）。

- [ ] **Step 4: 跑绿 + typecheck** → **Step 5: 提交**

```bash
pnpm vitest run src/__tests__/settings-app.test.tsx && pnpm typecheck
git add src/settings/components/AnimationPanel.tsx src/settings/panels.css src/__tests__/settings-app.test.tsx
git commit -m "feat(cg): 设置页特效画质五档选择器

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task A5: CgScene / CgStage 类型体系与场景注册表

**Files:**
- Create: `src/overlay/cg-scene.ts`（类型）
- Create: `src/overlay/cg-scene-registry.ts`（注册表）
- Test: `src/__tests__/cg-scene-registry.test.ts`

**Interfaces:**
- Consumes: `MaterialPack` 的 effect preset/palette；`FamilyContext`/`FamilyLayer` 现有接口（`three-family-shared.ts`）
- Produces:
  - `type CgSceneConfig = { packId: BuiltinPackId; title: string; elements: readonly string[]; signature: string; preset: EffectPresetId }`
  - `interface CgStageFactory { (ctx: CgStageContext): CgStage }`
  - `interface CgStage { update(t: number, now: number, quality: EffectQuality): void; dispose(): void }`
  - `registerScene(scene: CgSceneConfig, factory: CgStageFactory): void`
  - `resolveScene(packId: string): { config: CgSceneConfig; create: CgStageFactory } | null`
  - `ALL_SCENE_PACK_IDS: readonly string[]`

- [ ] **Step 1: 写失败测试**

`src/__tests__/cg-scene-registry.test.ts`：

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { registerScene, resolveScene, resetRegistry, ALL_SCENE_PACK_IDS } from '../overlay/cg-scene-registry';
import type { CgStage, CgStageContext } from '../overlay/cg-scene';

describe('cg scene registry', () => {
  beforeEach(() => resetRegistry());

  it('注册后可按 packId 解析', () => {
    registerScene({ packId: 'rocket', title: '发射升空', elements: ['主焰'], signature: '发射台消隐', preset: 'jet' }, (ctx: CgStageContext) => ({ update() {}, dispose() {} }));
    const scene = resolveScene('rocket');
    expect(scene?.config.packId).toBe('rocket');
    expect(resolveScene('bomb')).toBeNull();
  });

  it('重复注册同一 packId 抛错', () => {
    const factory = () => ({ update() {}, dispose() {} });
    registerScene({ packId: 'rocket', title: 'x', elements: [], signature: 'x', preset: 'jet' }, factory);
    expect(() => registerScene({ packId: 'rocket', title: 'y', elements: [], signature: 'y', preset: 'jet' }, factory)).toThrow(/duplicate|重复/);
  });

  it('42 个内置素材全部有注册项', () => {
    expect(ALL_SCENE_PACK_IDS.length).toBe(42);
  });
});
```

- [ ] **Step 2: 跑红** → **Step 3: 实现**（`cg-scene.ts` + `cg-scene-registry.ts`：Map<packId, {config, factory}>，`resetRegistry` 仅测试用；`ALL_SCENE_PACK_IDS` 从 `BUILTIN_PACK_IDS` derive）

- [ ] **Step 4: 跑绿**：

```bash
pnpm vitest run src/__tests__/cg-scene-registry.test.ts && pnpm typecheck
```

- [ ] **Step 5: 提交**：

```bash
git add src/overlay/cg-scene.ts src/overlay/cg-scene-registry.ts src/__tests__/cg-scene-registry.test.ts
git commit -m "feat(cg): CgScene 类型体系与 42 场景注册表

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task A5b: 生成 42 个场景桩文件 + barrel（让后续场景可并行实现）

**Files:**
- Create: `src/overlay/cg-scenes/cg-<packId>.ts` × 42（packId 取自 `BUILTIN_PACK_IDS`，连字符保留，如 `cg-black-hole.ts`、`cg-ninja-star.ts`、`cg-glass-shot.ts`、`cg-boxing-glove.ts`）
- Create: `src/overlay/cg-scenes/index.ts`（barrel：42 条 import，仅副作用导入）
- Modify: `src/overlay/cg-stage.ts`（import barrel 触发自注册）
- Test: `src/__tests__/cg-scene-coverage.test.ts`

**Interfaces:**
- Consumes: Task A5 `registerScene` / `CgStageContext` / `CgStage`
- Produces: 每个桩文件导出 `export function create<PascalId>Stage(ctx: CgStageContext): CgStage` 并在模块顶层调用 `registerScene({...}, create<PascalId>Stage)`；`index.ts` 导入全部 42 个文件。

**为何需要桩**：后续 42 个场景由并行 subagent 实现，每个 agent **只修改自己的 `cg-<packId>.ts`**，注册表与 barrel 在本任务一次性建好，避免并行写同一文件冲突。

- [ ] **Step 1: 写失败测试**

`src/__tests__/cg-scene-coverage.test.ts`：

```typescript
import { describe, it, expect } from 'vitest';
import '../overlay/cg-scenes';
import { resolveScene } from '../overlay/cg-scene-registry';
import { BUILTIN_PACK_IDS } from '../shared/material-packs';

describe('42 场景覆盖', () => {
  it('每个内置素材都有独立场景注册项', () => {
    const missing = BUILTIN_PACK_IDS.filter((id) => resolveScene(id) === null);
    expect(missing).toEqual([]);
  });

  it('场景工厂互不相同（同 preset 素材场景独立）', () => {
    const factories = BUILTIN_PACK_IDS.map((id) => resolveScene(id)?.create);
    expect(new Set(factories).size).toBe(BUILTIN_PACK_IDS.length);
  });

  it('每个场景声明了非空元素清单与独立签名', () => {
    for (const id of BUILTIN_PACK_IDS) {
      const scene = resolveScene(id);
      expect(scene, id).not.toBeNull();
      expect(scene!.config.signature.length, id).toBeGreaterThan(0);
      expect(scene!.config.elements.length, id).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: 跑红**

```bash
pnpm vitest run src/__tests__/cg-scene-coverage.test.ts
```

预期：FAIL（cg-scenes 目录不存在）。

- [ ] **Step 3: 实现**

每个桩文件（以 `cg-rocket.ts` 为例，其余 41 个同构，`title`/`elements`/`signature`/`preset` 取自 `docs/superpowers/specs/2026-08-28-material-cg-effects-design.md` §4.2 对应场景）：

```typescript
/** 场景 01 rocket（jet · 发射升空）—— CG 场景实现见 Task B。 */
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';

export function createRocketStage(_ctx: CgStageContext): CgStage {
  // 桩实现：Task B 中替换为完整 CG 场景（元素清单见 config.elements）。
  return { update() {}, dispose() {} };
}

registerScene(
  {
    packId: 'rocket',
    title: '发射升空',
    elements: ['引擎主焰', '尾烟两侧', '发射台结构', '音爆环', '燃料碎屑', '地平线光带', '背景星点', '二级点火亮斑'],
    signature: '唯一自下而上发射构图；发射台消隐',
    preset: 'jet',
  },
  createRocketStage,
);
```

`index.ts`：

```typescript
/** 42 个内置素材的 CG 场景：副作用导入触发自注册。 */
import './cg-rocket';
import './cg-phoenix';
// …（共 42 条，顺序按 BUILTIN_PACK_IDS）
```

`cg-stage.ts` 顶部加 `import './cg-scenes';`。

- [ ] **Step 4: 跑绿**

```bash
pnpm vitest run src/__tests__/cg-scene-coverage.test.ts src/__tests__/cg-scene-registry.test.ts && pnpm typecheck
```

预期：PASS（42 场景全部注册，工厂互不相同）。

- [ ] **Step 5: 提交**

```bash
git add src/overlay/cg-scenes src/overlay/cg-stage.ts src/__tests__/cg-scene-coverage.test.ts
git commit -m "feat(cg): 42 场景桩文件与自注册 barrel

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task A6: CgStage 基座 + ThreeEffectRenderer 接入（fallback 保功能）

**Files:**
- Modify: `src/overlay/three-effects.ts`
- Modify: `src/overlay/three-effect-host.ts`
- Modify: `src/overlay/three-effect-layers.ts`
- Create: `src/overlay/cg-stage.ts`（阶段基座：quality 解析 + 创建骨架）
- Test: `src/__tests__/three-effect-lifecycle.test.ts`（追加）

**Interfaces:**
- Consumes: Task A5 的 `resolveScene`；`EffectQuality`
- Produces:
  - `interface CgStageContext { root: THREE.Group; origin: THREE.Vector3; color: THREE.Color; energy: number; direction: THREE.Vector2; width: number; height: number; quality: EffectQuality; params: Record<string, number>; now: number }`
  - `createCgStage(packId, ctx): CgStage | null`（注册表 null → null，保持 legacy fallback）
  - `ThreeEffectRenderer.start()`：若 `resolveScene(spec.packId)` 命中且 quality != 'low' → 创建 CgStage 并 update；否则走现有 CinematicLayers。**low 档永远走 legacy（防画质阉割/兼容性风险）**。
  - `ThreeEffectHost` 增加 `setQuality(q)` 并把 quality 传给 renderer。

- [ ] **Step 1: 写失败测试**（`three-effect-lifecycle.test.ts` 追加）：

```typescript
it('quality=low 时 CgStage 不启用（legacy fallback）', () => {
  // mock resolveScene 返回一个计数工厂；renderer.start({...quality:'low'})
  // 断言 factory 未被调用。
});
```

- [ ] **Step 2: 跑红** → **Step 3: 实现**（字段 `quality`，`start()` 分支，`three-effect-host.ts` 加 `setQuality`；`three-effect-layers.ts` 的 `CinematicLayers` 不变，作为 legacy）

- [ ] **Step 4: 跑绿 + 全量**：

```bash
pnpm vitest run src/__tests__/three-effect-lifecycle.test.ts src/__tests__/overlay-render-loop.test.ts && pnpm typecheck
```

- [ ] **Step 5: 提交**：

```bash
git add src/overlay/cg-stage.ts src/overlay/three-effects.ts src/overlay/three-effect-host.ts src/overlay/three-effect-layers.ts src/__tests__/three-effect-lifecycle.test.ts
git commit -m "feat(cg): CgStage 基座接入 renderer，low 档与未注册素材保持 legacy

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task A7: 质量档位渲染参数化（pixelRatio/后处理/自动降档）

**Files:**
- Modify: `src/overlay/three-render-pipeline.ts`（按档位装配 pass）
- Modify: `src/overlay/canvas-pixel-budget.ts`（`pixelRatioFor` 增加 `quality` 参数）
- Create: `src/overlay/quality-tier.ts`（档位 → 参数解析 + 自动降档控制器，纯函数便于测试）
- Test: `src/__tests__/quality-tier.test.ts`

**Interfaces:**
- Consumes: `EffectQuality`
- Produces:
  - `type QualityTier = { particleScale: number; pixelRatioCap: number; bloom: boolean; godRays: boolean; ssao: boolean; croma: boolean; grain: boolean; physicsBodies: number; resolutionScale: number }`
  - `qualityTierFor(q: EffectQuality): QualityTier`
  - `const QUALITY_ORDER: EffectQuality[]`（低→高）
  - `class AdaptiveQuality { constructor(baselineMs: number); sample(it: { frameMs: number; … }): EffectQuality; current(): EffectQuality; dispose(): void }`（30 帧窗口；> 基准×1.6 连续 2 窗 → 降；< 基准×0.7 连续 6 窗 → 升）

- [ ] **Step 1: 写失败测试**（`quality-tier.test.ts`）：`qualityTierFor` 各档字段断言（cinematic.particleScale=1, low.pixelRatioCap=1.25 …）；`AdaptiveQuality`：注入 30 帧 40ms + 2 窗 → current() 从 high 降到 medium；6 窗 5ms → 升回。

- [ ] **Step 2: 跑红** → **Step 3: 实现** → **Step 4: 跑绿**：

```bash
pnpm vitest run src/__tests__/quality-tier.test.ts src/__tests__/three-effect-physics.test.ts && pnpm typecheck
```

- [ ] **Step 5: 提交**。

---

### Task A8: 样板间场景 01 black-hole（单一素材专属 CgStage）

**Files:**
- Create: `src/overlay/cg-scenes/cg-black-hole.ts`（元素：视界球 + 光子环 shader + quarks 吸积盘双涡 + cannon 轨道碎片 + GodRays 透镜 + 星场 shader；三幕：0–450 稳定 / 450–1450 吞噬 / 1450–1850 白炽）
- Modify: `src/overlay/cg-scene-registry.ts`（注册 black-hole）
- Test: `src/__tests__/cg-black-hole.test.ts`

**Interfaces:**
- Consumes: Task A6 `CgStage`；Task A5 `registerScene`
- Produces: `export function createBlackHoleStage(ctx: CgStageContext): CgStage`（注册到 registry）

- [ ] **Step 1: 写失败测试**（验证 create 返回对象有 `update` `dispose`；验证注册表 `resolveScene('black-hole').config.signature` = '吞噬+回弹'）
- [ ] **Step 2: 跑红 → Step 3: 实现**（用 three.quarks `ParticleSystem` + `Emitter` 声明两个吸积盘 emitter；cannon `World` 只建物体不加 step 全量模拟，改用参数化轨道 + 少量刚体；shader 用 ShaderMaterial）
- [ ] **Step 4: 跑绿 + typecheck** → **Step 5: 提交**。

---

### Task A9: 样板间场景 41 fireworks（第二个 CgStage）

**Files:**
- Create: `src/overlay/cg-scenes/cg-fireworks.ts`
- Modify: `src/overlay/cg-scene-registry.ts`
- Test: `src/__tests__/cg-fireworks.test.ts`

**Interfaces:** 同 A8 模式；注册 fireworks。

- [ ] **Step 1: 写失败测试** → **Step 2: 跑红** → **Step 3: 实现**（升空拖尾 emitter + 三形态爆珠 quarks + 残珠雨 + 烟环 + 夜景 shader + 倒影）
- [ ] **Step 4: 跑绿** → **Step 5: 提交**。

---

### Task A10: 视觉验收页（内网 Artifact 预览）

**Files:**
- Create: `tools/cg-preview/index.html`（可 `pnpm vite dev` 挂载 `tools/cg-preview` 预览 42 场景：select 切换 packId → 调用 `three.start()` 复现）
- 验证：`pnpm build` + `pnpm tauri dev` 手动触发 black-hole / fireworks 两个素材，目视达标。

**验收标准（M3 门禁）**：black-hole 完整呈现：视界球、吸积盘旋转、吞噬流向（向内螺旋）、喷流、透镜光弧；fireworks 完整呈现：升空→爆开（多形态）→残珠雨；两素材均在电影级档 ≥ 可感知流畅（无卡死）。

---

### 里程碑 M0–M3 完成判定

- [ ] 四库已接入 + ADR 提交
- [ ] quality 配置 TS/Rust 双侧 + 设置 UI 可选
- [ ] 42 场景注册表测试绿
- [ ] CgStage 基座 + legacy fallback 保持（low 档与未注册素材不崩）
- [ ] black-hole / fireworks 两场景可运行
- [ ] `pnpm ci`（typecheck + vitest + cargo clippy -D warnings + cargo test）全绿
