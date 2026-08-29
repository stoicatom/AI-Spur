/**
 * 场景 35 glass-shot 实现验收（设计规格 §4.2 场景 35）。
 *
 * 断言按规格逐条对应：9 元素齐备、三幕时间轴、全屏玻璃板、
 * 「白斑→裂纹→孔洞→碎落」时序因果、径向+环向裂纹形态、
 * 碎片重力物理、两条多元素互动、独立签名、资源释放。
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { resolveScene } from '../overlay/cg-scene-registry';
import '../overlay/cg-scenes';
import type { CgStage, CgStageContext } from '../overlay/cg-scene';

const TOTAL_MS = 1550;
const ACT1_END = 300 / TOTAL_MS;
const ACT2_END = 900 / TOTAL_MS;

/** 规格 §4.2 场景 35 的九元素，实现里以 name 标注供验收。 */
const REQUIRED = [
  'bullet-tracer', 'glass-pane', 'impact-bloom', 'web-cracks',
  'hole-stress', 'glass-shards', 'shard-glint', 'exit-trajectory', 'floor-grit',
] as const;

function makeCtx(overrides: Partial<CgStageContext> = {}): CgStageContext {
  return {
    root: new THREE.Group(),
    origin: new THREE.Vector3(0, 0, 0),
    color: new THREE.Color('#7FD6FF'),
    energy: 1.3,
    direction: new THREE.Vector2(1, 0),
    width: 1920,
    height: 1080,
    quality: 'cinematic',
    params: {},
    now: 0,
    ...overrides,
  };
}

function namedNodes(root: THREE.Object3D): string[] {
  const names: string[] = [];
  root.traverse((o) => { if (o.name) names.push(o.name); });
  return names;
}

function find(root: THREE.Object3D, name: string): THREE.Object3D | null {
  let hit: THREE.Object3D | null = null;
  root.traverse((o) => { if (o.name === name) hit = o; });
  return hit;
}

function collect(root: THREE.Object3D, prefix: string): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  root.traverse((o) => { if (o.name.startsWith(prefix)) out.push(o); });
  return out;
}

function opacityOf(node: THREE.Object3D): number {
  const material = (node as THREE.Mesh).material;
  if (!material || Array.isArray(material)) return 0;
  return (material as THREE.Material).opacity;
}

/** 按固定小步长推进，让 cannon 世界真实积分（一步跨大 dt 会被上限截断）。 */
function step(stage: CgStage, fromT: number, toT: number, frames = 30): void {
  for (let i = 1; i <= frames; i += 1) {
    const t = fromT + ((toT - fromT) * i) / frames;
    stage.update(t, t * TOTAL_MS, 'cinematic');
  }
}

const scene = resolveScene('glass-shot');

