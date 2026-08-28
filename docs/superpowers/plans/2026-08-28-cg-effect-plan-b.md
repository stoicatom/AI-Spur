# AISpur CG 特效 — 计划 B（42 场景量产 M4–M7）

> **For agentic workers:** 本计划由 workflow 并行派发：每个场景一个 subagent，**只修改自己的 `src/overlay/cg-scenes/cg-<packId>.ts` 与自己的测试文件**，不改注册表、不改 barrel、不改其它场景文件（防并行冲突）。

**Goal:** 把 42 个场景桩（计划 A Task A5b 建立）逐个实现为完整 CG 场景：每个场景独立、元素丰富、多元素互动、三幕编排、全屏覆盖、独立签名。

**Architecture:** 每场景一个 `create<PascalId>Stage(ctx: CgStageContext): CgStage`。粒子层用 `three.quarks`，刚体用 `cannon-es`，环境场用 `THREE.ShaderMaterial`，结构件用程序化 `THREE.Mesh`，体积光用 `postprocessing` 的 GodRaysEffect（由 CgStage 基座按档位统一装配，场景只声明"需要体积光的光源 mesh"）。

**Tech Stack:** three 0.185 / three.quarks / cannon-es / postprocessing / TypeScript strict / Vitest。

## Global Constraints（逐场景必须遵守）

- **场景规格来源**：`docs/superpowers/specs/2026-08-28-material-cg-effects-design.md` §4.2 中与本场景 packId 对应的小节（场景概念/元素清单/多元素互动/三幕编排/全屏覆盖/独立签名）。实现必须逐条覆盖该小节列出的**全部元素**与**全部互动**。
- **独立性**：不得 import 其它 `cg-scenes/cg-*.ts`；不得复制粘贴其它场景的主体结构。可复用 `src/overlay/cg-scene-kit.ts`（若不存在则本任务可创建通用工厂：emitter 工厂、噪声纹理、beam 放置、刚体世界——**工具函数可共享，成品场景不可共享**）。
- **物理参数**：从 `materialIdentityFor(packId, preset, params)`（`src/overlay/material-identity.ts`）取 surface/force/mass/restitution/friction/drag/gravity/resonance/stiffness 驱动运动，不要硬编码魔法数。
- **时长**：用 `effectDurationFor(preset)`（`src/overlay/effect-timings.ts`）作为总时长；三幕按设计文档给出的毫秒比例映射到 `t ∈ [0,1]`。
- **资源生命周期**：`dispose()` 必须释放本场景创建的全部 geometry / material / texture / quarks system / cannon body；不得泄漏（现有 `disposeSceneResources` 可复用）。
- **档位**：`update(t, now, quality)` 中按 `qualityTierFor(quality).particleScale` 缩放粒子数与 emitter 数；`physicsBodies` 上限约束刚体数量。
- **TDD**：先写失败测试 → 跑红 → 实现 → 跑绿 → typecheck → 提交。
- 单文件 ≤ 250 行；超出时把本场景的 shader 字符串或子层拆到 `cg-scenes/<packId>-<part>.ts`（仍只属于本场景）。
- 提交信息带 `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`。

## 每场景任务模板（42 个任务共用此结构，规格逐场景不同）

**Files:**
- Modify: `src/overlay/cg-scenes/cg-<packId>.ts`
- Create（可选）: `src/overlay/cg-scenes/<packId>-<part>.ts`（超行数时拆分）
- Test: `src/__tests__/cg-scene-<packId>.test.ts`

**Interfaces:**
- Consumes: `CgStageContext`（`{ root, origin, color, energy, direction, width, height, quality, params, now }`）、`CgStage`（`{ update(t, now, quality), dispose() }`）、`registerScene`（已在桩文件调用，**不要重复注册**）、`qualityTierFor`、`materialIdentityFor`、`effectDurationFor`
- Produces: 完整实现的 `create<PascalId>Stage`；`registerScene` 的 `elements` 清单与实现中的实际元素**一致**（测试会断言）

- [ ] **Step 1: 读规格**

读 `docs/superpowers/specs/2026-08-28-material-cg-effects-design.md`，定位 `#### 场景 NN <packId>` 小节，抄出：元素清单（①②③…）、多元素互动、三幕毫秒、全屏覆盖、独立签名。

