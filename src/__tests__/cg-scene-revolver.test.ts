import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import '../overlay/cg-scenes/cg-revolver';
import { resolveScene } from '../overlay/cg-scene-registry';
import {
  FLASH_PEAK_T,
  REVOLVER_ACT1_END,
  REVOLVER_ACT2_END,
  REVOLVER_DURATION_MS,
  REVOLVER_DURATION_S,
  TARGET_DELAY_T,
  cameraShake,
  coneReach,
  cylinderTurn,
  flashSpentFraction,
  muzzleFlash,
  recoilKick,
  smokeDensity,
  smokeOnsetT,
  targetBurst,
  tracerFlash,
} from '../overlay/cg-scenes/revolver-discharge';
import { CASING_COUNT, CASING_STEP, createCasingField } from '../overlay/cg-scenes/revolver-casing';
import { CYLINDER_SPARK_COUNT, SMOKE_PUFF_COUNT } from '../overlay/cg-scenes/revolver-parts';
import { createSceneResources } from '../overlay/cg-scene-kit';
import { scaledCount } from '../overlay/cg-particle-kit';
import { makeSceneCtx, names, node, nodes, opacity, uniformOf } from './cg-scene-harness';
import type { CgStage, CgStageContext } from '../overlay/cg-scene';
import type { EffectQuality } from '../shared/config';

/** 规格 §4.2 场景 34 的 8 个元素的具名节点（枪口焰由 quarks 承载，观测锚点）。 */
const NAMED_ELEMENTS = [
  'gun-body',      // ① 枪身
  'flame-anchor',  // ② 枪口焰（发射锚点）
  'casing-0',      // ③ 弹壳抛飞
  'recoil-rig',    // ④ 后坐力
  'tracer-line',   // ⑤ 弹道火光
  'smokepuff-0',   // ⑥ 硝烟
  'spark-0',       // ⑦ 转轮偏转
  'target-burst',  // ⑧ 目标炸点
];

function build(overrides: Partial<CgStageContext> = {}): { stage: CgStage; ctx: CgStageContext } {
  const scene = resolveScene('revolver');
  if (!scene) throw new Error('revolver 场景未注册');
  const ctx = makeSceneCtx(overrides);
  return { stage: scene.create(ctx), ctx };
}

/** revolver 时长 720ms（全库最短）。 */
function at(stage: CgStage, t: number, quality: EffectQuality = 'cinematic'): void {
  stage.update(t, t * REVOLVER_DURATION_MS, quality);
}

/** 精确正则收集：前缀撞车会让断言测错对象，所以锁定「名字-数字」全形。 */
function collectExact(root: THREE.Object3D, prefix: string): THREE.Object3D[] {
  const re = new RegExp(`^${prefix}-\\d+$`);
  return nodes(root).filter((o) => re.test(o.name));
}

