import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import '../overlay/cg-scenes/cg-vinyl';
import { resolveScene } from '../overlay/cg-scene-registry';
import {
  ARM_LENGTH,
  ARM_PIVOT_X,
  ARM_PIVOT_Y,
  GROOVE_TURNS,
  TRACK_INNER,
  TRACK_OUTER,
  VINYL_ACT1_END,
  VINYL_ACT2_END,
  VINYL_DURATION_MS,
  discAngle,
  discOmega,
  dustBurst,
  grooveAngleAt,
  stylusArmAngle,
  stylusEngaged,
  stylusRadius,
  trackGlow,
} from '../overlay/cg-scenes/vinyl-groove';
import { SHADOW_LAYERS } from '../overlay/cg-scenes/vinyl-parts';
import { createDustLayer } from '../overlay/cg-scenes/vinyl-dust';
import { createSceneResources } from '../overlay/cg-scene-kit';
import { makeSceneCtx, names, node, nodes, uniformOf } from './cg-scene-harness';
import type { CgStage, CgStageContext } from '../overlay/cg-scene';
import type { EffectQuality } from '../shared/config';

/** 规格 §4.2 场景 40 的 8 个元素的具名节点（音尘由 quarks 承载，锚点观测）。 */
const NAMED_ELEMENTS = [
  'vinyl-disc',      // ①唱片 mesh（②盘面纹路是它的着色）
  'stylus-arm',      // ③唱针（唱臂支点）
  'stylus-tip',      // ③针尖
  'track-glow',      // ④音轨光流
  'spin-blur',       // ⑤转速视觉
  'dust-anchor',     // ⑥音尘（发射锚点）
  'stage-lamp',      // ⑦灯语
  'spin-shadow-0',   // ⑧旋转影
];

function build(overrides: Partial<CgStageContext> = {}): { stage: CgStage; ctx: CgStageContext } {
  const scene = resolveScene('vinyl');
  if (!scene) throw new Error('vinyl 场景未注册');
  const ctx = makeSceneCtx(overrides);
  return { stage: scene.create(ctx), ctx };
}

/** vinyl 时长 1900ms。 */
function at(stage: CgStage, t: number, quality: EffectQuality = 'cinematic'): void {
  stage.update(t, t * VINYL_DURATION_MS, quality);
}

/** 精确正则收集：前缀撞车会让断言测错对象。 */
function collectExact(root: THREE.Object3D, prefix: string): THREE.Object3D[] {
  const re = new RegExp(`^${prefix}-\\d+$`);
  return nodes(root).filter((o) => re.test(o.name));
}