describe('场景 35 glass-shot', () => {
  it('已注册且签名声明全屏介质被击碎', () => {
    expect(scene).not.toBeNull();
    expect(scene!.config.preset).toBe('glass-break');
    expect(scene!.config.signature).toContain('全屏');
  });

  it('9 个规格元素在 medium 与 cinematic 档都齐备', () => {
    for (const quality of ['medium', 'cinematic'] as const) {
      const ctx = makeCtx({ quality });
      const stage = scene!.create(ctx);
      const names = namedNodes(ctx.root);
      for (const element of REQUIRED) {
        expect(names, `${quality} 档缺元素 ${element}`).toContain(element);
      }
      stage.dispose();
    }
  });

  it('玻璃板覆盖全屏（规格全屏要求）', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const pane = find(ctx.root, 'glass-pane');
    expect(pane).not.toBeNull();
    const size = new THREE.Box3().setFromObject(pane!).getSize(new THREE.Vector3());
    expect(size.x).toBeGreaterThanOrEqual(ctx.width);
    expect(size.y).toBeGreaterThanOrEqual(ctx.height);
    stage.dispose();
  });

  it('三幕推进：各幕视觉状态互不相同', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const snapshot = (t: number) => {
      stage.update(t, t * TOTAL_MS, 'cinematic');
      const rows: unknown[] = [];
      ctx.root.traverse((o) => {
        rows.push([
          o.name,
          o.position.toArray().map((n) => Number(n.toFixed(2))),
          o.scale.toArray().map((n) => Number(n.toFixed(3))),
          Number(opacityOf(o).toFixed(3)),
        ]);
      });
      return JSON.stringify(rows);
    };
    // 采样点取各幕中段，边界一旦改动这里跟着走，不用回来改魔数。
    const act1 = snapshot(ACT1_END * 0.5);
    const act2 = snapshot((ACT1_END + ACT2_END) * 0.5);
    const act3 = snapshot((ACT2_END + 1) * 0.5);
    expect(act1).not.toBe(act2);
    expect(act2).not.toBe(act3);
    stage.dispose();
  });

  it('时序因果：命中前子弹在飞行且裂纹不可见', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const tracer = find(ctx.root, 'bullet-tracer')!;
    const radial = collect(ctx.root, 'crack-radial-');

    stage.update(0.04, 0.04 * TOTAL_MS, 'cinematic');
    const early = tracer.position.clone();
    const crackEarly = radial.reduce((sum, n) => sum + opacityOf(n), 0);

    stage.update(0.16, 0.16 * TOTAL_MS, 'cinematic');
    const late = tracer.position.clone();

    // 子弹在第一幕沿弹道推进，裂纹此刻还不该存在。
    expect(late.distanceTo(early)).toBeGreaterThan(1);
    expect(crackEarly).toBe(0);
    expect(radial.reduce((sum, n) => sum + opacityOf(n), 0)).toBe(0);
    stage.dispose();
  });

  it('时序因果：命中后裂纹出现且碎片开始掉落', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const shards = collect(ctx.root, 'shard-');
    expect(shards.length).toBeGreaterThan(3);

    step(stage, 0, 0.12);
    const restY = shards.map((s) => s.position.y);
    const bloomBefore = opacityOf(find(ctx.root, 'impact-bloom')!);

    step(stage, 0.12, 0.5);
    const crackSum = collect(ctx.root, 'crack-radial-').reduce((sum, n) => sum + opacityOf(n), 0);
    const dropped = shards.filter((s, i) => s.position.y < restY[i] - 1).length;

    expect(bloomBefore).toBe(0);
    expect(crackSum).toBeGreaterThan(0);
    expect(dropped).toBeGreaterThan(0);
    stage.dispose();
  });

  it('裂纹形态：16 条径向主裂纹与环向裂纹并存', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    expect(collect(ctx.root, 'crack-radial-')).toHaveLength(16);
    expect(collect(ctx.root, 'crack-ring-').length).toBeGreaterThanOrEqual(2);

    // 细纹 shader 层同样按「径向 + 环向」两组参数驱动，不是随机线条。
    const web = find(ctx.root, 'web-cracks') as THREE.Mesh | null;
    const material = web!.material as THREE.ShaderMaterial;
    expect(material.uniforms.uRadialCount.value).toBe(16);
    expect(material.uniforms.uRingCount.value as number).toBeGreaterThan(0);
    stage.dispose();
  });

  it('碎片受重力：下落逐帧加速而非匀速', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const shards = collect(ctx.root, 'shard-');

    step(stage, 0, 0.42);
    const a = shards.map((s) => s.position.y);
    step(stage, 0.42, 0.5);
    const b = shards.map((s) => s.position.y);
    step(stage, 0.5, 0.58);
    const c = shards.map((s) => s.position.y);

    const first = a.reduce((sum, y, i) => sum + (y - b[i]), 0);
    const second = b.reduce((sum, y, i) => sum + (y - c[i]), 0);
    expect(first).toBeGreaterThan(0);
    expect(second).toBeGreaterThan(first);
    stage.dispose();
  });

  it('互动①：裂纹抵板缘时外圈碎片先脱落', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const shards = collect(ctx.root, 'shard-');
    step(stage, 0, 0.12);
    const rest = shards.map((s) => s.position.clone());
    const radius = rest.map((p) => Math.hypot(p.x, p.y));

    step(stage, 0.12, 0.34);
    const moved = shards.map((s, i) => s.position.distanceTo(rest[i]) > 1);
    const mean = (flag: boolean) => {
      const picked = radius.filter((_, i) => moved[i] === flag);
      return picked.reduce((sum, r) => sum + r, 0) / Math.max(1, picked.length);
    };

    expect(moved.some(Boolean)).toBe(true);
    expect(moved.some((m) => !m)).toBe(true);
    // 已脱落的一批平均半径更大：脱落顺序由「裂纹抵板缘」驱动，不是随机。
    expect(mean(true)).toBeGreaterThan(mean(false));
    stage.dispose();
  });

  it('互动②：子弹贯穿瞬间裂纹孔即时扩大', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const web = find(ctx.root, 'web-cracks') as THREE.Mesh;
    const hole = () => (web.material as THREE.ShaderMaterial).uniforms.uHole.value as number;

    stage.update(ACT1_END - 0.01, (ACT1_END - 0.01) * TOTAL_MS, 'cinematic');
    const before = hole();
    stage.update(ACT1_END + 0.005, (ACT1_END + 0.005) * TOTAL_MS, 'cinematic');
    const after = hole();

    // 贯穿是瞬时事件：孔径必须是台阶跃变，不是缓坡。
    expect(before).toBe(0);
    expect(after).toBeGreaterThan(0.2);
    stage.dispose();
  });

  it('独立签名：全屏介质由完整走向崩解，碎渣落地收束', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const pane = find(ctx.root, 'glass-pane') as THREE.Mesh;
    const integrity = () => (pane.material as THREE.ShaderMaterial).uniforms.uShatter.value as number;

    step(stage, 0, 0.12);
    const intact = integrity();
    step(stage, 0.12, 0.99);
    // 第三幕地面碎渣已铺开：碎落有终点，不是无限下落。
    const grit = collect(ctx.root, 'grit-').reduce((sum, n) => sum + opacityOf(n), 0);

    expect(intact).toBe(0);
    expect(integrity()).toBeGreaterThan(0.5);
    expect(grit).toBeGreaterThan(0);
    stage.dispose();
  });

  it('低档位只缩密度，不删元素', () => {
    const lo = makeCtx({ quality: 'low' });
    const hi = makeCtx({ quality: 'cinematic' });
    const a = scene!.create(lo);
    const b = scene!.create(hi);
    for (const element of REQUIRED) {
      expect(namedNodes(lo.root), `low 档缺 ${element}`).toContain(element);
    }
    // 碎片数按档位缩减但绝不归零。
    const loShards = collect(lo.root, 'shard-').length;
    expect(loShards).toBeGreaterThan(0);
    expect(loShards).toBeLessThan(collect(hi.root, 'shard-').length);
    // 16 条主裂纹是形态定义，任何档位都不许裁。
    expect(collect(lo.root, 'crack-radial-')).toHaveLength(16);
    a.dispose();
    b.dispose();
  });

  it('dispose 清空根节点且幂等，之后 update 静默失效', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    expect(ctx.root.children.length).toBeGreaterThan(0);
    stage.dispose();
    expect(ctx.root.children).toHaveLength(0);
    expect(() => stage.dispose()).not.toThrow();
    expect(() => stage.update(0.5, 775, 'cinematic')).not.toThrow();
  });
});
