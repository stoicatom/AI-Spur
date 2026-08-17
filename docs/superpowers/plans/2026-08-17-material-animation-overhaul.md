# 素材专属动画重做 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 52 个素材的爆裂动画从「2 段缩放 + 单层粒子」重做为「专属语义叙事 + 专属主题色 + 物理绑定甩鞭」，并放大动画尺寸、突出冲击力。

**Architecture:** 抽出粒子发射原语库，素材叙事改为「数据组合原语」的声明式定义；新增 `WhipVel` 与 `MATERIAL_HUE` 色相表打通物理绑定；爆裂渲染叠加统一的「冲击光环 + 中心闪光」增强层。

**Tech Stack:** TypeScript strict / Vite / Vitest。本次不改 Rust。

## Global Constraints

（下述逐条复制自 spec，任何任务都隐含遵守）
- 行数限制：TypeScript 文件 ≤ 250 行；超限必须拆模块（CLAUDE.md §3 + §8）。
- 物理引擎固定 dt=1/60，不与其他帧率耦合（CLAUDE.md §6）。
- 单素材粒子总量 ≤ 180，保持 ≥60fps；CRACK_MS 保持 1200ms（spec §6.1）。
- `.hue` 必须查 `MATERIAL_HUE` 表，不得随机（spec §6.1）。
- 所有 IPC 走 `src/shared/ipc.ts` 包装 + Zod 校验（CLAUDE.md §4.3）。
- 不允许 `any`；不允许裸 `invoke`（CLAUDE.md §10）。
- 现有测试不得破坏：`src/__tests__/material-visual.test.ts`（零分配 + 生命周期）、`src/__tests__/main-flow.e2e.test.ts`。

---

## 文件结构

| 文件 | 责任 | 状态 |
|---|---|---|
| `src/overlay/particles.ts` | **新**。粒子类型、`WhipVel`、`MATERIAL_HUE` 色相表、发射原语（arcSweep/shockRing/spiral/…）、冲击增强绘制 | 新建 |
| `src/overlay/material-styles.ts` | **新**。52 素材的 `CrackStyle` 声明式定义（Hue + sprite + emit 组合原语） | 新建 |
| `src/overlay/material-visual.ts` | **改（瘦身）**。保留 `MaterialTrail`、`ImageMaterial`、`resolveMaterial`；`crackStyle` 命名空间改从 `material-styles` 转发 | 改写 |
| `src/overlay/swing.ts` | **改**。`push()` 返回 `{cracked, vx, vy, peakSpeed}` | 小改 |
| `src/overlay/main.ts` | **改**。`triggerCrack` 接收并传递 vel 给 `startCrack` | 小改 |
| `src/__tests__/material-styles.test.ts` | **新**。每个素材差异化断言（色相=查表、粒子层≥N、空间覆盖≥阈值） | 新建 |
| `src/__tests__/material-visual.test.ts` | 保持（零分配 + 生命周期不破） | 不动 |

### 接口契约（跨任务依赖，先定义）

```ts
// particles.ts
export type WhipVel = { vx: number; vy: number; speed: number; dir: number };
export const MATERIAL_HUE: Record<string, number>;   // 52 素材 id → 专属色相
export type Particle = { x:number;y:number;vx:number;vy:number;life:number;decay:number;size:number;hue:number;gravity:number;shape:0|1|2;angle:number };
export const P: {
  arcSweep(cx,cy,count,angA,angB,radius,opts?): Particle[];   // 弧线残影
  parabola(cx,cy,count,dx,dz,opts?): Particle[];               // 抛物线（重力回调）
  shockRing(cx,cy,count,radiusLo,radiusHi,opts?): Particle[];  // 扩散圆环
  spiral(cx,cy,count,turns,radius,opts?): Particle[];          // 螺旋
  pillar(cx,cy,count,height,opts?): Particle[];                // 竖直光柱/腾升
  shards(cx,cy,count,speedLo,speedHi,opts?): Particle[];       // 碎屑四散
  burst(cx,cy,count,speedLo,speedHi,opts?): Particle[];        // 点状爆散
  notes(cx,cy,count,opts?): Particle[];                        // 音符(♪)弹跳
};

// material-styles.ts（material-visual.ts 曾导出的 CrackStyle 定义）
export type CrackStyle = {
  hue: number;
  sprite: (t: number, vel: WhipVel) => { dx:number;dy:number;scale:number;rot:number;alpha:number };
  emit: (cx: number, cy: number, vel: WhipVel) => Particle[];
};
export function crackStyle(id: string): CrackStyle;

// material-visual.ts
export function resolveMaterial(...): ResolvedMaterial;   // 不变
export class ImageMaterial {
  startCrack(x: number, y: number, vel?: WhipVel): void;  // vel 可选，缺失回退
  updateAndDrawCrack(ctx, now): void;                     // 增加冲击增强层绘制
  // …既有接口不变
}

// swing.ts
export type SwingResult = { cracked: boolean; vx: number; vy: number; peakSpeed: number };
export class SwingDetector { push(s, p): SwingResult; /* … */ }
```

---

## Phase A — 基础架构（原子交付每步）

### Task 1: 粒子类型与色相表

**Files:**
- Create: `src/overlay/particles.ts`