- [ ] **Step 2: 写失败测试**

`src/__tests__/cg-scene-<packId>.test.ts`（示例以 bomb 为准，其它场景把断言换成本场景元素名与幕次行为）：

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import '../overlay/cg-scenes';
import { resolveScene } from '../overlay/cg-scene-registry';
import type { CgStageContext } from '../overlay/cg-scene';

function makeCtx(overrides: Partial<CgStageContext> = {}): CgStageContext {
  return {
    root: new THREE.Group(),
    origin: new THREE.Vector3(0, 0, 0),
    color: new THREE.Color('#ff5500'),
    energy: 1.2,
    direction: new THREE.Vector2(1, 0),
    width: 1920,
    height: 1080,
    quality: 'cinematic',
    params: {},
    now: 0,
    ...overrides,
  };
}

describe('cg scene bomb', () => {
  it('创建后向 root 挂载了全部声明元素层', () => {
    const scene = resolveScene('bomb');
    expect(scene).not.toBeNull();
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    // 元素数 ≥ 设计文档声明的元素条目数
    expect(ctx.root.children.length).toBeGreaterThanOrEqual(scene!.config.elements.length - 2);
    stage.dispose();
  });

  it('三幕推进改变场景状态（t=0.1 / 0.5 / 0.95 各不相同）', () => {
    const scene = resolveScene('bomb')!;
    const ctx = makeCtx();
    const stage = scene.create(ctx);
    const snap = (t: number) => {
      stage.update(t, t * 1200, 'cinematic');
      return JSON.stringify(ctx.root.children.map((c) => [c.position.toArray(), c.scale.toArray()]));
    };
    const a = snap(0.1); const b = snap(0.5); const c = snap(0.95);
    expect(a).not.toBe(b);
    expect(b).not.toBe(c);
    stage.dispose();
  });

  it('dispose 释放资源不留 children', () => {
    const scene = resolveScene('bomb')!;
    const ctx = makeCtx();
    const stage = scene.create(ctx);
    stage.dispose();
    expect(ctx.root.children.length).toBe(0);
  });

  it('低档位缩减粒子规模', () => {
    const scene = resolveScene('bomb')!;
    const hi = makeCtx({ quality: 'cinematic' });
    const lo = makeCtx({ quality: 'medium' });
    const a = scene.create(hi); const b = scene.create(lo);
    a.update(0.5, 600, 'cinematic'); b.update(0.5, 600, 'medium');
    // 粒子层实例数：cinematic ≥ medium
    const count = (g: THREE.Group) => g.children.reduce((n, c) => n + ((c as THREE.InstancedMesh).count ?? 0), 0);
    expect(count(hi.root)).toBeGreaterThanOrEqual(count(lo.root));
    a.dispose(); b.dispose();
  });
});
```

- [ ] **Step 3: 跑红**

```bash
pnpm vitest run src/__tests__/cg-scene-<packId>.test.ts
```

预期：FAIL（桩场景只返回空 update/dispose，元素数为 0）。

- [ ] **Step 4: 实现场景**

按规格逐元素实现。结构模板（以"元素→层"一一对应）：

```typescript
export function createBombStage(ctx: CgStageContext): CgStage {
  const identity = materialIdentityFor('bomb', 'explode', ctx.params);
  const tier = qualityTierFor(ctx.quality);
  const group = new THREE.Group();
  ctx.root.add(group);

  // ① 引信火花（quarks emitter）
  // ② 火球（quarks 火焰球 + ShaderMaterial 卷动）
  // ③ 冲击波球环（透明环 mesh，急速扩张）
  // ④ 浓烟蘑菇云（quarks 灰烟，上升+膨胀）
  // ⑤ 碎片（cannon 刚体弹射，数量 ≤ tier.physicsBodies）
  // ⑥ 全屏闪光（正交平面 + additive）
  // ⑦ 压力变形（屏幕边缘扭曲 shader）
  // ⑧ 灰烬雨（下落细尘）
  // ⑨ 地面焦圈（贴地焦痕环）
  // …每个元素一个变量，全部 add 到 group

  return {
    update(t, now, quality) {
      // 三幕：0–300ms 引信 / 300–750ms 四层同爆 / 750–1200ms 蘑菇云+灰烬
      // 互动：冲击波赶上火球压扁它；碎片穿烟留烟隙；灰烬自蘑菇顶落下
    },
    dispose() {
      // 释放 geometry/material/texture/quarks/cannon，group.clear()，ctx.root.remove(group)
    },
  };
}
```

- [ ] **Step 5: 跑绿 + typecheck**

```bash
pnpm vitest run src/__tests__/cg-scene-<packId>.test.ts && pnpm typecheck
```

- [ ] **Step 6: 提交**

```bash
git add src/overlay/cg-scenes/cg-<packId>.ts src/__tests__/cg-scene-<packId>.test.ts
git commit -m "feat(cg): 场景 NN <packId> 完整 CG 实现

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## 42 个场景任务清单（每行 = 一个 subagent 任务）

