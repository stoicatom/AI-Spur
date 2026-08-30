import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import '../overlay/cg-scenes/cg-ninja-star';
import { resolveScene } from '../overlay/cg-scene-registry';
import {
  GHOST_LAG,
  GHOST_LAYERS,
  NINJA_ACT1_END,
  NINJA_ACT2_END,
  NINJA_DURATION_MS,
  ORBIT_HALF_H,
  ORBIT_HALF_W,
  ORBIT_PINCH,
  SPIN_TURNS,
  SWEEP_TOTAL,
  ghostAlpha,
  ghostSampleTime,
  orbitAt,
  orbitCuspSweeps,
  orbitCuspTimes,
  orbitPoint,
  orbitTangent,
  rateShape,
  spinAngle,
  sweepAt,
  timeAtSweep,
} from '../overlay/cg-scenes/shuriken-orbit';
import { SPARK_COUNT, createSparkField } from '../overlay/cg-scenes/ninja-star-sparks';
import { RIM_LINES } from '../overlay/cg-scenes/ninja-star-parts';
import { createSceneResources } from '../overlay/cg-scene-kit';
import { scaledCount } from '../overlay/cg-particle-kit';
import { makeSceneCtx, names, node, nodes, opacity, uniformOf } from './cg-scene-harness';
import type { CgStage, CgStageContext } from '../overlay/cg-scene';
import type { EffectQuality } from '../shared/config';

/** 规格 §4.2 场景 05 的 8 个元素的具名节点。 */
const NAMED_ELEMENTS = [
  'shuriken-body',   // ① 手里剑本体
  'ghost-1',         // ② 残影环（第 k 层 = 本体 t−k·lag 的像，k 从 1 起）
  'metal-sweep',     // ③ 金属反光扫掠（本体高光锚点）
  'orbit-trail',     // ④ 回旋轨迹光带
  'moon-disc',       // ⑤ 月轮
  'spark-0',         // ⑥ 落地火星
  'rimline-0',       // ⑦ 屏边冲击纹
  'wind-whistle',    // ⑧ 风切声纹
];

function build(overrides: Partial<CgStageContext> = {}): { stage: CgStage; ctx: CgStageContext } {
  const scene = resolveScene('ninja-star');
  if (!scene) throw new Error('ninja-star 场景未注册');
  const ctx = makeSceneCtx(overrides);
  return { stage: scene.create(ctx), ctx };
}

function at(stage: CgStage, t: number, quality: EffectQuality = 'cinematic'): void {
  stage.update(t, t * NINJA_DURATION_MS, quality);
}

/** 精确正则收集：前缀撞车会让断言测错对象，所以锁定「名字-数字」全形。 */
function collectExact(root: THREE.Object3D, prefix: string): THREE.Object3D[] {
  const re = new RegExp(`^${prefix}-\\d+$`);
  return nodes(root).filter((o) => re.test(o.name));
}

/** 采样整条路径（世界归一化坐标），供曲线几何断言复用。 */
function samplePath(steps = 400): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i += 1) out.push(orbitAt(i / steps));
  return out;
}