**Interfaces:**
- Produces: `Particle` 类型、`WhipVel` 类型、`MATERIAL_HUE` 表。

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect } from 'vitest';
import { MATERIAL_HUE, type Particle, type WhipVel } from '../overlay/particles';

describe('MATERIAL_HUE 专属主题色表', () => {
  it('52 内置素材全部有独立主题色', () => {
    const ids = ['whip','classic','rocket','lightning','flame','star','meteor','skull','crown','sword','bow','shield','bomb','hammer','scepter','amulet','dagger','boomerang','spear','axe','scythe','trident','flail','chakram','halberd','slingshot','blowgun','tessen','chain','wind','snow','rain','water','tornado','aurora','earthquake','volcano','guitar','drum','bell','horn','flute','harp','football','tennis','boxing','fireworks','crystal','bamboo','lotus','dragonfly'];
    for (const id of ids) expect(MATERIAL_HUE[id], id).toBeTypeOf('number');
  });
  it('语义相近素材不共用同一色相（消灭橙金一片）', () => {
    const set = new Set<number>();
    for (const id of Object.keys(MATERIAL_HUE)) set.add(MATERIAL_HUE[id]);
    // 至少 30 个不同色相值（允许少量语义相邻）
    expect(set.size).toBeGreaterThanOrEqual(30);
  });
  it('Particle 结构完整', () => {
    const p: Particle = { x:0,y:0,vx:0,vy:0,life:1,decay:0.02,size:3,hue:0,gravity:0,shape:0,angle:0 };
    expect(p).toBeDefined();
  });
});
```

- [ ] **Step 2: 运行验证失败**

Run: `npx vitest run src/__tests__/particles.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `src/overlay/particles.ts`（类型 + 色相表部分）**

```ts
/** 物理绑定速度向量：爆裂方向 = vx/vy，强度 = speed。缺失时调用方回退默认。 */
export type WhipVel = { vx: number; vy: number; speed: number; dir: number };

export type Particle = {
  x: number; y: number;
  vx: number; vy: number;
  life: number; decay: number;
  size: number; hue: number;
  gravity: number;
  shape: 0 | 1 | 2;   // 0=dot 1=streak 2=shard
  angle: number;
};

/**
 * 52 素材 → 专属主题色相。来自 spec §4/§5 逐素材色相。
 * 索引缺失：本轮选中的素材必须在此注册；未知回退 28。
 */
export const MATERIAL_HUE: Record<string, number> = {
  whip: 28, classic: 205, rocket: 26, lightning: 55, flame: 20,
  star: 45, meteor: 30, skull: 90, crown: 45, sword: 204,
  bow: 33, shield: 215, bomb: 15, hammer: 220, scepter: 285,
  amulet: 270, dagger: 200, boomerang: 25, spear: 200, axe: 210,
  scythe: 280, trident: 205, flail: 20, chakram: 215, halberd: 210,
  slingshot: 25, blowgun: 120, tessen: 30, chain: 220, wind: 200,
  snow: 210, rain: 215, water: 205, tornado: 185, aurora: 140,
  earthquake: 25, volcano: 20, guitar: 35, drum: 25, bell: 40,
  horn: 48, flute: 195, harp: 45, football: 110, tennis: 80,
  boxing: 0, fireworks: 350, crystal: 270, bamboo: 110, lotus: 310,
  dragonfly: 140,
};

/** 默认 WhipVel：物理绑定缺失时（测试/兜底）用水平中速。 */
export const DEFAULT_VEL: WhipVel = { vx: 1, vy: 0, speed: 1, dir: 0 };

/** 把任意速度向量归一化为 WhipVel（dir = 方位角）。 */
export function toWhipVel(vx: number, vy: number, speed: number): WhipVel {
  const m = Math.hypot(vx, vy) || 1;
  return { vx: vx / m, vy: vy / m, speed, dir: Math.atan2(vy, vx) };
}
```

- [ ] **Step 4: 验证通过**

Run: `npx vitest run src/__tests__/particles.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/overlay/particles.ts src/__tests__/particles.test.ts
git commit -m "feat: 新增粒子类型 + 专属主题色相表 MATERIAL_HUE" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

### Task 2: 粒子发射原语库

**Files:**
- Modify: `src/overlay/particles.ts`

**Interfaces:**
- Consumes: Task 1 的 `Particle`、`WhipVel`。
- Produces: `P` 导出对象（9 个原语函数）。

- [ ] **Step 1: 追加测试**

在 `src/__tests__/particles.test.ts` 追加：

```ts
import { P } from '../overlay/particles';