describe('场景 34 revolver（左轮射击）', () => {
  it('注册项声明规格的 8 个元素与独立签名', () => {
    const scene = resolveScene('revolver');
    expect(scene).not.toBeNull();
    expect(scene!.config.elements).toHaveLength(8);
    expect(scene!.config.signature).toContain('短促击发');
    expect(scene!.config.preset).toBe('gunshot');
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

  it('五团硝烟、四点转轮光斑、三枚弹壳都挂上了场景树', () => {
    const { stage, ctx } = build();
    at(stage, 0.5);
    expect(collectExact(ctx.root, 'smokepuff')).toHaveLength(SMOKE_PUFF_COUNT);
    expect(collectExact(ctx.root, 'spark')).toHaveLength(CYLINDER_SPARK_COUNT);
    expect(collectExact(ctx.root, 'casing')).toHaveLength(CASING_COUNT);
    stage.dispose();
  });

  it('三幕切分点符合规格（180ms / 500ms 于 720ms）', () => {
    expect(REVOLVER_DURATION_MS).toBe(720);
    expect(REVOLVER_ACT1_END).toBeCloseTo(180 / 720, 10);
    expect(REVOLVER_ACT2_END).toBeCloseTo(500 / 720, 10);
  });
});

describe('签名①：短促击发（焰的包络）', () => {
  it('焰在 t=0.028 达峰——全库其余场景起势段的十分之一', () => {
    // 「短」不能只写在时长里：若焰的包络仍像别的场景那样用两三成幕长
    // 慢慢起势，观众看到的只是「快放的普通特效」。
    expect(FLASH_PEAK_T).toBeCloseTo(20 / 720, 3);
    expect(muzzleFlash(FLASH_PEAK_T)).toBeCloseTo(1, 10);
    // 峰值确实是全局最大：扫全幕没有更亮的一刻。
    for (let i = 0; i <= 200; i += 1) {
      const t = i / 200;
      expect(muzzleFlash(t), `t=${t} 亮于峰值`).toBeLessThanOrEqual(1 + 1e-12);
    }
    // 对照量纲：tornado 0.25 / downpour 0.21，本场景要小一个数量级。
    expect(FLASH_PEAK_T).toBeLessThan(0.21 / 5);
  });

  it('上冲是亚线性（链式反应一旦建立亮度近似跃升，不是慢慢亮起来）', () => {
    // 指数 <1 的判据：半程处已过半亮。>1 的指数（火把式起亮）会低于半亮。
    expect(muzzleFlash(FLASH_PEAK_T * 0.5)).toBeGreaterThan(0.6);
    expect(muzzleFlash(FLASH_PEAK_T * 0.1)).toBeGreaterThan(0.2);
    // 且上冲段严格单增（不是一步阶跃）。
    let prev = -1;
    for (let i = 0; i <= 20; i += 1) {
      const v = muzzleFlash((i / 20) * FLASH_PEAK_T * 0.999);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
    expect(muzzleFlash(0)).toBe(0);
  });

  it('峰后快衰：38ms 掉到 1/e，第一幕末已衰到千分之三', () => {
    const tau = 0.038;
    expect(muzzleFlash(FLASH_PEAK_T + tau)).toBeCloseTo(Math.exp(-1), 10);
    // 「击发+焰」这一幕结束时焰真的没了——硝烟才有接力的余地。
    expect(muzzleFlash(REVOLVER_ACT1_END)).toBeLessThan(0.004);
    // 衰减是单调的（不复燃）。
    let prev = 2;
    for (let i = 0; i <= 50; i += 1) {
      const t = FLASH_PEAK_T + (1 - FLASH_PEAK_T) * (i / 50);
      const v = muzzleFlash(t);
      expect(v, `t=${t} 复燃`).toBeLessThanOrEqual(prev);
      prev = v;
    }
  });

  it('对照：焰的高亮窗口远短于幕长（这才是「短促」的可观测内涵）', () => {
    // 亮度过半的总时长占幕长的比例。爆燃式击发只有极窄的一段。
    let above = 0;
    const n = 2000;
    for (let i = 0; i < n; i += 1) if (muzzleFlash(i / n) > 0.5) above += 1;
    const share = above / n;
    expect(share).toBeGreaterThan(0);
    // 全幕不到一成的时间是亮的：把包络拉宽成常见的起势段就会失败。
    expect(share).toBeLessThan(0.1);
  });
});

describe('互动①：焰消退时硝烟才起（接力，不是并发）', () => {
  it('起烟时刻是对焰包络的闭式反解，不是独立写死的常数', () => {
    const onset = smokeOnsetT();
    // 反解的定义：该时刻焰恰好衰到门槛残余。
    expect(muzzleFlash(onset)).toBeCloseTo(0.002, 12);
    // 必然晚于焰峰——反解只在衰减段有根。
    expect(onset).toBeGreaterThan(FLASH_PEAK_T);
    // 落在第二幕内（规格把硝烟排在 180–500ms）。
    expect(onset).toBeGreaterThan(REVOLVER_ACT1_END);
    expect(onset).toBeLessThan(REVOLVER_ACT2_END);
    // 换算回毫秒约 190ms。
    expect(onset * REVOLVER_DURATION_MS).toBeGreaterThan(180);
    expect(onset * REVOLVER_DURATION_MS).toBeLessThan(200);
  });

  it('焰峰时刻硝烟严格为零（并发实现会在此非零）', () => {
    expect(smokeDensity(FLASH_PEAK_T)).toBe(0);
    // 整个第一幕都没有烟。
    for (let i = 0; i <= 20; i += 1) {
      const t = (i / 20) * REVOLVER_ACT1_END;
      expect(smokeDensity(t), `t=${t} 第一幕已起烟`).toBe(0);
    }
  });

  it('两峰隔着整整两幕：焰峰在第一幕初、烟峰在第二幕末', () => {
    let smokePeakT = 0;
    let smokePeak = -1;
    for (let i = 0; i <= 500; i += 1) {
      const t = i / 500;
      const v = smokeDensity(t);
      if (v > smokePeak) { smokePeak = v; smokePeakT = t; }
    }
    expect(smokePeak).toBeGreaterThan(0.5);
    // 烟峰落在第二幕末附近（此后第三幕开始消散）。
    expect(smokePeakT).toBeGreaterThan(REVOLVER_ACT1_END);
    expect(smokePeakT).toBeCloseTo(REVOLVER_ACT2_END, 2);
    // 两峰间距大于半个幕长——「接力」的时序内涵。
    expect(smokePeakT - FLASH_PEAK_T).toBeGreaterThan(0.5);
  });

  it('起烟判据是「焰还剩多少」而非「烟生成了多少」', () => {
    // flashSpentFraction 在焰峰时已接近满值：若用它当门槛，
    // 硝烟会在第一幕初就涌出来，接力关系反而被自己的因量推翻。
    expect(flashSpentFraction(FLASH_PEAK_T)).toBeGreaterThan(0.3);
    // 而此刻烟必须还是零（上一条断言）。两者并存证明门槛读的是残余。
    expect(smokeDensity(FLASH_PEAK_T)).toBe(0);
    // 燃尽份额本身单调且收敛到 1。
    expect(flashSpentFraction(0)).toBe(0);
    expect(flashSpentFraction(1)).toBeCloseTo(1, 6);
    let prev = -1;
    for (let i = 0; i <= 50; i += 1) {
      const v = flashSpentFraction(i / 50);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it('第三幕烟散：浓度从峰值退下且不为负', () => {
    const tail = smokeDensity(0.999);
    expect(tail).toBeLessThan(smokeDensity(REVOLVER_ACT2_END) * 0.1);
    expect(tail).toBeGreaterThanOrEqual(0);
  });

  it('烟团离开枪口往外漂，且各团方向互异（不是原地涨大的一坨）', () => {
    // 烟的断言全在 uSwell / uAlpha 上：把漂移量写成 0，浓度曲线、起烟时刻、
    // 两峰间隔全部照样绿，而硝烟会原地膨胀又原地消失——规格「烟随燃气往
    // 枪口前上方走」已破。位置必须自己有断言。
    const { stage, ctx } = build();
    const puffs = collectExact(ctx.root, 'smokepuff');
    expect(puffs.length).toBeGreaterThan(1);

    // 枪口基准取起烟时刻的烟团位置：那一刻 travel=0，位置即枪口，
    // 不必从 parts 里复制 muzzle 常量（复制会让断言跟着实现一起错）。
    at(stage, smokeOnsetT());
    const origin = puffs.map((m) => ({ x: m.position.x, y: m.position.y }));

    at(stage, REVOLVER_ACT2_END * 0.75);
    const near = puffs.map((m) => ({ x: m.position.x, y: m.position.y }));
    at(stage, REVOLVER_ACT2_END);
    const far = puffs.map((m) => ({ x: m.position.x, y: m.position.y }));

    for (let i = 0; i < puffs.length; i += 1) {
      const dNear = Math.hypot(near[i].x - origin[i].x, near[i].y - origin[i].y);
      const dFar = Math.hypot(far[i].x - origin[i].x, far[i].y - origin[i].y);
      expect(dFar, `${puffs[i].name} 没有离开枪口`).toBeGreaterThan(dNear + 1);
    }
    // 各团漂移方向互异：同一方向会让整片烟像一块板平移。
    const dirs = far.map((p, i) => {
      const dx = p.x - origin[i].x;
      const dy = p.y - origin[i].y;
      const r = Math.hypot(dx, dy);
      return { x: dx / r, y: dy / r };
    });
    let sawDifferent = false;
    for (let i = 0; i < dirs.length && !sawDifferent; i += 1) {
      for (let j = i + 1; j < dirs.length; j += 1) {
        if (Math.hypot(dirs[i].x - dirs[j].x, dirs[i].y - dirs[j].y) > 0.05) {
          sawDifferent = true;
          break;
        }
      }
    }
    expect(sawDifferent, '所有烟团同向漂移 → 一整块板').toBe(true);
    stage.dispose();
  });

  it('场景中烟团不透明度确实跟着 smokeDensity 走（数学要接到画面上）', () => {
    const { stage, ctx } = build();
    // 焰峰帧：烟团全暗。
    at(stage, FLASH_PEAK_T);
    for (const puff of collectExact(ctx.root, 'smokepuff')) {
      expect(uniformOf(puff, 'uAlpha'), `${puff.name} 焰峰时已有烟`).toBe(0);
    }
    // 第二幕末：至少有烟团亮起来了。
    at(stage, REVOLVER_ACT2_END);
    const levels = collectExact(ctx.root, 'smokepuff')
      .map((p) => uniformOf(p, 'uAlpha'));
    expect(Math.max(...levels)).toBeGreaterThan(0.05);
    stage.dispose();
  });
});

describe('签名②：弹壳的刚体纯抛物线（全库唯一）', () => {
  /** 单独建一层弹壳场：mesh 位姿抄自刚体，可直接当轨迹采样点。 */
  function casingProbe(quality: EffectQuality = 'cinematic') {
    const ctx = makeSceneCtx({ quality });
    const res = createSceneResources(ctx.root, ctx.origin, 'revolver-casing-probe');
    const short = Math.min(ctx.width, ctx.height);
    const muzzle = new THREE.Vector3(0, 0, 2);
    const groundY = -ctx.height * 0.42;
    const field = createCasingField(res, ctx, muzzle, groundY, 1, REVOLVER_ACT1_END);
    return { ctx, res, field, short, groundY };
  }

  /**
   * 恰好推进 k 个物理步的场景进度。
   *
   * 追赶循环里 `elapsed` 是逐步累加、目标是乘法算出，直接取 k 倍步长会
   * 因浮点漂移让某些 advance 走 0 步、某些走 2 步，采样间隔就不均匀了
   * （二阶差分因此测不出自由飞行）。把目标压到第 k 与第 k+1 步的中点，
   * 步数就与浮点误差无关。
   */
  function stepTarget(k: number): number {
    return REVOLVER_ACT1_END + (k + 0.5) * CASING_STEP / REVOLVER_DURATION_S;
  }

  it('自由段竖向位置的二阶差分恒为 -g·dt²（除重力外不受任何力）', () => {
    // 这是抛物线的判据本体：任何在 advance 内补一脚力的实现都会破坏它。
    // 与 tornado（气流场整幕托着）/ thunder（环波逐块掀起）的分野就在这里。
    const { res, field, short } = casingProbe();
    const shell = field.shells[0];
    const g = short * 13;
    // 采样必须落在「已抛出、未落地」的区间内。
    const ys: number[] = [];
    for (let k = 1; k <= 8; k += 1) {
      field.advance(stepTarget(k));
      ys.push(shell.body.position.y);
    }
    // 全部采样点都在空中（否则测到的是接触段）。
    expect(shell.landedAt, '采样区间内已落地，需缩短采样').toBe(-1);
    for (let i = 2; i < ys.length; i += 1) {
      const second = ys[i] - 2 * ys[i - 1] + ys[i - 2];
      // cannon 的半隐式欧拉：单步二阶差分 = -g·dt²（含阻尼的极小修正）。
      expect(second, `第 ${i} 点二阶差分偏离自由飞行`)
        .toBeCloseTo(-g * CASING_STEP * CASING_STEP, 1);
    }
    field.dispose();
    res.dispose();
  });

  it('横向速度在自由段近乎恒定（无侧向力，只有微弱空气阻尼）', () => {
    const { res, field } = casingProbe();
    const shell = field.shells[0];
    const vxs: number[] = [];
    for (let k = 1; k <= 8; k += 1) {
      field.advance(stepTarget(k));
      vxs.push(shell.body.velocity.x);
    }
    expect(shell.landedAt).toBe(-1);
    // 逐步衰减不超过千分之五（阻尼 1-drag），且不换向。
    for (let i = 1; i < vxs.length; i += 1) {
      const ratio = Math.abs(vxs[i] / vxs[i - 1]);
      expect(ratio).toBeGreaterThan(0.99);
      expect(ratio).toBeLessThanOrEqual(1);
      expect(Math.sign(vxs[i])).toBe(Math.sign(vxs[0]));
    }
    field.dispose();
    res.dispose();
  });

  it('抛壳前弹壳不动（冲量在第二幕起给，不是整幕都在飞）', () => {
    const { res, field } = casingProbe();
    const shell = field.shells[0];
    const y0 = shell.body.position.y;
    field.advance(REVOLVER_ACT1_END * 0.5);
    expect(shell.body.position.y).toBe(y0);
    expect(shell.landedAt).toBe(-1);
    expect(shell.bounces).toBe(0);
    field.dispose();
    res.dispose();
  });

  it('轨迹有顶点：先升后落（一次抛射而非直接下坠）', () => {
    const { res, field } = casingProbe();
    const shell = field.shells[0];
    let peak = -Infinity;
    let peakAt = -1;
    const samples: number[] = [];
    for (let i = 1; i <= 60; i += 1) {
      const t = REVOLVER_ACT1_END + (1 - REVOLVER_ACT1_END) * (i / 60);
      field.advance(t);
      const y = shell.body.position.y;
      samples.push(y);
      if (y > peak) { peak = y; peakAt = t; }
    }
    // 顶点不在采样两端：中途确实翻过一个最高点。
    expect(peakAt).toBeGreaterThan(REVOLVER_ACT1_END);
    expect(peakAt).toBeLessThan(0.95);
    expect(peak).toBeGreaterThan(samples[0]);
    expect(samples[samples.length - 1]).toBeLessThan(peak);
    field.dispose();
    res.dispose();
  });

  it('三枚壳各飞各的：位移向量互异（抛物线**族**，不是刚性阵列平移）', () => {
    // 上面所有抛物线断言都只验**单枚**的运动学：把三枚的初速写成同一个值，
    // 二阶差分、顶点、落地弹跳全部照样成立。**且位置断言也拦不住**——三枚
    // 的初始 x 本就带抖动，同初速下轨迹只是整体平移，落点间距等于初始间距。
    // 可检验的内涵只能是**相对各自起点的位移**：族里每条轨迹形状不同。
    const { res, field } = casingProbe();
    const shells = field.shells;
    expect(shells).toHaveLength(CASING_COUNT);
    const origin = shells.map((sh) => ({ x: sh.body.position.x, y: sh.body.position.y }));

    // 推到飞行中段，比较各壳**相对自身起点**的位移。
    field.advance(REVOLVER_ACT1_END + 0.1);
    const disp = shells.map((sh, i) => ({
      x: sh.body.position.x - origin[i].x,
      y: sh.body.position.y - origin[i].y,
    }));
    for (let i = 0; i < disp.length; i += 1) {
      for (let j = i + 1; j < disp.length; j += 1) {
        const d = Math.hypot(disp[i].x - disp[j].x, disp[i].y - disp[j].y);
        expect(d, `壳 ${i} 与壳 ${j} 位移相同 → 刚性平移`).toBeGreaterThan(1);
      }
    }

    // 落地时刻也应错开：同初速会让三枚同时着地。
    field.advance(0.98);
    const landed = shells.map((sh) => sh.landedAt);
    for (const v of landed) expect(v).toBeGreaterThan(0);
    const uniq = new Set(landed.map((v) => v.toFixed(4)));
    expect(uniq.size, '三枚同时落地 → 抛物线族退化为一条').toBeGreaterThan(1);
    field.dispose();
    res.dispose();
  });

  it('互动②：弹壳真的落地并弹跳（landedAt 是实测值，不是预算值）', () => {
    const { res, field, groundY } = casingProbe();
    for (let i = 1; i <= 60; i += 1) {
      field.advance(REVOLVER_ACT1_END + (1 - REVOLVER_ACT1_END) * (i / 60));
    }
    for (const shell of field.shells) {
      expect(shell.landedAt, `${shell.mesh.name} 整幕未落地`).toBeGreaterThan(0);
      // 落地时刻必然晚于抛出时刻。
      expect(shell.landedAt).toBeGreaterThan(REVOLVER_ACT1_END);
      // 弹跳可数。
      expect(shell.bounces, `${shell.mesh.name} 未弹跳`).toBeGreaterThan(0);
      // 且从未穿透地面。
      expect(shell.body.position.y).toBeGreaterThanOrEqual(
        groundY + shell.half * 1.2 - 1e-6,
      );
    }
    field.dispose();
    res.dispose();
  });

  it('弹壳在飞行中翻滚，且各壳转速互异（刚体的可见证据）', () => {
    // 「显示层抄自刚体」那条里的四元数比对，在角速度为零时退化成比两个
    // 恒等常量——把 angularVelocity 清零，全部断言照样绿，而弹壳会像一根
    // 不转的棍子平移出去。翻滚是刚体区别于脚本动画最直观的一项，自己要有断言。
    const { res, field } = casingProbe();
    const start = field.shells.map((sh) => sh.body.quaternion.clone());

    field.advance(REVOLVER_ACT1_END + 0.1);
    const turned = field.shells.map((sh, i) => {
      const q = sh.body.quaternion;
      // 与初始姿态的夹角：|dot| 越接近 1 表示越没转。
      const dot = Math.abs(
        q.x * start[i].x + q.y * start[i].y + q.z * start[i].z + q.w * start[i].w,
      );
      return Math.acos(Math.min(1, dot)) * 2;
    });
    for (const [i, ang] of turned.entries()) {
      expect(ang, `壳 ${i} 飞行中没有翻滚`).toBeGreaterThan(0.3);
    }
    // 三枚转速不同（同一角速度会让它们同步翻滚，读起来仍是刚性阵列）。
    const uniq = new Set(turned.map((v) => v.toFixed(3)));
    expect(uniq.size, '三枚翻滚完全同步').toBeGreaterThan(1);
    field.dispose();
    res.dispose();
  });

  it('显示层位姿原样抄自刚体（不在显示层二次夹地面）', () => {
    // 显示层再夹一次会把「没穿透」变成一句显示层的谎，验收就测不到物理。
    const { res, field } = casingProbe();
    for (let i = 1; i <= 40; i += 1) {
      field.advance(REVOLVER_ACT1_END + (1 - REVOLVER_ACT1_END) * (i / 40));
    }
    for (const shell of field.shells) {
      expect(shell.mesh.position.y).toBeCloseTo(shell.body.position.y, 10);
      expect(shell.mesh.position.x).toBeCloseTo(shell.body.position.x, 10);
      expect(shell.mesh.quaternion.x).toBeCloseTo(shell.body.quaternion.x, 10);
      expect(shell.mesh.quaternion.w).toBeCloseTo(shell.body.quaternion.w, 10);
    }
    field.dispose();
    res.dispose();
  });

  it('dispose 把刚体从 cannon world 摘净（场景树干净不等于物理世界干净）', () => {
    // world 是闭包私有的：漏掉 removeBody，场景树的 dispose 断言照样全绿，
    // 而物理世界仍持有三个刚体（每帧继续被 step 积分）。
    const { res, field } = casingProbe();
    expect(field.bodyCount).toBe(CASING_COUNT);
    field.advance(0.6);
    field.dispose();
    expect(field.bodyCount, 'dispose 后 world 仍持有刚体').toBe(0);
    res.dispose();
  });

  it('稀疏与密集 advance 到同一 t 得到同一状态（时间轴折算，不吃 frameDelta）', () => {
    const sparse = casingProbe();
    sparse.field.advance(0.86);
    const sy = sparse.field.shells[0].body.position.y;
    const sx = sparse.field.shells[0].body.position.x;
    const sBounce = sparse.field.shells[0].bounces;
    sparse.field.dispose();
    sparse.res.dispose();

    const dense = casingProbe();
    for (let i = 1; i <= 86; i += 1) dense.field.advance(i / 100);
    const dy = dense.field.shells[0].body.position.y;
    const dx = dense.field.shells[0].body.position.x;
    const dBounce = dense.field.shells[0].bounces;
    dense.field.dispose();
    dense.res.dispose();

    expect(dy).toBeCloseTo(sy, 6);
    expect(dx).toBeCloseTo(sx, 6);
    expect(dBounce).toBe(sBounce);
  });
});

describe('④后坐与相机微震（一次冲量的两个表现）', () => {
  it('后坐峰值恰为 1 且落在 t=0.055（不对称阻尼回位）', () => {
    expect(recoilKick(0)).toBe(0);
    expect(recoilKick(0.055)).toBeCloseTo(1, 10);
    // 峰值是全局最大。
    for (let i = 0; i <= 200; i += 1) {
      expect(recoilKick(i / 200)).toBeLessThanOrEqual(1 + 1e-12);
    }
    // 不对称：到位比回位快——用正弦半周期会对称，这里不该对称。
    const up = 0.055 * 0.5;
    const down = 0.055 + (1 - 0.055) * 0.5;
    expect(recoilKick(up)).toBeGreaterThan(0.7);
    expect(recoilKick(down)).toBeGreaterThan(0);
    // 拖尾的量化：到位只用了 0.055，而回落到两成要走到 4 倍峰值时刻。
    // 对称曲线（如正弦半周期）在 2 倍峰值时刻就已归零。
    expect(recoilKick(0.055 * 2)).toBeGreaterThan(0.4);
    expect(recoilKick(0.055 * 4)).toBeGreaterThan(0.15);
  });

  it('微震与后坐同源：包络就是 recoilKick，抖动只是叠加的高频', () => {
    // 同源的可检验形式：|shake| 处处不超过 recoilKick 包络，且在
    // 正弦峰处贴到包络。拆成两条各自的曲线就会越界。
    for (let i = 1; i <= 200; i += 1) {
      const t = i / 200;
      expect(Math.abs(cameraShake(t)), `t=${t} 越出包络`)
        .toBeLessThanOrEqual(recoilKick(t) + 1e-12);
    }
    // 且确实双向摆动（不是单侧偏移）。
    let pos = false;
    let neg = false;
    for (let i = 1; i <= 400; i += 1) {
      const v = cameraShake(i / 400);
      if (v > 1e-3) pos = true;
      if (v < -1e-3) neg = true;
    }
    expect(pos && neg).toBe(true);
  });

  it('枪身沿射击反向后退，且整枪（含转轮光斑）一起退', () => {
    const { stage, ctx } = build();
    at(stage, 0.001);
    const rig = node(ctx.root, 'recoil-rig');
    const x0 = rig.position.x;
    at(stage, 0.055);
    const xPeak = rig.position.x;
    // aim=+1（默认 direction.x=0 → 朝右），枪往左退。
    expect(xPeak).toBeLessThan(x0);
    // 光斑挂在 rig 上：它是 rig 的后代，位移一处施加、整枪跟着退。
    const spark = node(ctx.root, 'spark-0');
    let parent: THREE.Object3D | null = spark.parent;
    let underRig = false;
    while (parent) {
      if (parent === rig) { underRig = true; break; }
      parent = parent.parent;
    }
    expect(underRig, 'spark-0 未挂在 recoil-rig 下').toBe(true);
    stage.dispose();
  });
});

describe('⑤⑧ 弹道火光与目标炸点的因果时序', () => {
  it('弹道火光比枪口焰更短促（子弹裹的燃气随子弹离场即灭）', () => {
    expect(tracerFlash(0.012)).toBeCloseTo(1, 10);
    // 峰值更早。
    expect(0.012).toBeLessThan(FLASH_PEAK_T);
    // 衰得更快：同样走过 0.04 幕，亮线剩得比焰少。
    const dt = 0.04;
    expect(tracerFlash(0.012 + dt)).toBeLessThan(muzzleFlash(FLASH_PEAK_T + dt));
    expect(tracerFlash(0)).toBe(0);
  });

  it('目标炸点隔着子弹飞行时间：起亮严格晚于枪口', () => {
    // 因在此、果在远处且更晚——这是元素⑧与⑤的分野。
    expect(targetBurst(TARGET_DELAY_T)).toBe(0);
    expect(targetBurst(TARGET_DELAY_T * 0.5)).toBe(0);
    // 而枪口在此之前早已起亮。
    expect(muzzleFlash(TARGET_DELAY_T * 0.5)).toBeGreaterThan(0.5);
    // 延迟后确实亮起来。
    expect(targetBurst(TARGET_DELAY_T + 0.01)).toBeGreaterThan(0.1);
    // 远端更弱（距离衰减）：峰值不到枪口的八成。
    let peak = 0;
    for (let i = 0; i <= 500; i += 1) peak = Math.max(peak, targetBurst(i / 500));
    expect(peak).toBeLessThan(0.8);
    expect(peak).toBeGreaterThan(0.1);
  });

  it('炸点在场景里的不透明度与位置都落在远端一侧', () => {
    const { stage, ctx } = build();
    at(stage, TARGET_DELAY_T * 0.5);
    expect(opacity(node(ctx.root, 'target-burst'))).toBe(0);
    at(stage, TARGET_DELAY_T + 0.012);
    const burst = node(ctx.root, 'target-burst');
    expect(opacity(burst)).toBeGreaterThan(0.1);
    // aim=+1 时炸点在右侧屏缘附近，与枪身（左侧）分处两端。
    expect(burst.position.x).toBeGreaterThan(0);
    expect(burst.position.x).toBeGreaterThan(node(ctx.root, 'recoil-rig').position.x);
    stage.dispose();
  });
});

describe('⑦ 转轮偏转（一发一格）', () => {
  it('整幕只转 60°，且第一幕末已到位锁住', () => {
    expect(cylinderTurn(0)).toBe(0);
    const full = Math.PI * 2 / 6;
    expect(cylinderTurn(REVOLVER_ACT1_END)).toBeCloseTo(full, 10);
    // 之后不再转（定位销锁住）。
    expect(cylinderTurn(0.6)).toBeCloseTo(full, 10);
    expect(cylinderTurn(1)).toBeCloseTo(full, 10);
  });

  it('缓出而非匀速：半程已转过七成以上', () => {
    const full = Math.PI * 2 / 6;
    const half = cylinderTurn(REVOLVER_ACT1_END * 0.5);
    expect(half / full).toBeGreaterThan(0.7);
    // 单调不回转。
    let prev = -1;
    for (let i = 0; i <= 40; i += 1) {
      const v = cylinderTurn((i / 40) * REVOLVER_ACT1_END);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it('侧向光斑只有朝枪口那半边被照亮（不是一圈均匀的环）', () => {
    const { stage, ctx } = build();
    at(stage, FLASH_PEAK_T);
    const ops = collectExact(ctx.root, 'spark').map((s) => opacity(s));
    expect(ops).toHaveLength(CYLINDER_SPARK_COUNT);
    // 有亮的也有暗的：全都一样亮就说明没做朝向筛选。
    expect(Math.max(...ops)).toBeGreaterThan(0.05);
    expect(Math.min(...ops)).toBeLessThan(Math.max(...ops) * 0.5);
    stage.dispose();
  });

  it('焰灭后光斑随之熄灭（弹巢缝里透出的是焰光，不是自发光）', () => {
    const { stage, ctx } = build();
    at(stage, 0.8);
    for (const spark of collectExact(ctx.root, 'spark')) {
      expect(opacity(spark), `${spark.name} 焰灭后仍亮`).toBeLessThan(0.01);
    }
    stage.dispose();
  });
});

describe('②锥光的全屏铺开', () => {
  it('锥光范围比亮度钝：焰芯灭后照亮的空气还亮一瞬', () => {
    // coneReach = flash^0.55，0.55 次幂让几何范围衰得比亮度慢。
    for (const t of [0.05, 0.1, 0.15]) {
      const flash = muzzleFlash(t);
      expect(coneReach(t)).toBeGreaterThan(flash);
      expect(coneReach(t)).toBeCloseTo(Math.pow(flash, 0.55), 10);
    }
    expect(coneReach(0)).toBe(0);
    expect(coneReach(FLASH_PEAK_T)).toBeCloseTo(1, 10);
  });

  it('uReach 在场景里确实读 coneReach（数学接到了 shader 上）', () => {
    const { stage, ctx } = build();
    for (const t of [0.01, FLASH_PEAK_T, 0.08, 0.2]) {
      at(stage, t);
      expect(uniformOf(node(ctx.root, 'muzzle-cone'), 'uReach'))
        .toBeCloseTo(coneReach(t), 10);
    }
    stage.dispose();
  });
});

describe('降档、稀疏 update 与释放', () => {
  it('降档只减粒子密度，八个元素一个不少', () => {
    for (const quality of ['cinematic', 'high', 'medium', 'low'] as const) {
      const { stage, ctx } = build({ quality });
      at(stage, 0.5, quality);
      const built = names(ctx.root);
      for (const name of NAMED_ELEMENTS) {
        expect(built, `${quality} 档缺少 ${name}`).toContain(name);
      }
      // 签名载体的计数在所有档位相同。
      expect(collectExact(ctx.root, 'smokepuff')).toHaveLength(SMOKE_PUFF_COUNT);
      expect(collectExact(ctx.root, 'spark')).toHaveLength(CYLINDER_SPARK_COUNT);
      expect(collectExact(ctx.root, 'casing')).toHaveLength(CASING_COUNT);
      stage.dispose();
    }
  });

  it('降档确实减密度：低档火药与硝烟的粒子预算严格低于电影级', () => {
    // 火药/硝烟是 quarks 粒子，没有可数 mesh；密度落在 hub 内部的
    // scaledCount 上。直接按场景声明的预算（火焰 90 / 硝烟 54）验缩放，
    // 而不是去数场景树——数不到的东西写成 if/else 两条都算过的探针，
    // 等于没有断言。
    for (const budget of [90, 54]) {
      const cinematic = scaledCount(budget, 'cinematic');
      const low = scaledCount(budget, 'low');
      expect(cinematic).toBe(budget);
      expect(low).toBeLessThan(cinematic);
      // 但不会削到零：低档是更稀疏而非不存在。
      expect(low).toBeGreaterThan(0);
    }
  });

  it('两层粒子系统在所有档位都建起来（降档不裁掉整层）', () => {
    for (const quality of ['cinematic', 'low'] as const) {
      const { stage, ctx } = build({ quality });
      at(stage, FLASH_PEAK_T, quality);
      const renderer = nodes(ctx.root).find((o) => o.type === 'BatchedRenderer');
      expect(renderer, `${quality} 档 BatchedRenderer 未挂载`).toBeDefined();
      stage.dispose();
    }
  });

  it('稀疏与密集 update 在同一 t 得到同一帧（闭式求值，不逐帧累加）', () => {
    const sparse = build();
    at(sparse.stage, 0.58);
    const sparseReach = uniformOf(node(sparse.ctx.root, 'muzzle-cone'), 'uReach');
    const sparseRigX = node(sparse.ctx.root, 'recoil-rig').position.x;
    const sparseBurst = opacity(node(sparse.ctx.root, 'target-burst'));
    sparse.stage.dispose();

    const dense = build();
    for (let i = 1; i <= 58; i += 1) at(dense.stage, i / 100);
    const denseReach = uniformOf(node(dense.ctx.root, 'muzzle-cone'), 'uReach');
    const denseRigX = node(dense.ctx.root, 'recoil-rig').position.x;
    const denseBurst = opacity(node(dense.ctx.root, 'target-burst'));
    dense.stage.dispose();

    expect(denseReach).toBeCloseTo(sparseReach, 10);
    expect(denseRigX).toBeCloseTo(sparseRigX, 10);
    expect(denseBurst).toBeCloseTo(sparseBurst, 10);
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
    expect(() => at(stage, 0.9)).not.toThrow();
    stage.dispose();
  });
});