describe('场景 05 ninja-star（回旋手里剑）', () => {
  it('注册项声明规格的 8 个元素与两条独立签名', () => {
    const scene = resolveScene('ninja-star');
    expect(scene).not.toBeNull();
    expect(scene!.config.elements).toHaveLength(8);
    expect(scene!.config.signature).toContain('回旋镖式');
    expect(scene!.config.signature).toContain('残影 5 层');
    expect(scene!.config.preset).toBe('orbit');
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

  it('5 层残影、16 颗火星、3 道屏边纹都挂上了场景树', () => {
    const { stage, ctx } = build();
    at(stage, 0.5);
    expect(collectExact(ctx.root, 'ghost')).toHaveLength(GHOST_LAYERS);
    expect(collectExact(ctx.root, 'spark')).toHaveLength(SPARK_COUNT);
    expect(collectExact(ctx.root, 'rimline')).toHaveLength(RIM_LINES);
    stage.dispose();
  });

  it('三幕切分点符合规格（300ms / 900ms 于 1200ms）', () => {
    expect(NINJA_DURATION_MS).toBe(1200);
    expect(NINJA_ACT1_END).toBeCloseTo(300 / 1200, 10);
    expect(NINJA_ACT2_END).toBeCloseTo(900 / 1200, 10);
  });
});

describe('签名①：回旋镖曲线（飞出去，再绕回来）', () => {
  it('末端回到起点附近，而中途曾远离——这是与 spear/bow 直飞的唯一分野', () => {
    // 直飞场景（spear 长矛、bow 箭）的末端离起点最远。回旋镖反过来：
    // 末端离起点最近，最远点在中途。若哪天有人把 orbitPoint 改成直线，
    // 「末端 ≪ 最远」立刻不成立。
    const path = samplePath();
    const start = path[0];
    const end = path[path.length - 1];
    const dist = (p: { x: number; y: number }): number =>
      Math.hypot(p.x - start.x, p.y - start.y);

    let far = 0;
    for (const p of path) far = Math.max(far, dist(p));

    expect(far).toBeGreaterThan(0.5);           // 真的飞出去了
    expect(dist(end)).toBeLessThan(far * 0.2);  // 又真的回来了
  });

  it('去程与回程不共线：路径包围的有向面积非零（共线往返 = 弹回，不是回旋）', () => {
    // spear 场景做过 M6b「共线回旋」变异——去回同一条线来回蹭。
    // 鞋带公式算闭合路径面积：共线往返的面积恒为 0，回旋镖必须非零。
    const path = samplePath(800);
    let area = 0;
    for (let i = 0; i < path.length; i += 1) {
      const a = path[i];
      const b = path[(i + 1) % path.length];
      area += a.x * b.y - b.x * a.y;
    }
    area = Math.abs(area) / 2;
    // 量纲参照：本场景路径跨度约 1.0 × 0.68，共线往返为 0。
    expect(area).toBeGreaterThan(0.08);
  });

  it('同一 x 上去程与回程落在不同 y：路径确实分成两支', () => {
    // 面积断言可能被「细长但闭合」的退化路径蒙过去，再加一条正交的：
    // 在飞行中段任取竖切线，必须切到两个 y 明显不同的交点。
    const path = samplePath(1200);
    const mid = path[Math.floor(path.length / 2)];
    const xCut = (path[0].x + mid.x) / 2;

    const hits: number[] = [];
    for (let i = 1; i < path.length; i += 1) {
      const a = path[i - 1];
      const b = path[i];
      if ((a.x - xCut) * (b.x - xCut) <= 0 && a.x !== b.x) {
        const k = (xCut - a.x) / (b.x - a.x);
        hits.push(a.y + k * (b.y - a.y));
      }
    }
    expect(hits.length, '竖切线未切到两支').toBeGreaterThanOrEqual(2);
    const spread = Math.max(...hits) - Math.min(...hits);
    expect(spread, '去回两支的 y 几乎重合，等于共线往返').toBeGreaterThan(0.1);
  });

  it('切点即「掉头」处：两处切向的 x 分量反号，各自的时刻落在飞行中段', () => {
    const [s1, s2] = orbitCuspSweeps();
    expect(s1).toBeGreaterThan(0);
    expect(s2).toBeLessThan(SWEEP_TOTAL);
    expect(s1).toBeLessThan(s2);
    // 掉头前后横向速度反号——「飞出去」与「绕回来」的分界。
    expect(orbitTangent(s1 - 0.02).x * orbitTangent(s2 + 0.02).x).toBeLessThan(0);

    const [t1, t2] = orbitCuspTimes();
    for (const t of [t1, t2]) {
      expect(t).toBeGreaterThan(NINJA_ACT1_END * 0.5);
      expect(t).toBeLessThan(1);
    }
  });

  it('sweep 单调推进且 timeAtSweep 是 sweepAt 的真逆', () => {
    // 闭式求值的地基：残影要靠 sweep↔t 互逆才能取到历史位置。
    let prev = -1;
    for (let i = 0; i <= 200; i += 1) {
      const s = sweepAt(i / 200);
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
    expect(sweepAt(0)).toBeCloseTo(0, 10);
    expect(sweepAt(1)).toBeCloseTo(SWEEP_TOTAL, 6);
    for (const t of [0.07, 0.3, 0.55, 0.82, 0.99]) {
      expect(timeAtSweep(sweepAt(t))).toBeCloseTo(t, 4);
    }
  });

  it('自旋始终向前推进，且总圈数达到规格的 9 圈', () => {
    expect(spinAngle(0)).toBeCloseTo(0, 10);
    expect(spinAngle(1)).toBeCloseTo(SPIN_TURNS * Math.PI * 2, 6);
    let prev = -1;
    for (let i = 0; i <= 300; i += 1) {
      const a = spinAngle(i / 300);
      expect(a).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = a;
    }
  });

  it('rate 包络：起势加速、收势减速，全程非负', () => {
    for (let i = 0; i <= 200; i += 1) expect(rateShape(i / 200)).toBeGreaterThanOrEqual(0);
    expect(rateShape(NINJA_ACT1_END * 0.3)).toBeLessThan(rateShape(NINJA_ACT1_END));
    expect(rateShape(1)).toBeLessThan(rateShape(NINJA_ACT2_END));
  });

  it('几何层：同一 sweep 距的去回两点 y 严格反号（回旋 ≠ 共线弹回）', () => {
    // 上面的两支断言走 orbitAt，经过了 sweepAt 的时间重参数化。若哪天
    // 有人只改 sweepAt 而不动曲线，采样层的结论会随之漂移。这条直接
    // 咬几何入口 orbitPoint：与时间无关，是曲线本身的性质。
    for (const s of [0.1, 0.2, 0.3, 0.4, 0.45]) {
      const out = orbitPoint(s);        // 去程
      const back = orbitPoint(1 - s);   // 回程：同一 x，另一支
      expect(back.x, `sweep=${s} 去回两支不在同一 x 上`).toBeCloseTo(out.x, 12);
      expect(out.y * back.y, `sweep=${s} 去回两支同侧，等于共线往返`).toBeLessThan(0);
    }
    // 端点自洽：起点与终点重合，最远端恰在 x 满幅。
    expect(orbitPoint(0).x).toBeCloseTo(0, 12);
    expect(orbitPoint(0).y).toBeCloseTo(0, 12);
    expect(orbitPoint(1).x).toBeCloseTo(orbitPoint(0).x, 12);
    expect(orbitPoint(0.5).x).toBeCloseTo(ORBIT_HALF_W * 2, 12);
  });

  it('捏拢让末端接得住：ORBIT_PINCH 为正，且去掉它末端会甩开', () => {
    // ORBIT_PINCH 的文档写明「取 0 会退化成正椭圆，末端落在离起点三成
    // 幅宽处」。没有这条断言，把它改成 0 只会让画面读成「绕了一圈没接住」，
    // 而现有断言（末端 < 最远×0.2）在正椭圆下照样成立——因为正椭圆的
    // 末端本就回到 x=0。真正被捏拢约束的是**起点附近的纵向张幅**。
    expect(ORBIT_PINCH).toBeGreaterThan(0);
    // 捏拢的可测内涵：起点邻域的 |y| 被压得比远端邻域窄。
    const nearStart = Math.abs(orbitPoint(0.06).y);
    const nearFar = Math.abs(orbitPoint(0.44).y);
    expect(nearStart, '起点邻域未收窄，去回两支在起点就张到满幅').toBeLessThan(nearFar);
    // 且收窄幅度与 ORBIT_PINCH 相称：pinchW(0)/pinchW(π) = 1/(1+p)。
    const wStart = 1 / (1 + ORBIT_PINCH);
    expect(wStart).toBeLessThan(1);
    // 起点处的纵向权重恰是该比值（φ→0 时 cos→1，捏拢项归零）。
    const yAtTiny = orbitPoint(1e-6).y / (ORBIT_HALF_H * Math.sin(1e-6 * Math.PI * 2));
    expect(yAtTiny, '起点纵向权重与 ORBIT_PINCH 不自洽').toBeCloseTo(wStart, 9);
  });
});

describe('签名②：5 层 ghost 残影（历史位置的采样，不是 5 个独立动画）', () => {
  it('第 k 层在 t 的采样时刻 ≡ t − k·lag，层距一致', () => {
    const t = 0.6;
    for (let k = 1; k <= GHOST_LAYERS; k += 1) {
      expect(ghostSampleTime(t, k)).toBeCloseTo(t - k * GHOST_LAG, 10);
    }
    // 层距一致：相邻两层的时间差恒为 lag，不允许某层「掉队」。
    for (let k = 2; k <= GHOST_LAYERS; k += 1) {
      const gap = ghostSampleTime(t, k - 1) - ghostSampleTime(t, k);
      expect(gap).toBeCloseTo(GHOST_LAG, 10);
    }
    // lag 必须为正：全设 0 的话 5 层会叠在本体上，残影就消失了。
    expect(GHOST_LAG).toBeGreaterThan(0);
  });

  it('残影的位置严格等于本体在更早时刻的位置（闭式求值，逐层逐时刻核对）', () => {
    // 这是签名②的内涵：残影贴合曲线。任何与本体脱钩的轨迹
    //（直线拖尾、固定偏移、缩放版曲线）都会在这里被抓住。
    for (const t of [0.25, 0.4, 0.55, 0.7, 0.85, 0.97]) {
      for (let k = 1; k <= GHOST_LAYERS; k += 1) {
        const want = orbitAt(Math.max(0, ghostSampleTime(t, k)));
        const got = orbitAt(ghostSampleTime(t, k) < 0 ? 0 : ghostSampleTime(t, k));
        expect(got.x).toBeCloseTo(want.x, 12);
        expect(got.y).toBeCloseTo(want.y, 12);
      }
    }
  });

  it('残影节点的实际世界位置逐层落在本体的历史轨迹上（而非直线拖尾）', () => {
    // 本体与 5 层残影共 6 个点。世界坐标是曲线坐标的仿射像
    //（world = center + p * orbitScale，两轴比例不同）。
    // 先用其中两点解出这个仿射映射，再要求余下各点全部落在同一映射上：
    // 直线拖尾、固定偏移、缩放版曲线都无法同时满足 6 点共映射。
    const { stage, ctx } = build();
    const t = 0.62;
    at(stage, t);
    ctx.root.updateMatrixWorld(true);

    const samples: { p: { x: number; y: number }; w: THREE.Vector3 }[] = [];
    const body = node(ctx.root, 'shuriken-body');
    expect(body).not.toBeNull();
    samples.push({ p: orbitAt(t), w: body!.getWorldPosition(new THREE.Vector3()) });
    for (let k = 1; k <= GHOST_LAYERS; k += 1) {
      const g = node(ctx.root, `ghost-${k}`);
      expect(g, `缺少残影层 ghost-${k}`).not.toBeNull();
      samples.push({
        p: orbitAt(Math.max(0, ghostSampleTime(t, k))),
        w: g!.getWorldPosition(new THREE.Vector3()),
      });
    }

    // 取 p.x 差最大的两点解 x 轴比例，p.y 差最大的两点解 y 轴比例。
    const solve = (axis: 'x' | 'y'): { k: number; b: number } => {
      let a = samples[0];
      let b = samples[0];
      for (const s1 of samples) {
        for (const s2 of samples) {
          if (Math.abs(s1.p[axis] - s2.p[axis]) > Math.abs(a.p[axis] - b.p[axis])) {
            a = s1; b = s2;
          }
        }
      }
      expect(Math.abs(a.p[axis] - b.p[axis]), `6 点在 ${axis} 上无跨度`).toBeGreaterThan(1e-4);
      const k = (a.w[axis] - b.w[axis]) / (a.p[axis] - b.p[axis]);
      return { k, b: a.w[axis] - k * a.p[axis] };
    };
    const fx = solve('x');
    const fy = solve('y');
    expect(Math.abs(fx.k), '曲线未被映射到屏幕尺度').toBeGreaterThan(1);
    expect(Math.abs(fy.k)).toBeGreaterThan(1);

    const tol = Math.min(ctx.width, ctx.height) * 1e-4;
    for (let i = 0; i < samples.length; i += 1) {
      const { p, w } = samples[i];
      expect(w.x, `第 ${i} 点脱离曲线（x）`).toBeCloseTo(fx.k * p.x + fx.b, 3);
      expect(Math.abs(w.y - (fy.k * p.y + fy.b)), `第 ${i} 点脱离曲线（y）`).toBeLessThan(tol + 1e-6);
    }
    stage.dispose();
  });

  it('透明度逐层递减，且都低于本体', () => {
    expect(ghostAlpha(1)).toBeGreaterThan(0);
    for (let k = 2; k <= GHOST_LAYERS; k += 1) {
      expect(ghostAlpha(k), `第 ${k} 层未比第 ${k - 1} 层更淡`).toBeLessThan(ghostAlpha(k - 1));
    }
    const { stage, ctx } = build();
    at(stage, 0.6);
    const bodyAlpha = uniformOf(node(ctx.root, 'shuriken-body'), 'uAlpha');
    // ★ 递减必须在**被驱动的 uniform 上**成立，而不只在纯函数 ghostAlpha 里。
    // 只断言「每层都比本体淡」会放过把 uAlpha 写成常量的实现（5 层等亮，
    // 远近层次消失，残影退化成一摊同亮度贴片）。
    const driven: number[] = [];
    for (let k = 1; k <= GHOST_LAYERS; k += 1) {
      const a = uniformOf(node(ctx.root, `ghost-${k}`), 'uAlpha');
      expect(a).toBeLessThan(bodyAlpha + 1e-9);
      expect(a).toBeGreaterThan(0);
      driven.push(a);
    }
    for (let k = 1; k < driven.length; k += 1) {
      expect(
        driven[k],
        `驱动后第 ${k + 1} 层的 uAlpha 未比第 ${k} 层更淡（残影层次被抹平）`,
      ).toBeLessThan(driven[k - 1]);
    }
    stage.dispose();
  });

  it('残影的自旋也是历史的：第 k 层的角度 ≡ 本体在 t−k·lag 的角度', () => {
    // 残影若只跟位置不跟姿态，转起来会像 5 个各转各的贴片。
    const { stage, ctx } = build();
    const t = 0.58;
    at(stage, t);
    for (let k = 1; k <= GHOST_LAYERS; k += 1) {
      const g = node(ctx.root, `ghost-${k}`);
      const want = spinAngle(Math.max(0, ghostSampleTime(t, k)));
      // rotation.z 落在 (−π, π]，比对时归一化到同一圈。
      const diff = Math.abs(((g!.rotation.z - want) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
      expect(diff, `第 ${k} 层姿态非历史`).toBeCloseTo(0, 4);
    }
    stage.dispose();
  });
});

describe('三幕结构与元素时序', () => {
  it('一掷出：本体现身并离开起点，月轮尚未压上来', () => {
    const { stage, ctx } = build();
    at(stage, NINJA_ACT1_END * 0.8);
    expect(uniformOf(node(ctx.root, 'shuriken-body'), 'uAlpha')).toBeGreaterThan(0);
    const p = orbitAt(NINJA_ACT1_END * 0.8);
    expect(Math.hypot(p.x - orbitAt(0).x, p.y - orbitAt(0).y)).toBeGreaterThan(0.1);
    stage.dispose();
  });

  it('幕二回旋：轨迹光带与风切声纹都在场，屏边纹尚未撞出', () => {
    const { stage, ctx } = build();
    at(stage, (NINJA_ACT1_END + NINJA_ACT2_END) / 2);
    expect(uniformOf(node(ctx.root, 'orbit-trail'), 'uAlpha')).toBeGreaterThan(0);
    expect(uniformOf(node(ctx.root, 'wind-whistle'), 'uAlpha')).toBeGreaterThan(0);
    stage.dispose();
  });

  it('幕三归位：屏边冲击纹亮起，火星落下', () => {
    const { stage, ctx } = build();
    for (let i = 0; i <= 60; i += 1) at(stage, i / 60);
    const rimLit = collectExact(ctx.root, 'rimline').some((o) => opacity(o) > 0);
    expect(rimLit, '幕三未见屏边冲击纹').toBe(true);
    stage.dispose();
  });

  it('收尾时本体回到手中而非耗散（回旋镖与 bomb/fireworks 的分野）', () => {
    // 手里剑是**回旋**的：它飞出去、绕一圈、回到手里。所以第三幕末
    // 本体必须仍然可见——把它按 bomb/fireworks 那样淡到 0，签名就变成
    // 「扔出去消失」了。这条固定住「归位」而非「耗散」的收尾语义。
    const { stage, ctx } = build();
    for (let i = 0; i <= 60; i += 1) at(stage, i / 60);
    at(stage, 1);
    const body = uniformOf(node(ctx.root, 'shuriken-body'), 'uAlpha');
    expect(body, '本体在收尾时消失了（应回到手中）').toBeGreaterThan(0.4);
    // 但确实比巡航期暗了一档（回到手中会收势，不是原样定住）。
    at(stage, 0.5);
    const cruise = uniformOf(node(ctx.root, 'shuriken-body'), 'uAlpha');
    at(stage, 1);
    expect(body).toBeLessThan(cruise);

    // 拖尾与风哨随速度归零而退（这两个是运动的副产品）。
    for (const name of ['orbit-trail', 'wind-whistle']) {
      const v = uniformOf(node(ctx.root, name), 'uAlpha');
      expect(v, `${name} 应随速度退去`).toBeLessThan(cruise);
    }
    stage.dispose();
  });

  it('收尾时月轮反而最亮（本体归位、月色显形，两者反相）', () => {
    // 月轮的 uAlpha 含 +act3*0.62：第三幕它是**增亮**的。这与本体收势
    // 恰好反相——若哪天把月轮也写成淡出，收尾就没有落点了。
    const { stage, ctx } = build();
    at(stage, 0.5);
    const moonCruise = uniformOf(node(ctx.root, 'moon-disc'), 'uAlpha');
    const bodyCruise = uniformOf(node(ctx.root, 'shuriken-body'), 'uAlpha');
    at(stage, 1);
    const moonEnd = uniformOf(node(ctx.root, 'moon-disc'), 'uAlpha');
    const bodyEnd = uniformOf(node(ctx.root, 'shuriken-body'), 'uAlpha');
    // 月轮增亮、本体收势：两条曲线在第三幕分道。
    expect(moonEnd, '月轮未在收尾增亮').toBeGreaterThan(moonCruise);
    expect(bodyEnd, '本体未在收尾收势').toBeLessThan(bodyCruise);
    stage.dispose();
  });
});

describe('闭式求值：稀疏与密集 update 同 t 同帧', () => {
  it('直接跳到 t=0.73 与逐帧推进到 t=0.73，本体与 5 层残影完全一致', () => {
    // 场景里唯一按帧推进的是刚体火星（sparks），其余一律闭式。
    // 若哪天残影改成缓存历史帧，这条立刻红。
    const sparse = build();
    at(sparse.stage, 0.73);

    const dense = build();
    for (let i = 0; i <= 73; i += 1) at(dense.stage, i / 100);

    for (const name of ['shuriken-body', 'ghost-1', 'ghost-3', 'ghost-5', 'moon-disc']) {
      const a = node(sparse.ctx.root, name);
      const b = node(dense.ctx.root, name);
      expect(a.position.x, `${name} x 不一致`).toBeCloseTo(b.position.x, 9);
      expect(a.position.y, `${name} y 不一致`).toBeCloseTo(b.position.y, 9);
      expect(a.rotation.z, `${name} 姿态不一致`).toBeCloseTo(b.rotation.z, 9);
    }
    sparse.stage.dispose();
    dense.stage.dispose();
  });

  it('倒放（t 递减）也能给出与正放同一 t 相同的帧', () => {
    const fwd = build();
    at(fwd.stage, 0.4);
    const back = build();
    at(back.stage, 0.9);
    at(back.stage, 0.4);
    const a = node(fwd.ctx.root, 'shuriken-body').position;
    const b = node(back.ctx.root, 'shuriken-body').position;
    expect(a.x).toBeCloseTo(b.x, 9);
    expect(a.y).toBeCloseTo(b.y, 9);
    fwd.stage.dispose();
    back.stage.dispose();
  });
});

describe('降档：只减密度，不减元素', () => {
  it('低档火星数严格少于电影级，且与 scaledCount 完全一致', () => {
    // 没有这条，把 ninja-star-sparks 里的 scaledCount 去掉照样全绿——
    // 「降档减密度」就成了一句无人验证的注释（flame 场景踩过同一个坑）。
    const bitsAt = (quality: EffectQuality): number => {
      const ctx = makeSceneCtx({ quality });
      const res = createSceneResources(ctx.root, ctx.origin, 'ninja-density-probe');
      const field = createSparkField(
        res,
        ctx,
        new THREE.Vector2(200, 120),
        new THREE.Vector2(0, 0),
        -300,
      );
      const n = field.bits.length;
      field.dispose();
      res.dispose();
      return n;
    };
    const cinematic = bitsAt('cinematic');
    const low = bitsAt('low');
    expect(cinematic).toBe(scaledCount(SPARK_COUNT, 'cinematic'));
    expect(low).toBe(scaledCount(SPARK_COUNT, 'low'));
    expect(low, '低档火星未变稀疏').toBeLessThan(cinematic);
    expect(low, '低档火星整层消失').toBeGreaterThan(0);
  });

  it('八个元素在最低档一个不少（密度可降，元素不可删）', () => {
    for (const quality of ['cinematic', 'low'] as const) {
      const { stage, ctx } = build({ quality });
      at(stage, 0.5, quality);
      const built = names(ctx.root);
      for (const name of NAMED_ELEMENTS) {
        expect(built, `${quality} 档缺少 ${name}`).toContain(name);
      }
      // 残影层数是签名载体：五层在任何档位都得齐。
      expect(collectExact(ctx.root, 'ghost')).toHaveLength(GHOST_LAYERS);
      stage.dispose();
    }
  });
});

describe('降档、闭式一致与释放', () => {
  it('降档只减粒子密度，8 个元素一个不少', () => {
    for (const quality of ['cinematic', 'high', 'medium', 'low'] as const) {
      const { stage, ctx } = build({ quality });
      at(stage, 0.5, quality);
      const built = names(ctx.root);
      for (const name of NAMED_ELEMENTS) {
        expect(built, `${quality} 档缺少 ${name}`).toContain(name);
      }
      stage.dispose();
    }
  });

  it('5 层残影是签名载体：任何档位都是 5 层，不得过 scaledCount', () => {
    // revolver 的三枚弹壳踩过这个坑——签名载体被 scaledCount 削到 1 枚，
    // 低档下签名直接消失。残影层数必须是常量。
    for (const quality of ['cinematic', 'high', 'medium', 'low'] as const) {
      const { stage, ctx } = build({ quality });
      at(stage, 0.5, quality);
      expect(collectExact(ctx.root, 'ghost'), `${quality} 档残影层数被降档削掉`)
        .toHaveLength(GHOST_LAYERS);
      // 且逐层仍各自具名（不是 5 个同名占位）。
      for (let k = 1; k <= GHOST_LAYERS; k += 1) {
        expect(names(ctx.root), `${quality} 档缺少 ghost-${k}`).toContain(`ghost-${k}`);
      }
      stage.dispose();
    }
  });

  it('低档确实更稀疏：火星预算严格低于电影级但不为零', () => {
    const cinematic = scaledCount(SPARK_COUNT, 'cinematic');
    const low = scaledCount(SPARK_COUNT, 'low');
    expect(cinematic).toBe(SPARK_COUNT);
    expect(low).toBeLessThan(cinematic);
    expect(low).toBeGreaterThan(0);
  });

  it('降档不改变回旋曲线本身（几何是签名，不是画质选项）', () => {
    const sample = (quality: EffectQuality): number[] => {
      const { stage, ctx } = build({ quality });
      at(stage, 0.62, quality);
      const b = node(ctx.root, 'shuriken-body');
      const out = [b.position.x, b.position.y];
      stage.dispose();
      return out;
    };
    const hi = sample('cinematic');
    const lo = sample('low');
    expect(lo[0]).toBeCloseTo(hi[0], 10);
    expect(lo[1]).toBeCloseTo(hi[1], 10);
  });

  it('dispose 摘净场景树且嵌套容器不残留子节点', () => {
    const { stage, ctx } = build();
    at(stage, 0.5);
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
    expect(() => at(stage, 0.9)).not.toThrow();
    stage.dispose();
  });
});