describe('粒子发射原语', () => {
  it('shockRing 生成 count 个圆环粒子，等角分布', () => {
    const ps = P.shockRing(100, 100, 24, 10, 60);
    expect(ps).toHaveLength(24);
    for (const p of ps) expect(p.shape).toBe(1);
  });
  it('parabola 生成的粒子沿弧线分布（y 随 frac 先上后落）', () => {
    const ps = P.parabola(0, 0, 20, 300, 120);
    expect(ps).toHaveLength(20);
    const ys = ps.map(p => p.y);
    // 存在高于起点的点（抛物线拱起）
    expect(Math.min(...ys)).toBeLessThan(0);
  });
  it('burst 粒子速度在给定区间且重力默认 >0', () => {
    const ps = P.burst(0, 0, 40, 3, 10);
    expect(ps).toHaveLength(40);
    expect(Math.min(...ps.map(p => p.gravity))).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: 运行验证失败**

Run: `npx vitest run src/__tests__/particles.test.ts`
Expected: FAIL（P 未导出）

- [ ] **Step 3: 实现原语（追加到 `particles.ts`）**

```ts
const TAU = Math.PI * 2;
const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

type Opts = Partial<{ decay:[number,number]; size:[number,number]; hue:[number,number]; gravity:number; shape:0|1|2; angleLo:number; angleHi:number }>;
function hueRange(hue: number, off: number): [number, number] { return [hue-off, hue+off]; }
function base(shape: 0|1|2): { decay:[number,number]; size:[number,number]; gravity:number } {
  return shape === 2
    ? { decay:[0.02,0.035], size:[2,5], gravity:0.1 }
    : { decay:[0.015,0.028], size:[2,5], gravity:0.05 };
}

export const P = {
  /** 弧线残影：沿 cx,cy 起点的角 A→B 半径 radius 的弧布点，速度沿切线。 */
  arcSweep(cx: number, cy: number, count: number, angA: number, angB: number, radius: number, o: Opts = {}): Particle[] {
    const out: Particle[] = [];
    const d = base(o.shape ?? 1);
    const hue = o.hue ?? [0, 0];
    for (let i = 0; i < count; i++) {
      const f = i / count;
      const ang = angA + (angB - angA) * f;
      const r = radius * f * f;
      const x = cx + Math.cos(ang) * r;
      const y = cy + Math.sin(ang) * r;
      const tan = ang + Math.PI / 2;
      const sp = rand(5, 12);
      out.push({ x, y, vx: Math.cos(tan) * sp, vy: Math.sin(tan) * sp,
        life: 1, decay: rand(...(o.decay ?? d.decay)), size: rand(...(o.size ?? d.size)),
        hue: rand(...hue), gravity: o.gravity ?? d.gravity, shape: o.shape ?? 1, angle: tan });
    }
    return out;
  },

  /** 抛物线：count 点沿弧线分布（x 展宽 dx，y 拱起 dz）。 */
  parabola(cx: number, cy: number, count: number, dx: number, dz: number, o: Opts = {}): Particle[] {
    const out: Particle[] = [];
    const d = base(o.shape ?? 1);
    const hue = o.hue ?? [0, 0];
    for (let i = 0; i < count; i++) {
      const f = i / count;
      const x = cx + f * dx;
      const y = cy - Math.sin(f * Math.PI) * dz;
      const sp = rand(1, 3);
      out.push({ x, y, vx: sp, vy: (Math.cos(f * Math.PI) - 0.3) * 2,
        life: 1, decay: rand(...(o.decay ?? d.decay)), size: rand(...(o.size ?? d.size)),
        hue: rand(...hue), gravity: o.gravity ?? 0.05, shape: o.shape ?? 1, angle: 0 });
    }
    return out;
  },

  /** 扩散圆环：一圈 streak 垂直半径方向，模拟冲击波。 */
  shockRing(cx: number, cy: number, count: number, radiusLo: number, radiusHi: number, o: Opts = {}): Particle[] {
    const out: Particle[] = [];
    const hue = o.hue ?? [0, 0];
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * TAU;
      const r = rand(radiusLo, radiusHi);
      const x = cx + Math.cos(ang) * r;
      const y = cy + Math.sin(ang) * r;
      const sp = (o.gravity ?? 0) === 0 ? rand(3, 8) : 3;
      out.push({ x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        life: 1, decay: rand(0.012, 0.02), size: rand(3, 7),
        hue: rand(...hue), gravity: o.gravity ?? 0, shape: 1, angle: ang + Math.PI / 2 });
    }
    return out;
  },

  /** 螺旋：turns 圈从中心旋出。 */
  spiral(cx: number, cy: number, count: number, turns: number, radius: number, o: Opts = {}): Particle[] {
    const out: Particle[] = [];
    const hue = o.hue ?? [0, 0];
    for (let i = 0; i < count; i++) {
      const f = i / count;
      const ang = f * turns * TAU;
      const r = radius * f;
      const x = cx + Math.cos(ang) * r;
      const y = cy + Math.sin(ang) * r;
      const tan = ang + Math.PI / 2;
      out.push({ x, y, vx: Math.cos(tan) * 2, vy: Math.sin(tan) * 2,
        life: 1, decay: rand(0.018, 0.03), size: rand(2, 4),
        hue: rand(...hue), gravity: o.gravity ?? 0, shape: 1, angle: tan });
    }
    return out;
  },

  /** 竖直光柱/腾升：由下往上，越靠上越散。 */
  pillar(cx: number, cy: number, count: number, height: number, o: Opts = {}): Particle[] {
    const out: Particle[] = [];
    const hue = o.hue ?? [0, 0];
    for (let i = 0; i < count; i++) {
      const f = i / count;
      const x = cx + rand(-1, 1) * f * 20;
      const y = cy - f * height;
      out.push({ x, y, vx: rand(-1, 1) * f, vy: -2 - f * 3,
        life: 1, decay: rand(0.02, 0.035), size: rand(2, 5) * (0.6 + f),
        hue: rand(...hue), gravity: -0.03, shape: o.shape ?? 0, angle: 0 });
    }
    return out;
  },

  /** 碎屑四散：shard 为主，受明显重力。 */
  shards(cx: number, cy: number, count: number, speedLo: number, speedHi: number, o: Opts = {}): Particle[] {
    return P.burst(cx, cy, count, speedLo, speedHi, { ...o, shape: o.shape ?? 2 });
  },

  /** 点状爆散：dot 均匀四散。 */
  burst(cx: number, cy: number, count: number, speedLo: number, speedHi: number, o: Opts = {}): Particle[] {
    const out: Particle[] = [];
    const d = base(o.shape ?? 0);
    const hue = o.hue ?? [0, 0];
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * TAU + rand(-0.15, 0.15);
      const sp = rand(speedLo, speedHi);
      out.push({ x: cx, y: cy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        life: 1, decay: rand(...(o.decay ?? d.decay)), size: rand(...(o.size ?? d.size)),
        hue: rand(...hue), gravity: o.gravity ?? d.gravity, shape: o.shape ?? 0, angle: ang });
    }
    return out;
  },

  /** 音符：小方块(?即 shard)排成一行弹跳曲线，供乐器素材使用。 */
  notes(cx: number, cy: number, count: number, o: Opts = {}): Particle[] {
    const out: Particle[] = [];
    const hue = o.hue ?? [0, 0];
    for (let i = 0; i < count; i++) {
      const f = i / count;
      const x = cx + f * 160 + rand(-4, 4);
      const y = cy - Math.abs(Math.sin(f * Math.PI * 2)) * 40;
      out.push({ x, y, vx: 3, vy: -Math.cos(f * Math.PI * 2) * 2,
        life: 1, decay: rand(0.015, 0.025), size: rand(3, 6),
        hue: rand(...hue), gravity: 0.08, shape: 2, angle: 0 });
    }
    return out;
  },
};
```

- [ ] **Step 4: 验证通过 + 提交**

Run: `npx vitest run src/__tests__/particles.test.ts`
Expected: PASS
然后提交（消息示例同 Task 1）。

### Task 3: 物理绑定 — swing.ts 返回值扩展

**Files:**
- Modify: `src/overlay/swing.ts`
- Create: `src/__tests__/swing.test.ts`（补缺失测试）

**Interfaces:**
- Consumes: 现有 `SwingDetector.push`、`SwingParams`。
- Produces: `SwingResult`，`push()` 返回 `{cracked, vx, vy, peakSpeed}`。**向后兼容：既有调用检测 `if (push(...))` 仍按 truthy 工作——`cracked` 布尔值即该值。**

- [ ] **Step 1: 写失败测试（新文件）**

```ts
import { describe, it, expect } from 'vitest';
import { SwingDetector, DEFAULT_SWING } from '../overlay/swing';

function mkT(n: number){ return performance.now() + n; }
const P = { ...DEFAULT_SWING, minTravel: 10, graceMs: 0 };

describe('SwingDetector 物理绑定', () => {
  it('高速甩动触发时返回速度向量', () => {
    const s = new SwingDetector(mkT(0));
    // 向右高速甩动（速度 > baseSpeed）
    const evs = [
      { x: 0, y: 0, t: mkT(0) },
      { x: 40, y: 0, t: mkT(16) },
      { x: 100, y: 2, t: mkT(32) },  // 高速 → 急减速(before: 60/16=3.75 vs cur: 60/16)
      { x: 130, y: 2, t: mkT(48) },  // 减速到 30/16=1.9 < 3.75/2
    ];
    let res: any = { cracked: false };
    for (const e of evs) res = s.push(e, P);
    expect(res.cracked).toBe(true);
    expect(res.vx).toBeGreaterThan(0);   // 向右
    expect(res.speed).toBeGreaterThan(0);
    expect(typeof res.vx).toBe('number');
  });

  it('未触发时 cracked=false', () => {
    const s = new SwingDetector(mkT(0));
    const r = s.push({ x: 0, y: 0, t: mkT(0) }, P); // 仅一帧，不足 3 帧
    expect(r.cracked).toBe(false);
  });
});
```

- [ ] **Step 2: 验证失败**

Run: `npx vitest run src/__tests__/swing.test.ts`
Expected: FAIL（返回值无 vx/vy/peakSpeed）

- [ ] **Step 3: 实现**

改 `swing.ts`：

```ts
export interface SwingResult {
  cracked: boolean;
  vx: number; vy: number;      // snap 瞬间速度向量（px/ms）
  peakSpeed: number;           // 本次甩动累计峰值速
}
```

`push` 判定段改为：

```ts
push(s: SwingSample, p: SwingParams): SwingResult {
  this.samples.push(s);
  if (this.samples.length > HISTORY) this.samples.shift();

  if (this.samples.length < 3) return { cracked: false, vx: 0, vy: 0, peakSpeed: this.peakSpeed };
  if (s.t - this.spawnT < p.graceMs) return { cracked: false, vx: 0, vy: 0, peakSpeed: this.peakSpeed };
  if (s.t - this.lastCrackT < p.cooldownMs) return { cracked: false, vx: 0, vy: 0, peakSpeed: this.peakSpeed };

  const n = this.samples.length;
  const prev = this.samples[n - 2];
  const cur = this.samples[n - 1];
  const before = this.samples[n - 3];

  const vCur = velocity(prev, cur);
  const vPrev = velocity(before, prev);
  const speedCur = mag(vCur);
  const speedPrev = mag(vPrev);
  this.peakSpeed = Math.max(this.peakSpeed, speedPrev, speedCur);

  const threshold = p.baseSpeed / clamp(p.sensitivity, 0.5, 2.0);
  if (this.travel() < p.minTravel) return { cracked: false, vx: vCur.x, vy: vCur.y, peakSpeed: this.peakSpeed };

  const hadPeak = this.peakSpeed >= threshold;
  if (!hadPeak) return { cracked: false, vx: vCur.x, vy: vCur.y, peakSpeed: this.peakSpeed };

  const decel = speedCur < this.peakSpeed * 0.5;
  const reversed = speedPrev > 0.2 && speedCur > 0.2 && angleBetween(vPrev, vCur) > (2 * Math.PI) / 3;

  if (decel || reversed) {
    this.lastCrackT = s.t;
    const out = { cracked: true, vx: vCur.x, vy: vCur.y, peakSpeed: this.peakSpeed };
    this.peakSpeed = 0;
    return out;
  }
  return { cracked: false, vx: vCur.x, vy: vCur.y, peakSpeed: this.peakSpeed };
}
```

- [ ] **Step 4: 验证通过**

Run: `npx vitest run src/__tests__/swing.test.ts`
Expected: PASS（若两用例全过）

- [ ] **Step 5: 提交**

### Task 4: 物理绑定打通 — material-visual 接口 + main.ts

**Files:**
- Modify: `src/overlay/material-visual.ts`（瘦身版本先将 `CrackStyle` 接口改为从新模块转发；本任务只动接口与 `ImageMaterial.startCrack` 签名）
- Modify: `src/overlay/main.ts`

**Interfaces:**
- Consumes: Task 1-2 的 `WhipVel`、`toWhipVel`；Task 3 的 `SwingResult`。
- Produces: `ImageMaterial.startCrack(x, y, vel?)`；`triggerCrack(x,y,vel)` 传参。

- [ ] **Step 1: 改 `material-visual.ts` 的 `startCrack` 签名 + 新增冲击增强绘制占位**

在 `ImageMaterial` 加字段与签名：

```ts
private crackVel: WhipVel = DEFAULT_VEL;
startCrack(x: number, y: number, vel: WhipVel = DEFAULT_VEL): void {
  this.crackOn = true;
  this.crackT0 = performance.now();
  this.crackX = x;
  this.crackY = y;
  this.crackVel = vel;
  this.particles = this.style.emit(x, y, vel);
}
```

`updateAndDrawCrack(ctx, now)` 在粒子绘制后、精灵绘制前，新增冲击增强层（先占位空实现，Task 5 补全）：

```ts
this.drawImpact(ctx, now);  // 冲击光环 + 中心闪光（Task 5 实现）
```

`drawImpact` 先加空体，保证测试通过：

```ts
private drawImpact(_ctx: CanvasRenderingContext2D, _now: number): void {}
```

> 注：本任务先把 `sprite(t)`/`emit` 调用处补上 vel 参数；具体冲刺增强逻辑在 Task 5。

- [ ] **Step 2: 更新现有 `material-visual.test.ts` 期望（`startCrack` 多参数不破）**

无需改动——`startCrack(100,100)` 仍合法（vel 可选）。运行确认不破。

- [ ] **Step 3: 改 `main.ts`**

`triggerCrack` 签名与调用：

```ts
function triggerCrack(x: number, y: number, vel: WhipVel) {
  if (material.crackAlive || !active) return;
  triggerMacro().catch(...);
  active = false;
  playEffectSound();
  material.startCrack(x, y, vel);
  trail.clear();
  incrementUsage().catch(() => {});
}
```

光标事件处改为：

```ts
unlistenCursor = await onCursorPos((pos) => {
  mouseX = pos.x; mouseY = pos.y;
  if (!active) return;
  const now = performance.now();
  trail.push(mouseX, mouseY, now);
  const swingRes = swing.push({ x: mouseX, y: mouseY, t: now }, swingParams);
  if (swingRes.cracked) {
    const vel = toWhipVel(swingRes.vx, swingRes.vy, swingRes.peakSpeed * 60); // px/ms→px/f 放大
    triggerCrack(mouseX, mouseY, vel);
  }
});
```

`main.ts` 顶部 `import { toWhipVel, type WhipVel } from './particles';`

- [ ] **Step 4: 验证**

Run: `npx vitest run`（全量）+ `npm run typecheck`
Expected: PASS（既有 145+ 测试全绿，typecheck 无错）

- [ ] **Step 5: 提交**

```bash
git add src/overlay/swing.ts src/overlay/main.ts src/overlay/material-visual.ts src/__tests__/swing.test.ts
git commit -m "feat: 物理绑定打通 startCrack 接收甩鞭速度向量" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

### Task 5: 冲击增强层 + 放大尺寸

**Files:**
- Modify: `src/overlay/particles.ts`（新增 `drawImpact` 导出 + `IMPACT` 常量）
- Modify: `src/overlay/material-visual.ts`（`drawImpact` 调用 + `CURSOR_MAX_PX` 96）

**Interfaces:**
- Consumes: `WhipVel`、`crackVel`。
- Produces: 全局冲击光环 + 中心闪光绘制；精灵基座放大。

- [ ] **Step 1: 测试**

在 `particles.test.ts` 追加：

```ts
import { IMPACT } from '../overlay/particles';
it('冲击增强参数：CURSOR_MAX_PX 放大到 96 且冲击光环半径随速度', () => {
  expect(IMPACT.maxPx).toBe(96);
  const rSlow = IMPACT.ringRadius(1);   // 慢甩
  const rFast = IMPACT.ringRadius(3);   // 快甩
  expect(rFast).toBeGreaterThan(rSlow);
});
```

- [ ] **Step 2: 失败验证** → FAIL（IMPACT 不存在）

- [ ] **Step 3: 实现**

`particles.ts` 追加：

```ts
/** 冲击增强全局参数（spec §6）。 */
export const IMPACT = {
  maxPx: 96,                                  // 精灵基座最长边（原 56 → 96）
  ringRadius(speed: number): number {         // 光环扩散半径 ∝ 速度
    return 90 + speed * 70;                   // 慢 ≈160，快 ≈300
  },
  flashAlpha(speed: number): number {         // 中心闪光强度 ∝ 速度
    return Math.min(1, 0.5 + speed * 0.16);
  },
};

/** 绘制横切的冲击光环 + 中心闪光。全屏覆盖，方向无关，只随速度缩放。 */
export function drawImpact(ctx: CanvasRenderingContext2D, now: number, cx: number, cy: number, vel: WhipVel, t: number): void {
  if (t >= 0.35) return;                       // 冲击只在起爆前半程
  const R = IMPACT.ringRadius(vel.speed);
  const ease = t / 0.35;
  const r = ease * R;
  const alpha = (1 - ease) * 0.55;
  const hue = 42;                              // 暖金冲击光（与素材 hue 不同源，横切全局）

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = `hsl(${hue},100%,66%)`;
  ctx.lineWidth = 6 * (1 - ease) + 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.stroke();

  // 中心闪光：起爆 0–0.15 最亮，之后衰减
  if (t < 0.15) {
    const fa = IMPACT.flashAlpha(vel.speed) * (1 - t / 0.15);
    ctx.globalAlpha = fa;
    ctx.fillStyle = '#FFF6D8';
    ctx.beginPath();
    ctx.arc(cx, cy, 26 * (1 - t / 0.15) + 8, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}
```

`material-visual.ts`：
- `const CURSOR_MAX_PX = 96;`
- `drawImpact` 调用改为：

```ts
import { drawImpact, DEFAULT_VEL, type WhipVel } from './particles';
// 在 updateAndDrawCrack 粒子阶段后、精灵阶段前：
drawImpact(ctx, now, this.crackX, this.crackY, this.crackVel, t);
```

- [ ] **Step 4: 验证 + 提交**

Run: `npx vitest run src/__tests__/particles.test.ts src/__tests__/material-visual.test.ts`
Expected: PASS
提交消息：`feat: 冲击光环+中心闪光增强层，精灵基座放大到 96px`

### Task 6: 拆分 52 素材为 material-styles.ts（骨架 + 第一组）

**Files:**
- Create: `src/overlay/material-styles.ts`
- Modify: `src/overlay/material-visual.ts`（把 `crackStyle` 转发到新模块，移除 2649 行旧实现 → 瘦身）

**Interfaces:**
- Consumes: Task 1-5 的 `P`、`WhipVel`、`MATERIAL_HUE`、`Particle`。
- Produces: `CrackStyle`、`crackStyle(id)` 命名空间；`material-visual.ts` 改为 `import { crackStyle } from './material-styles'`。

该任务**只迁移**“已有优质叙事 + 物理绑定化”的第一批，保持行为不变。选定首批（叙事完整、仅补物理的 9 个）：`whip/classic/rocket/lightning/flame/meteor/skull/crown/sword`。

- [ ] **Step 1: 测试驱动迁移等价性**

新文件 `src/__tests__/material-styles.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { crackStyle } from '../overlay/material-styles';
import { MATERIAL_HUE, DEFAULT_VEL, type WhipVel } from '../overlay/particles';

describe('material-styles 素材差异化', () => {
  it('每个素材色相等于查表值', () => {
    for (const id of Object.keys(MATERIAL_HUE)) {
      const st = crackStyle(id);
      expect(st.hue, id).toBe(MATERIAL_HUE[id]);
    }
  });
  it('粒子总量符合预算且不超上限', () => {
    const ids = Object.keys(MATERIAL_HUE);
    for (const id of ids) {
      const ps = crackStyle(id).emit(0, 0, DEFAULT_VEL);
      expect(ps.length, id).toBeLessThanOrEqual(180);
      expect(ps.length, id).toBeGreaterThan(0);
    }
  });
  it('物理方向：速度向量右向时粒子整体向右偏移', () => {
    const st = crackStyle('sword');
    const vel: WhipVel = { vx: 1, vy: 0, speed: 3, dir: 0 };
    const ps = st.emit(0, 0, vel);
    const rightward = ps.filter(p => p.vx > 0).length;
    expect(rightward).toBeGreaterThan(ps.length / 2);
  });
});
```

- [ ] **Step 2: 失败验证** → FAIL（material-styles 不存在）

- [ ] **Step 3: 创建 `material-styles.ts` 骨架 + 迁移 9 个素材**

```ts
import { P, MATERIAL_HUE, type WhipVel, type Particle } from './particles';

export type CrackStyle = {
  hue: number;
  sprite: (t: number, vel: WhipVel) => { dx:number; dy:number; scale:number; rot:number; alpha:number };
  emit: (cx: number, cy: number, vel: WhipVel) => Particle[];
};

/** 把 9 个「已有叙事」素材从 material-visual.ts 原样搬来，仅补 vel 参数。 */
function whip(): CrackStyle { /* 平移原 case 'whip' 的 sprite/emit，签名加 vel，粒子 hue 改用 rand(MATERIAL_HUE.whip±14) */ }
function classic(): CrackStyle { /* 同 */ }
function rocket(): CrackStyle { /* 同 */ }
function lightning(): CrackStyle { /* 同，hue 表 55 改黄白 */ }
function flame(): CrackStyle { /* 同 */ }
function meteor(): CrackStyle { /* 同 */ }
function skull(): CrackStyle { /* 同 */ }
function crown(): CrackStyle { /* 同 */ }
function sword(): CrackStyle { /* 同，hue 204 */ }

export function crackStyle(id: string): CrackStyle {
  const M: Record<string, () => CrackStyle> = {
    whip, classic, rocket, lightning, flame, meteor, skull, crown, sword,
  };
  const fn = M[id] ?? (() => ({ // 未知回退（其余素材 Task 7+ 填充）
    hue: MATERIAL_HUE[id] ?? 28,
    sprite: (t) => ({ dx: t * 200, dy: 0, scale: 1 + t, rot: 0, alpha: 1 - t }),
    emit: (cx, cy) => P.burst(cx, cy, 30, 2, 7, { hue: [ (MATERIAL_HUE[id] ?? 28) - 10, (MATERIAL_HUE[id] ?? 28) + 10 ] }),
  }));
  return fn();
}
```

`material-visual.ts` 顶部把 2649 行 `crackStyle` 整体删除，改为：

```ts
import { crackStyle, type CrackStyle } from './material-styles';
export type { CrackStyle } from './material-styles';
```

> 迁移 9 个素材时逐一验证：既有 `material-visual.test.ts`（零分配/生命周期）依赖 `crackStyle` 仍可用 → 保持导出。

- [ ] **Step 4: 验证 + 提交**

Run: `npx vitest run src/__tests__/material-styles.test.ts src/__tests__/material-visual.test.ts`
Expected: PASS
Commit：`refactor: 拆分 crackStyle 至 material-styles.ts，首批迁移 9 个优质素材`

---

## Phase B — 素材叙事重做（按 spec §五，逐组落地）

> **实施模式（每素材一个 task）：** 每个 Task = 1 个素材的 `material-styles.ts` 新函数 + spec 对应场景卡 + 差异化测试断言。复制下面「素材模板」填充即可。注意**单个 task 只动一个素材**，便于独立验收。

### 素材模板

```ts
/* spec A-XX */
function 素材id(): CrackStyle {
  const H = MATERIAL_HUE.素材id;
  return {
    hue: H,
    sprite: (t, vel) => {
      // 专属叙事：可挪用 vel.dir（方向）与 vel.speed（强度）
      // 返回 { dx, dy, scale, rot, alpha }
    },
    emit: (cx, cy, vel) => [
      ...P.专属原语(cx, cy, N, ..., { hue: [H-10, H+10] }),
      // 可追加第二、三层
    ],
  };
}
```

**每个素材的差异化测试**追加到 `material-styles.test.ts`：

```ts
it('<素材id> 粒子层数 ≥N 且色相带身份', () => {
  const ps = crackStyle('<素材id>').emit(0,0,DEFAULT_VEL);
  expect(ps.length).toBeGreaterThanOrEqual(N);
  expect(crackStyle('<素材id>').hue).toBe(MATERIAL_HUE['<素材id>']);
});
it('<素材id> 位移覆盖 ≥P 像素（放大冲击力）', () => {
  const st = crackStyle('<素材id>');
  const maxReach = Math.max(...st.emit(0,0,{vx:1,vy:0,speed:3,dir:0}).map(p => Math.hypot(p.vx,p.vy)));
  expect(maxReach).toBeGreaterThan(P);
});
```

> **放大/冲击力原则（每素材通用）：**
> - `sprite` 的 scale 峰值 ≥ 3（对应 CURSOR_MAX_PX 96 → 精灵峰面 ~290px）；
> - `emit` 位移使用放大系数（粒子 speed 区间较旧实现 ×1.6）确保 ≥ 覆盖阈值；
> - 速度感：`vel.speed` 大时扩张位移、（可选）多追加一层粒子。

### Task 7+: P1 — 9 个最薄弱素材

按 spec §五摘出的最薄弱：`star、horn、trident、blowgun、slingshot、chain、football、dragonfly、tessen`。逐素材一个 task，模板如上，具体场景与色相见 spec A17/A18、B4、D4、E1/E5/E6、A13/A14、A15 等对应卡。

- [ ] Task 7：`star` — 五芒星 5 束光丝（`P.burst` 5 组窄扇）+ 星尘，hue45，粒子 ≥40，位移覆盖 ≥180px
- [ ] Task 8：`horn` — 环形声波（`P.shockRing`）+ 音符（`P.notes`），hue48，粒子 ≥30，覆盖 ≥220px
- [ ] Task 9：`trident` — 三海浪（`P.parabola` 3 组），hue205，粒子 ≥36，覆盖 ≥260px
- [ ] Task 10：`blowgun` — 单支细长尾迹（`P.arcSweep` 近直线 + `P.burst` 吹气雾），hue120，粒子 ≥20，覆盖 ≥200px
- [ ] Task 11：`slingshot` — 皮筋绷紧缩放 + 高速 `P.arcSweep` 弹道，hue25，粒子 ≥24，覆盖 ≥220px
- [ ] Task 12：`chain` — `P.spiral` 缠绕 + `P.shards` 链节，hue220，粒子 ≥28，覆盖 ≥200px
- [ ] Task 13：`football` — 草地弹跳 `P.parabola` + 草屑 `P.shards`，hue110，粒子 ≥24，覆盖 ≥240px
- [ ] Task 14：`dragonfly` — 双翅光轨（两组 `P.arcSweep` 镜像）+ 疾掠，hue140，粒子 ≥24，覆盖 ≥240px
- [ ] Task 15：`tessen` — 铁扇展开（`P.arcSweep` 扇形多档）+ 斜切弧，hue30，粒子 ≥28，覆盖 ≥200px

每 Task 末尾提交。

### Task 16+: P2 — 武器类剩余（A2–A16 除 sword/hammer 已迁移/或增强）

按 spec A 组逐素材，含：`bow/shield/bomb/hammer/scepter/amulet/dagger/boomerang/spear/axe/scythe/flail/chakram/halberd/slingshot(已P1)/blowgun(已P1)/tessen(已P1)`。每个一个 task，模板同 P1。**archery 并入 bow**（决策 1）。

### Task 17+: P3 — 天象玄学（B/C 组除 P1 已做的）

`wind/snow/rain/water/tornado/aurora/earthquake/volcano/crystal/bamboo/lotus`。每素材一个 task。

### Task 18+: P4 — 乐器 D + 运动杂项 E（除 P1 已做的）

`guitar/drum/bell/flute/harp/football(已P1)/tennis/boxing/fireworks/chain(已P1)/dragonfly(已P1)`。每素材一个 task。**archery 并入 bow**（决策 1 已确认）。

---

## Phase C — 收尾验收

### Task 19: 全量验证 + 性能冒烟

- [ ] **Step 1**: `npm run typecheck` → 无错
- [ ] **Step 2**: `npm run test` → 全绿（含新增 material-styles/particles/swing 测试 + 既有 145+）
- [ ] **Step 3**: `cd src-tauri && cargo test && cargo clippy -- -D warnings` → 全绿（本文未改 Rust，但保证不破）
- [ ] **Step 4**: 手动冒烟 —— 运行 `npm run tauri:dev`，逐个切换素材触发 crack：
  - 肉眼区分不同素材（轨迹 + 色相）
  - 快甩 vs 慢抖：冲击光环 / 半径、粒子量应有明显差异
  - 确认 60fps（无明显掉帧）
- [ ] **Step 5**: 提交验收

---

## 交付物清单（完成时）

- [ ] `particles.ts`：类型、色相表、原语、冲击增强
- [ ] `material-styles.ts`：52 素材声明式定义，行数 ≤ 结构合理
- [ ] `material-visual.ts`：瘦身至无 crackStyle 长实现
- [ ] `swing.ts` / `main.ts`：物理绑定链路
- [ ] 测试：`particles`、`material-styles`、`swing` 新增；全量绿
- [ ] 性能：单素材粒子 ≤180，肉眼 60fps

## Plan 与 spec 对照（自审）

| spec 需求 | 对应任务 |
|---|---|
| §三 物理绑定 | Task 3（swing）+ Task 4（startCrack/main）+ Task 5（冲击） |
| §四 专属主题色表 | Task 1（MATERIAL_HUE）+ Task 6（hue=查表断言） |
| §五 52 素材语义叙事 | Task 6 迁移 9 + Task 7–18 重做 |
| §六 冲击力增强/放大 | Task 5（尺寸+光环+闪光）+ 各素材位移/scale 原则 |
| 决策1 archery→bow | Task 16/P4 |
| 决策2 分批 P1–P4 | Task 7–18 分阶段 |
| 决策3 粒子 ≤180 | Task 6 断言 + 每素材 |
| 决策4 保留素材改色 | Task 6 迁移时改色 |
| CLAUDE.md ≤250 行 | Task 1–6 拆分模块 |