describe('场景 40 vinyl（黑胶）', () => {
  it('注册项声明规格的 8 个元素与独立签名', () => {
    const scene = resolveScene('vinyl');
    expect(scene).not.toBeNull();
    expect(scene!.config.elements).toHaveLength(8);
    expect(scene!.config.elements).toEqual([
      '唱片 mesh', '盘面纹路', '唱针', '音轨光流', '转速视觉', '音尘', '灯语', '旋转影',
    ]);
    expect(scene!.config.signature).toContain('旋转载体');
    expect(scene!.config.preset).toBe('groove');
  });

  it('八个元素全部建出具名节点', () => {
    const { stage, ctx } = build();
    at(stage, 0.5);
    const built = names(ctx.root);
    for (const name of NAMED_ELEMENTS) {
      expect(built, `缺少元素节点 ${name}`).toContain(name);
    }
    stage.dispose();
  });

  it('旋转影三层都挂上了场景树', () => {
    const { stage, ctx } = build();
    at(stage, 0.5);
    expect(collectExact(ctx.root, 'spin-shadow')).toHaveLength(SHADOW_LAYERS);
    stage.dispose();
  });

  it('②盘面纹路：圈数是密度载体，且送进了盘面与光流两张材质', () => {
    // 上面只验了节点在场：把 GROOVE_TURNS 改成 1，纹路从 26 圈塌成一圈，
    // 规格元素②的密度载体已毁而 26 项断言全绿（实测盲区）。
    // 螺旋槽必须密到能读成「纹路」，不是几条同心线。
    expect(GROOVE_TURNS).toBeGreaterThan(12);
    const { stage, ctx } = build();
    at(stage, 0.5);
    // 盘面与音轨光流共用同一条螺线，两处 uTurns 必须都等于它——
    // 只对一处会让光流沿着另一条槽走。
    expect(uniformOf(node(ctx.root, 'vinyl-disc')!, 'uTurns')).toBe(GROOVE_TURNS);
    expect(uniformOf(node(ctx.root, 'track-glow')!, 'uTurns')).toBe(GROOVE_TURNS);
    // 螺线的角度跨度随圈数走：26 圈意味着从外圈到内圈转过 26×2π。
    expect(grooveAngleAt(TRACK_INNER)).toBeCloseTo(Math.PI * 2 * GROOVE_TURNS, 10);
    expect(grooveAngleAt(TRACK_OUTER)).toBe(0);
    stage.dispose();
  });

  it('⑦灯语整场发亮，且第三幕随停转收暗', () => {
    // 把 uIntensity 写成 0，规格元素⑦整个不亮而 26 项断言全绿（实测盲区）：
    // 原来只查了 stage-lamp 节点在场，没查它到底亮不亮。
    const { stage, ctx } = build();
    const lit: number[] = [];
    for (const t of [0.05, 0.3, 0.6, VINYL_ACT2_END]) {
      at(stage, t);
      const v = uniformOf(node(ctx.root, 'stage-lamp')!, 'uIntensity');
      expect(v, `t=${t} 灯语未点亮`).toBeGreaterThan(0.1);
      lit.push(v);
    }
    // 前两幕灯光稳定（舞台灯不闪）。
    expect(Math.max(...lit) - Math.min(...lit)).toBeLessThan(1e-9);
    // 第三幕随惰行收暗：曲终灯暗，与转速同步退场。
    at(stage, 1);
    const end = uniformOf(node(ctx.root, 'stage-lamp')!, 'uIntensity');
    expect(end).toBeLessThan(lit[0] * 0.7);
    expect(end).toBeGreaterThan(0);
    stage.dispose();
  });

  it('三幕切分点符合规格（380ms / 1560ms 于 1900ms）', () => {
    expect(VINYL_DURATION_MS).toBe(1900);
    expect(VINYL_ACT1_END).toBeCloseTo(380 / 1900, 10);
    expect(VINYL_ACT2_END).toBeCloseTo(1560 / 1900, 10);
  });

  // ── 签名：唱针半径单向内移 ──────────────────────────────────────

  it('签名·单向内移：唱针半径整场严格单减（黑胶从外圈往内圈播放）', () => {
    // 这是本场景区别于「来回摆动的唱针」的唯一可测内涵——后者是搜索
    // 而非播放，读不出连续音轨。
    let prev = Infinity;
    for (let i = 0; i <= 200; i += 1) {
      const r = stylusRadius(i / 200);
      expect(r, `t=${(i / 200).toFixed(3)} 处半径回升`).toBeLessThanOrEqual(prev + 1e-12);
      prev = r;
    }
    // 且净内移幅度显著（否则一支几乎不动的针也满足单减）。
    expect(stylusRadius(0) - stylusRadius(1)).toBeGreaterThan(0.6);
  });

  it('签名·单向内移：落针前针在盘外，播放期落在音轨内', () => {
    // 第一幕初针悬在盘外缘之外。
    expect(stylusRadius(0)).toBeGreaterThan(TRACK_OUTER);
    expect(stylusEngaged(0)).toBe(false);
    // 第一幕末刚好落到音轨起点。
    expect(stylusRadius(VINYL_ACT1_END)).toBeCloseTo(TRACK_OUTER, 10);
    expect(stylusEngaged(VINYL_ACT1_END)).toBe(true);
    // 播放期始终在音轨范围内。
    for (const t of [0.3, 0.5, 0.7, VINYL_ACT2_END]) {
      const r = stylusRadius(t);
      expect(r).toBeLessThanOrEqual(TRACK_OUTER + 1e-9);
      expect(r).toBeGreaterThanOrEqual(TRACK_INNER - 1e-9);
    }
  });

  it('签名·单向内移：第三幕停在内圈不再动（唱完了）', () => {
    expect(stylusRadius(VINYL_ACT2_END)).toBeCloseTo(TRACK_INNER, 10);
    expect(stylusRadius(1)).toBeCloseTo(TRACK_INNER, 10);
  });

  it('签名·唱臂与半径同源：摆角由余弦定理反解，针尖恰落在声明半径上', () => {
    // 唱臂是绕**偏置支点**转的刚体，半径与摆角是余弦定理关系而非线性
     // 映射。写成线性会让针尖脱离它自己声称的半径（实测 0.744 vs 声明 0.92）。
    for (const t of [0.05, 0.2, 0.45, 0.7, 0.95]) {
      const a = stylusArmAngle(t);
      // 针尖 = 支点 - (cos a, sin a)·臂长，到盘心的距离必须等于声明半径。
      const tx = ARM_PIVOT_X - Math.cos(a) * ARM_LENGTH;
      const ty = ARM_PIVOT_Y - Math.sin(a) * ARM_LENGTH;
      expect(Math.hypot(tx, ty), `t=${t} 摆角与半径不自洽`).toBeCloseTo(stylusRadius(t), 10);
    }
    // 摆角随播放严格单减（臂从盘外缘往盘心收，绝对方向角变小）。
    let prev = Infinity;
    for (let i = 0; i <= 40; i += 1) {
      const a = stylusArmAngle(i / 40);
      expect(a).toBeLessThanOrEqual(prev + 1e-12);
      prev = a;
    }
    // 且摆幅可观（否则一支几乎不动的臂也满足单减）。
    expect(stylusArmAngle(0) - stylusArmAngle(1)).toBeGreaterThan(0.5);
  });

  it('签名·针尖实际落点与声明半径一致（唱臂几何自洽）', () => {
    // 上面几条都在纯函数层。若编排层的针尖坐标算错（臂长、方向、支点），
    // 声明的半径与画面上的位置就会脱钩，而纯函数断言照样全绿。
    const { stage, ctx } = build();
    for (const t of [VINYL_ACT1_END, 0.5, 0.9]) {
      at(stage, t);
      const pivot = node(ctx.root, 'stylus-arm')!;
      const tip = node(ctx.root, 'stylus-tip')!;
      const world = tip.getWorldPosition(new THREE.Vector3());
      const group = pivot.parent!;
      const origin = group.getWorldPosition(new THREE.Vector3());
      const r = Math.hypot(world.x - origin.x, world.y - origin.y);
      const short = Math.min(ctx.width, ctx.height);
      const discR = short * 0.34;
      // 针尖到盘心的距离 = 声明半径 × 盘半径。
      expect(r / discR, `t=${t} 针尖半径与声明不符`).toBeCloseTo(stylusRadius(t), 4);
    }
    stage.dispose();
  });

  // ── 互动①：光流锚在针尖 ────────────────────────────────────────

  it('互动①：音轨光流的高亮半径恒等于唱针半径（同一个量的两次使用）', () => {
    const { stage, ctx } = build();
    for (const t of [0.05, VINYL_ACT1_END, 0.4, 0.6, 0.8, 0.95]) {
      at(stage, t);
      expect(uniformOf(node(ctx.root, 'track-glow')!, 'uRadius')).toBeCloseTo(stylusRadius(t), 10);
    }
    stage.dispose();
  });

  it('互动①：半径在场景中确实迁移（同源断言才不被常量满足）', () => {
    const { stage, ctx } = build();
    const rs: number[] = [];
    for (let i = 0; i <= 20; i += 1) {
      at(stage, i / 20);
      rs.push(uniformOf(node(ctx.root, 'track-glow')!, 'uRadius'));
    }
    expect(Math.max(...rs) - Math.min(...rs)).toBeGreaterThan(0.6);
    stage.dispose();
  });

  it('互动①：未落针时光流恒为零（没在读取就没有光流）', () => {
    const { stage, ctx } = build();
    for (const t of [0, 0.05, VINYL_ACT1_END * 0.5, VINYL_ACT1_END * 0.9]) {
      at(stage, t);
      expect(stylusEngaged(t), `t=${t} 应未落针`).toBe(false);
      expect(uniformOf(node(ctx.root, 'track-glow')!, 'uGlow')).toBe(0);
    }
    // 落针后立刻有光流。
    at(stage, VINYL_ACT1_END + 0.02);
    expect(uniformOf(node(ctx.root, 'track-glow')!, 'uGlow')).toBeGreaterThan(0.5);
    stage.dispose();
  });

  it('互动①：光流强度读角速度，与转速视觉同源', () => {
    const { stage, ctx } = build();
    for (const t of [0.3, 0.5, 0.8, 0.9, 0.98]) {
      at(stage, t);
      const glow = uniformOf(node(ctx.root, 'track-glow')!, 'uGlow');
      const omega = uniformOf(node(ctx.root, 'spin-blur')!, 'uOmega');
      expect(glow).toBeCloseTo(trackGlow(t), 10);
      expect(omega).toBeCloseTo(discOmega(t), 10);
      // 播放期满速、第三幕同步衰减：两者比值恒定。
      if (omega > 0) expect(glow).toBeCloseTo(omega / (Math.PI * 2 * 1.85), 6);
    }
    stage.dispose();
  });

  // ── 互动②：音尘由针犁起 ────────────────────────────────────────

  it('互动②：音尘发射点跟着针尖走（不是屏心固定喷）', () => {
    const { stage, ctx } = build();
    const positions: THREE.Vector3[] = [];
    for (const t of [VINYL_ACT1_END + 0.02, 0.5, 0.75]) {
      at(stage, t);
      const anchor = node(ctx.root, 'dust-anchor')!;
      const tip = node(ctx.root, 'stylus-tip')!;
      const anchorWorld = anchor.getWorldPosition(new THREE.Vector3());
      const tipWorld = tip.getWorldPosition(new THREE.Vector3());
      expect(anchorWorld.x, `t=${t} 尘源与针尖脱钩`).toBeCloseTo(tipWorld.x, 4);
      expect(anchorWorld.y, `t=${t} 尘源与针尖脱钩`).toBeCloseTo(tipWorld.y, 4);
      positions.push(anchorWorld.clone());
    }
    // 尘源确实在迁移（否则两个静止点也满足同位）。
    const span = Math.max(...positions.map((p) => Math.hypot(p.x, p.y)))
      - Math.min(...positions.map((p) => Math.hypot(p.x, p.y)));
    expect(span).toBeGreaterThan(10);
    stage.dispose();
  });

  it('互动②：观测锚点与真正的 emitter 逐帧同位（代理不得与真身脱钩）', () => {
    // `dust-anchor` 只是观测代理——quarks 的 emitter 会被 BatchedRenderer
    // 从场景树摘走，按名字查不到。代理一旦与真身脱钩，上面的位置断言
    // 就都在验证一个装饰物。
    const ctx = makeSceneCtx();
    const res = createSceneResources(ctx.root, ctx.origin, 'vinyl-fidelity-probe');
    const dust = createDustLayer(res, ctx, Math.min(ctx.width, ctx.height));
    const xs: number[] = [];
    for (let i = 1; i <= 5; i += 1) {
      const tip = new THREE.Vector3(i * 40, i * -12, 0);
      dust.advance(0.5, 1 / 60, tip);
      const real = dust.emitterPosition;
      expect(real, 'quarks 音尘系统未建立').not.toBeNull();
      expect(real!.x).toBeCloseTo(dust.anchor.position.x, 10);
      expect(real!.y).toBeCloseTo(dust.anchor.position.y, 10);
      expect(real!.x).toBeCloseTo(tip.x, 10);
      xs.push(real!.x);
    }
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(100);
    dust.dispose();
    res.dispose();
  });

  it('互动②：落针那一下尘最强，之后指数退去', () => {
    expect(dustBurst(VINYL_ACT1_END * 0.5)).toBe(0);
    expect(dustBurst(VINYL_ACT1_END)).toBeCloseTo(1, 10);
    // 单调递减且确实退到很小。
    let prev = Infinity;
    for (let i = 0; i <= 40; i += 1) {
      const t = VINYL_ACT1_END + (1 - VINYL_ACT1_END) * (i / 40);
      const v = dustBurst(t);
      expect(v).toBeLessThanOrEqual(prev + 1e-12);
      prev = v;
    }
    expect(dustBurst(1)).toBeLessThan(0.01);
  });

  // ── 转盘运动学：原函数而非逐帧累加 ──────────────────────────────

  it('转角是角速度的原函数（导数一致，非两条各自调的曲线）', () => {
    // discAngle 若与 discOmega 脱钩，「转速视觉」读的就不是盘面实际转速。
    const h = 1e-5;
    for (const t of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const numeric = (discAngle(t + h) - discAngle(t - h)) / (2 * h);
      // discAngle 以整幕归一化 t 为自变量，omega 是每秒弧度，需换算。
      const expected = discOmega(t) * (VINYL_DURATION_MS / 1000);
      expect(numeric, `t=${t} 处转角导数与角速度不符`).toBeCloseTo(expected, 2);
    }
  });

  it('转角整场严格单增（盘只朝一个方向转）', () => {
    let prev = -Infinity;
    for (let i = 0; i <= 200; i += 1) {
      const a = discAngle(i / 200);
      expect(a).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = a;
    }
    // 总转角由三段积分反推而非手写：满速匀转的总量扣掉起速段与惰行段
    // 各损失的一半幕长。写死圈数会在改幕长时失效，也读不出为什么是这个值。
    const full = Math.PI * 2 * 1.85 * (VINYL_DURATION_MS / 1000);
    const lost = full * (VINYL_ACT1_END + (1 - VINYL_ACT2_END)) * 0.5;
    expect(discAngle(1)).toBeCloseTo(full - lost, 10);
    // 且确实转了两圈以上（黑胶播放期必须有可见的多圈旋转）。
    expect(discAngle(1)).toBeGreaterThan(Math.PI * 2 * 2);
  });

  it('起速与惰行：第一幕角速度从零升起，第三幕退回零', () => {
    expect(discOmega(0)).toBe(0);
    expect(discOmega(VINYL_ACT1_END)).toBeCloseTo(Math.PI * 2 * 1.85, 10);
    // 播放期匀速。
    expect(discOmega(0.5)).toBeCloseTo(discOmega(0.7), 10);
    expect(discOmega(1)).toBeCloseTo(0, 10);
  });

  it('稀疏与密集 update 在同一 t 得到同一帧（闭式求值，不逐帧累加）', () => {
    const sparse = build();
    at(sparse.stage, 0.62);
    const sparseAngle = node(sparse.ctx.root, 'vinyl-disc')!.rotation.z;
    const sparseR = uniformOf(node(sparse.ctx.root, 'track-glow')!, 'uRadius');
    sparse.stage.dispose();

    const dense = build();
    for (let i = 1; i <= 62; i += 1) at(dense.stage, i / 100);
    const denseAngle = node(dense.ctx.root, 'vinyl-disc')!.rotation.z;
    const denseR = uniformOf(node(dense.ctx.root, 'track-glow')!, 'uRadius');
    dense.stage.dispose();

    expect(denseAngle).toBeCloseTo(sparseAngle, 10);
    expect(denseR).toBeCloseTo(sparseR, 10);
  });

  // ── 螺旋槽：纹路与光流同源 ──────────────────────────────────────

  it('螺旋槽角度随半径内移严格增（阿基米德螺线，圈数即 GROOVE_TURNS）', () => {
    expect(grooveAngleAt(TRACK_OUTER)).toBeCloseTo(0, 10);
    expect(grooveAngleAt(TRACK_INNER)).toBeCloseTo(Math.PI * 2 * GROOVE_TURNS, 10);
    let prev = -Infinity;
    for (let i = 0; i <= 40; i += 1) {
      const r = TRACK_OUTER + (TRACK_INNER - TRACK_OUTER) * (i / 40);
      const a = grooveAngleAt(r);
      expect(a).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = a;
    }
  });

  it('纹路与光流共用同一圈数 uniform（两处写死会让光流从槽上滑出）', () => {
    const { stage, ctx } = build();
    at(stage, 0.5);
    expect(uniformOf(node(ctx.root, 'vinyl-disc')!, 'uTurns')).toBe(GROOVE_TURNS);
    expect(uniformOf(node(ctx.root, 'track-glow')!, 'uTurns')).toBe(GROOVE_TURNS);
    // 且槽相位随盘面转角一起转，纹路不会浮在盘上不动。
    const a1 = uniformOf(node(ctx.root, 'vinyl-disc')!, 'uAngle');
    at(stage, 0.7);
    const a2 = uniformOf(node(ctx.root, 'vinyl-disc')!, 'uAngle');
    expect(a2).toBeGreaterThan(a1);
    stage.dispose();
  });

  // ── 降档与释放 ──────────────────────────────────────────────────

  it('降档只减粒子密度，八个元素一个不少', () => {
    for (const quality of ['cinematic', 'low'] as const) {
      const { stage, ctx } = build({ quality });
      at(stage, 0.5, quality);
      const built = names(ctx.root);
      for (const name of NAMED_ELEMENTS) {
        expect(built, `${quality} 档缺少 ${name}`).toContain(name);
      }
      // 旋转影层数是签名载体，不随档位削减。
      expect(collectExact(ctx.root, 'spin-shadow')).toHaveLength(SHADOW_LAYERS);
      stage.dispose();
    }
  });

  it('降档确实减密度：低档音尘发射率严格低于电影级', () => {
    // 上面那条只验「元素一个不少」，「只减密度」没有 expect 覆盖——
    // 把 scaledCount 去掉照样全绿。音尘的发射率每帧重设（跟随 dustBurst），
    // 必须单独验它随档位缩放。
    const rateAt = (quality: EffectQuality): number => {
      const ctx = makeSceneCtx({ quality });
      const res = createSceneResources(ctx.root, ctx.origin, 'vinyl-rate-probe');
      const dust = createDustLayer(res, ctx, Math.min(ctx.width, ctx.height));
      dust.advance(VINYL_ACT1_END, 1 / 60, new THREE.Vector3(0, 0, 0));
      const rate = dust.emissionRate;
      dust.dispose();
      res.dispose();
      return rate;
    };
    const cinematic = rateAt('cinematic');
    const low = rateAt('low');
    expect(cinematic).toBeGreaterThan(0);
    expect(low).toBeGreaterThan(0);
    expect(low).toBeLessThan(cinematic);
  });

  it('dispose 摘净场景树且嵌套容器不残留子节点', () => {
    const { stage, ctx } = build();
    at(stage, 0.5);
    // 必须在 dispose 之前收集容器引用：dispose 会把整个 group 从 root
    // 摘走，之后遍历 root 找不到残留容器（thunder 场景踩过这个坑）。
    const containers: THREE.Object3D[] = [];
    ctx.root.traverse((o) => { if (o.children.length > 0) containers.push(o); });
    expect(containers.length).toBeGreaterThan(1);

    stage.dispose();
    expect(ctx.root.children).toHaveLength(0);
    for (const c of containers) {
      if (c === ctx.root) continue;
      expect(c.children, `${c.name || c.type} 残留子节点`).toHaveLength(0);
    }
  });

  it('dispose 后 update 静默失效', () => {
    const { stage } = build();
    at(stage, 0.4);
    stage.dispose();
    expect(() => at(stage, 0.8)).not.toThrow();
    stage.dispose();
  });
});