| # | packId | preset | 时长 | 规格小节 |
|---|---|---|---|---|
| B01 | rocket | jet | 1200 | 场景 01 |
| B02 | phoenix | rise | 1200 | 场景 02 |
| B03 | lightning | bolt | 1200 | 场景 03 |
| B04 | dragon | wave | 1200 | 场景 04 |
| B05 | ninja-star | orbit | 1200 | 场景 05 |
| B06 | katana | dash | 1200 | 场景 06 |
| B07 | crystal | shatter | 1200 | 场景 07 |
| B08 | skull | burst | 1200 | 场景 08 |
| B09 | flame | flame-rise | 1200 | 场景 09 |
| B10 | ice | shatter-ice | 1200 | 场景 10 |
| B11 | thunder | shock-ring | 1200 | 场景 11 |
| B12 | water | water-splash | 1200 | 场景 12 |
| B13 | wind | whirl | 1200 | 场景 13 |
| B14 | star | star-burst | 1200 | 场景 14 |
| B15 | moon | arc | 1200 | 场景 15 |
| B16 | sun | glow | 1200 | 场景 16 |
| B17 | meteor | comet | 1200 | 场景 17 |
| B18 | comet | trail-burst | 1200 | 场景 18 |
| B19 | guitar | pulse | 1200 | 场景 19 |
| B20 | drum | drum-beat | 1450 | 场景 20 |
| B21 | bell | echo | 1200 | 场景 21 |
| B22 | harp | petal | 1200 | 场景 22 |
| B23 | trumpet | ring | 1200 | 场景 23 |
| B24 | bow | dash | 1200 | 场景 24 |
| B25 | shield | impact | 1200 | 场景 25 |
| B26 | axe | impact | 1200 | 场景 26 |
| B27 | spear | dash | 1200 | 场景 27 |
| B28 | bomb | explode | 1200 | 场景 28 |
| B29 | lotus | petal | 1200 | 场景 29 |
| B30 | aurora | wave | 1200 | 场景 30 |
| B31 | tornado | tornado | 1800 | 场景 31 |
| B32 | downpour | downpour | 1900 | 场景 32 |
| B33 | wildfire | wildfire | 1750 | 场景 33 |
| B34 | revolver | gunshot | 720 | 场景 34 |
| B35 | glass-shot | glass-break | 1550 | 场景 35 |
| B36 | boxing-glove | boxing | 850 | 场景 36 |
| B37 | bullwhip | whip-crack | 1100 | 场景 37 |
| B38 | piano | note-dance | 1800 | 场景 38 |
| B39 | saxophone | note-dance | 1800 | 场景 39 |
| B40 | vinyl | groove | 1900 | 场景 40 |
| B41 | fireworks | fireworks | 1950 | 场景 41 |
| B42 | black-hole | singularity | 1850 | 场景 42 |

> B42（black-hole）与 B41（fireworks）在计划 A 的 Task A8/A9 已做初版；本计划中它们的任务是**按 §4.2 完整元素清单补齐并打磨**（A 阶段只要求核心元素可运行）。

## 场景完成判定（每个场景）

- [ ] 设计文档该场景的全部元素条目都有对应实现层
- [ ] 全部声明的多元素互动都在 `update` 中实现
- [ ] 三幕时间边界与文档毫秒一致
- [ ] `dispose()` 后 `ctx.root.children.length === 0`
- [ ] 该场景测试 + `pnpm typecheck` 绿
