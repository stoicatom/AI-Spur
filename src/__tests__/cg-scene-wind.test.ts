/**
 * 场景 13 wind 实现验收（设计规格 §4.2 场景 13）。
 *
 * 断言按规格逐条对应：8 元素齐备、三幕时间轴、尘卷横扫全屏宽、
 * 两条多元素互动（枯叶沿螺旋线上升 / 砂纹随风力增强）、
 * 独立签名（唯一「旋转流场」环境 + 枯叶薄片刚体环绕轨迹）、档位裁剪、资源释放。
 *
 * 签名的取证方式说明：**不测总位移**。环境风一帧就能把尘粒推 300px，
 * 而涡旋弧长只有百来 px，总位移里读不出旋转。涡真正改变的是**流向**——
 * 涡内尘粒被拽着拐弯，涡外仍顺风直走。因此断言测「位移方向偏离参考风向的角度」，
 * 并要求涡内/涡外形成明显梯度。
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { resolveScene } from '../overlay/cg-scene-registry';
import '../overlay/cg-scenes';
import type { CgStage, CgStageContext } from '../overlay/cg-scene';
import { makeSceneCtx, names, node, opacity, uniformOf } from './cg-scene-harness';

/** 场景总时长（ms），三幕断言用它把归一化进度换回毫秒。 */
const DURATION = 1200;

/** 规格 §4.2 场景 13 的八元素，实现里以 name 标注供验收。 */
const REQUIRED = [
  'wind-streamlines', 'dust-funnel', 'whirl-leaves', 'dust-veil',
  'sand-ripples', 'wind-eye', 'rush-clouds', 'wind-strobe',
] as const;

const scene = resolveScene('wind');

function makeCtx(overrides: Partial<CgStageContext> = {}): CgStageContext {
  // now 必填：漏了它会让 `now - startNow` 成 NaN，污染整个粒子层。
  return makeSceneCtx({ color: new THREE.Color('#C9A876'), now: 0, ...overrides });
}

/** 推进到某一进度；now 与 t 同步给，风场的时间积分才对得上时间轴。 */
function at(stage: CgStage, t: number, quality: CgStageContext['quality'] = 'cinematic'): void {
  stage.update(t, t * DURATION, quality);
}

/** 取某层尘幕当帧的顶点坐标副本（尘粒以 Points 承载，逐粒可寻址）。 */
function dustArray(root: THREE.Object3D, layer: string): Float32Array {
  const points = node(root, layer) as THREE.Points;
  const attr = points.geometry.getAttribute('position');
  return Float32Array.from(attr.array as ArrayLike<number>);
}

function dustCount(root: THREE.Object3D, layer: string): number {
  return dustArray(root, layer).length / 3;
}

/**
 * 精确收集叶刚体节点。
 *
 * 用 /^leaf-\d+$/ 而非 startsWith('leaf')：前缀匹配一旦撞上别的节点，
 * 断言会测错对象却照样通过（本项目真出过这个事故）。
 */
function leafNodes(root: THREE.Object3D): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  root.traverse((o) => { if (/^leaf-\d+$/.test(o.name)) out.push(o); });
  return out;
}

/**
 * 按「距涡轴远近」分组统计尘粒位移**方向偏离参考风向的角度**。
 *
 * 涡心从场景树的 whirl-axis 节点读，不在测试里复制坐标常量——
 * 实现挪动涡轴时测试跟着走，而不是把「距原点距离」当成「距涡心距离」测。
 *
 * @param wrapGuard 位移超过此值视为环绕重入，剔除
 */
function deviationByRadius(
  before: Float32Array, after: Float32Array,
  centerX: number, centerY: number, short: number, wrapGuard: number,
  coreR: number, outerR: number,
): { core: number; outer: number } {
  // 参考风向：涡外尘粒的平均位移方向，即尘幕本身的平流方向。
  let refX = 0; let refY = 0; let refN = 0;
  for (let i = 0; i < before.length; i += 3) {
    const r = Math.hypot(before[i] - centerX, before[i + 1] - centerY);
    const dx = after[i] - before[i]; const dy = after[i + 1] - before[i + 1];
    if (Math.hypot(dx, dy) > wrapGuard) continue;
    if (r > outerR) { refX += dx; refY += dy; refN += 1; }
  }
  if (refN === 0) return { core: 0, outer: 0 };
  const refAngle = Math.atan2(refY / refN, refX / refN);

  let coreSum = 0; let coreN = 0; let outerSum = 0; let outerN = 0;
  for (let i = 0; i < before.length; i += 3) {
    const r = Math.hypot(before[i] - centerX, before[i + 1] - centerY);
    const dx = after[i] - before[i]; const dy = after[i + 1] - before[i + 1];
    const d = Math.hypot(dx, dy);
    if (d > wrapGuard || d < 1e-6) continue;
    // 夹角取绝对值并折到 [0, π]，顺逆时针都算偏离。
    let dev = Math.abs(Math.atan2(dy, dx) - refAngle);
    if (dev > Math.PI) dev = Math.PI * 2 - dev;
    if (r < coreR) { coreSum += dev; coreN += 1; }
    else if (r > outerR) { outerSum += dev; outerN += 1; }
  }
  void short;
  return {
    core: coreN > 0 ? coreSum / coreN : 0,
    outer: outerN > 0 ? outerSum / outerN : 0,
  };
}

/** 名字/位置/缩放/透明度快照，用于比对两幕视觉状态是否真的不同。 */
function snapshot(root: THREE.Object3D): string {
  const rows: unknown[] = [];
  root.traverse((o) => {
    rows.push([o.name, o.position.toArray().map((n) => Number(n.toFixed(2))),
      Number(opacity(o).toFixed(3))]);
  });
  return JSON.stringify(rows);
}

describe('场景 13 wind', () => {
  it('已注册且签名声明旋转流场与枯叶刚体环绕', () => {
    expect(scene).not.toBeNull();
    expect(scene!.config.signature).toContain('旋转流场');
    expect(scene!.config.signature).toContain('枯叶');
    expect(scene!.config.preset).toBe('whirl');
    // elements 必须是规格原文的全部 8 项。
    expect(scene!.config.elements).toEqual([
      '风场流线', '尘卷', '被卷起的枯叶', '扬尘幕',
      '地面砂纹', '风眼', '云层快速掠过', '风声频闪',
    ]);
  });

  it('八个规格元素全部落地为具名节点', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const tree = names(ctx.root);
    for (const element of REQUIRED) {
      expect(tree, `缺元素 ${element}`).toContain(element);
    }
    stage.dispose();
  });

  it('旷野规模：电影级尘粒过三千，且铺满全屏', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    // 「旷野扬尘」的下限：两层合计达千级，稀疏几十粒不算沙尘。
    expect(dustCount(ctx.root, 'wind-streamlines')).toBeGreaterThan(900);
    expect(dustCount(ctx.root, 'dust-veil')).toBeGreaterThan(1500);
    expect(dustCount(ctx.root, 'wind-streamlines') + dustCount(ctx.root, 'dust-veil'))
      .toBeGreaterThan(3000);

    at(stage, 0.5);
    const arr = dustArray(ctx.root, 'wind-streamlines');
    let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
    for (let i = 0; i < arr.length; i += 3) {
      minX = Math.min(minX, arr[i]); maxX = Math.max(maxX, arr[i]);
      minY = Math.min(minY, arr[i + 1]); maxY = Math.max(maxY, arr[i + 1]);
    }
    expect(maxX - minX, '流线层横向未铺满').toBeGreaterThanOrEqual(ctx.width);
    expect(maxY - minY, '流线层纵向未铺满').toBeGreaterThanOrEqual(ctx.height);
    stage.dispose();
  });

  it('全屏：尘卷横扫全屏宽（规格「尘卷横扫全屏宽度」）', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    let sweepMin = Infinity; let sweepMax = -Infinity;
    const seen: number[] = [];
    for (const t of [0.02, 0.25, 0.5, 0.75, 0.99]) {
      at(stage, t);
      ctx.root.updateMatrixWorld(true);
      const funnel = node(ctx.root, 'dust-funnel');
      const bounds = new THREE.Box3().setFromObject(funnel);
      sweepMin = Math.min(sweepMin, bounds.min.x);
      sweepMax = Math.max(sweepMax, bounds.max.x);
      seen.push(node(ctx.root, 'whirl-axis').position.x);
    }
    // 扫掠并集必须盖住整幅屏宽（含两侧屏外余量）。
    expect(sweepMin).toBeLessThanOrEqual(-ctx.width / 2);
    expect(sweepMax).toBeGreaterThanOrEqual(ctx.width / 2);
    // 涡轴自身单调右行：横扫不是原地抖动。
    expect(seen.every((x, i) => i === 0 || x > seen[i - 1])).toBe(true);
    stage.dispose();
  });

  it('独立签名：涡内流向被拽偏、涡外顺风直走，形成明显梯度', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const short = Math.min(ctx.width, ctx.height);

    // 同一时刻取不到「无涡」对照，改测**空间**差异：这是旋转流场的定义
    // ——涡内位置由绕轴转角决定，涡外由平流决定，两者流向必然分岔。
    at(stage, 0.42);
    const before = dustArray(ctx.root, 'wind-streamlines');
    // 涡心从场景树取（whirl-axis 就是涡轴），且必须取**前一帧**的轴位：
    // 尘粒的旋转是绕当帧轴发生的，用后一帧的轴分组会把半径带算错。
    const axis = node(ctx.root, 'whirl-axis');
    const centerX = axis.position.x;
    const centerY = axis.position.y;
    at(stage, 0.52);
    const after = dustArray(ctx.root, 'wind-streamlines');
    expect(before.length).toBeGreaterThan(0);

    const { core, outer } = deviationByRadius(
      before, after, centerX, centerY, short,
      short * 0.6, short * 0.26, short * 0.76,
    );
    // 涡内偏离至少 0.35rad（约 20°）才看得出在打旋。
    expect(core).toBeGreaterThan(0.35);
    // 涡外必须基本顺风，否则「涡」不成立——是整片尘幕在被斜风吹。
    expect(outer).toBeLessThan(0.12);
    // 梯度要显著，不能靠噪声凑出差值。
    expect(core).toBeGreaterThan(outer * 5);
    stage.dispose();
  });

  it('签名续：涡内位置由累计转角决定，转角单调递增且不回摆', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const spins: number[] = [];
    for (const t of [0.1, 0.3, 0.5, 0.7, 0.9, 1]) {
      at(stage, t);
      spins.push(uniformOf(node(ctx.root, 'dust-funnel'), 'uSpin'));
    }
    // 转角只增不减：涡减弱是「转得慢了」，不是「转回去」。
    expect(spins.every((v, i) => i === 0 || v >= spins[i - 1])).toBe(true);
    // 整幕至少转过一整圈，否则「旋转流场」名不副实。
    expect(spins[spins.length - 1]).toBeGreaterThan(Math.PI * 2);
    stage.dispose();
  });

  it('互动一：枯叶沿卷螺旋线上升（角度单调 + 高度单调）', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const leaves = leafNodes(ctx.root);
    expect(leaves.length).toBeGreaterThan(8);

    // 螺旋 = 绕轴公转（xz 平面）+ 沿轴上升（y）。两个条件都要，
    // 只测高度的话「被直吹上天」也过；只测角度的话「平面转圈」也过。
    const cum = new Map<string, number>();
    const prev = new Map<string, number>();
    const angles = new Map<string, number[]>();
    const heights = new Map<string, number[]>();
    for (const t of [0.26, 0.32, 0.38, 0.44, 0.5, 0.56, 0.62, 0.68, 0.74]) {
      at(stage, t);
      const axisX = node(ctx.root, 'whirl-axis').position.x;
      for (const leaf of leaves) {
        const raw = Math.atan2(leaf.position.z, leaf.position.x - axisX);
        const last = prev.get(leaf.name);
        if (last === undefined) { cum.set(leaf.name, 0); } else {
          // 展开跨越 ±π 的跳变，否则单调性会被折返假象打断。
          let step = raw - last;
          while (step > Math.PI) step -= Math.PI * 2;
          while (step < -Math.PI) step += Math.PI * 2;
          cum.set(leaf.name, (cum.get(leaf.name) ?? 0) + step);
        }
        prev.set(leaf.name, raw);
        (angles.get(leaf.name) ?? angles.set(leaf.name, []).get(leaf.name)!)
          .push(cum.get(leaf.name) ?? 0);
        (heights.get(leaf.name) ?? heights.set(leaf.name, []).get(leaf.name)!)
          .push(leaf.position.y);
      }
    }

    const mono = (xs: number[]): boolean => xs.every((v, i) => i === 0 || v > xs[i - 1]);
    const spiralling = leaves.filter((leaf) =>
      mono(angles.get(leaf.name)!) && mono(heights.get(leaf.name)!));
    // 每一片都必须同时满足两个条件：气动力是全体共享的同一个场，
    // 有叶子不螺旋就说明它拿到的气流不是那个场。
    expect(spiralling.length, '有枯叶未沿螺旋线上升').toBe(leaves.length);
    // 幅度下限：至少绕过 1rad 且升高一屏的十分之一，微动不算「卷起」。
    for (const leaf of leaves) {
      const a = angles.get(leaf.name)!;
      const h = heights.get(leaf.name)!;
      expect(a[a.length - 1] - a[0]).toBeGreaterThan(1);
      expect(h[h.length - 1] - h[0]).toBeGreaterThan(ctx.height * 0.1);
    }
    stage.dispose();
  });

  it('互动一续：枯叶贴着尘卷漏斗壁盘旋，不飞到卷外', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const short = Math.min(ctx.width, ctx.height);
    at(stage, 0.6);
    const axisX = node(ctx.root, 'whirl-axis').position.x;
    // 漏斗壁的最大半径就是卷顶半宽；叶子若跑到壁外，
    // 「沿尘卷螺旋线上升」只是两条巧合曲线而非同一份真值驱动。
    for (const leaf of leafNodes(ctx.root)) {
      const r = Math.hypot(leaf.position.x - axisX, leaf.position.z);
      expect(r, `${leaf.name} 飞出漏斗壁`).toBeLessThan(short * 0.42 * 1.35);
    }
    stage.dispose();
  });

  it('互动二：砂纹随风力增强（uniform 与风力正相关，非常量）', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const read = (t: number): number => {
      at(stage, t);
      return uniformOf(node(ctx.root, 'sand-ripples'), 'uStrength');
    };
    const rising = [read(0.05), read(0.15), read(0.3), read(0.5)];
    // 风力从成形到满力单调上升，砂纹跟着走。
    expect(rising.every((v, i) => i === 0 || v > rising[i - 1])).toBe(true);
    // 尾幕风力回落，砂纹也必须回落（不是只会变强的单向计数器）。
    expect(read(0.95)).toBeLessThan(rising[3]);
    // 砂纹脊线绕涡轴弯曲：uAxis 跟着涡轴走，两张图不是互不相关。
    at(stage, 0.3);
    const ripples = node(ctx.root, 'sand-ripples') as THREE.Mesh;
    const uniforms = (ripples.material as THREE.ShaderMaterial).uniforms;
    const early = (uniforms.uAxis.value as THREE.Vector2).x;
    at(stage, 0.8);
    expect((uniforms.uAxis.value as THREE.Vector2).x).toBeGreaterThan(early);
    stage.dispose();
  });

  it('三幕推进：各幕视觉状态互不相同', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    // 0–250 气旋成形 / 250–900 卷扬+枯叶 / 900–1200 减弱+沙沉
    at(stage, 0.1); const act1 = snapshot(ctx.root);
    at(stage, 0.5); const act2 = snapshot(ctx.root);
    at(stage, 0.95); const act3 = snapshot(ctx.root);
    expect(act1).not.toBe(act2);
    expect(act2).not.toBe(act3);
    stage.dispose();
  });

  it('第一幕气旋成形：尘卷自地面拧起，风眼此时尚未张开', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const form = (t: number): number => {
      at(stage, t);
      return uniformOf(node(ctx.root, 'dust-funnel'), 'uForm');
    };
    const seeded = form(0.05);
    expect(seeded).toBeGreaterThan(0);
    expect(form(0.15)).toBeGreaterThan(seeded);
    expect(form(0.3)).toBeGreaterThan(form(0.15));
    // 风眼张开滞后于成形：气旋先有尘壁，眼壁立起来之后才空出来的。
    at(stage, 0.1);
    expect(uniformOf(node(ctx.root, 'wind-eye'), 'uOpen')).toBe(0);
    at(stage, 0.6);
    expect(uniformOf(node(ctx.root, 'wind-eye'), 'uOpen')).toBeGreaterThan(0.3);
    stage.dispose();
  });

  it('第三幕减弱沙沉：尘卷密度回落、枯叶与尘幕淡出', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    at(stage, 0.5);
    const peakDensity = uniformOf(node(ctx.root, 'dust-funnel'), 'uDensity');
    const peakLeaf = opacity(leafNodes(ctx.root)[0]);
    at(stage, 0.97);
    expect(uniformOf(node(ctx.root, 'dust-funnel'), 'uDensity')).toBeLessThan(peakDensity);
    expect(opacity(leafNodes(ctx.root)[0])).toBeLessThan(peakLeaf);
    // 沙沉：尘卷随沙一起塌下去一点。
    at(stage, 0.5);
    const standing = node(ctx.root, 'dust-funnel').position.y;
    at(stage, 0.99);
    expect(node(ctx.root, 'dust-funnel').position.y).toBeLessThan(standing);
    stage.dispose();
  });

  it('风声频闪：尘粒密度按节奏起伏，主幕最烈、首尾几乎不闪', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const strobe = node(ctx.root, 'wind-strobe');
    const dust = node(ctx.root, 'wind-streamlines') as THREE.Points;
    const samples: number[] = [];
    for (let i = 0; i < 24; i += 1) {
      const t = 0.25 + (i / 24) * 0.6;
      at(stage, t);
      samples.push((dust.material as THREE.PointsMaterial).opacity);
    }
    // 节奏 = 起伏，不是单调曲线：抽样里必须同时出现升与降。
    const ups = samples.filter((v, i) => i > 0 && v > samples[i - 1]).length;
    const downs = samples.filter((v, i) => i > 0 && v < samples[i - 1]).length;
    expect(ups).toBeGreaterThan(2);
    expect(downs).toBeGreaterThan(2);
    // 频闪薄膜在主幕可见、首尾接近熄灭。
    at(stage, 0.02); const head = opacity(strobe);
    let peak = 0;
    for (let i = 0; i < 24; i += 1) {
      at(stage, 0.3 + (i / 24) * 0.4);
      peak = Math.max(peak, opacity(strobe));
    }
    expect(peak).toBeGreaterThan(head);
    stage.dispose();
  });

  it('云层快速掠过：两层反向速度差，位置随幕推进改变', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const clouds = node(ctx.root, 'rush-clouds');
    // 「掠过」的纵深来自层间速度差，单层云只是一块滑动的贴图。
    expect(clouds.children.length).toBeGreaterThanOrEqual(2);
    at(stage, 0.2);
    const early = clouds.children.map((c) => c.position.x);
    at(stage, 0.6);
    const late = clouds.children.map((c) => c.position.x);
    expect(late.some((x, i) => x !== early[i])).toBe(true);
    // 云层在尘幕之后：它是背景，不该盖住尘卷。
    expect(clouds.position.z).toBeLessThan(node(ctx.root, 'wind-streamlines').position.z);
    stage.dispose();
  });

  it('降档只减密度：medium 档八元素齐备，粒子与叶片严格变少', () => {
    const hi = makeCtx({ quality: 'cinematic' });
    const lo = makeCtx({ quality: 'medium' });
    const a = scene!.create(hi);
    const b = scene!.create(lo);
    at(a, 0.5, 'cinematic');
    at(b, 0.5, 'medium');

    for (const element of REQUIRED) {
      expect(names(lo.root), `medium 档缺 ${element}`).toContain(element);
      expect(names(hi.root), `cinematic 档缺 ${element}`).toContain(element);
    }
    for (const layer of ['wind-streamlines', 'dust-veil']) {
      expect(dustCount(lo.root, layer)).toBeLessThan(dustCount(hi.root, layer));
      expect(dustCount(lo.root, layer), `${layer} 在 medium 档消失`).toBeGreaterThan(0);
    }
    expect(leafNodes(lo.root).length).toBeLessThan(leafNodes(hi.root).length);
    expect(leafNodes(lo.root).length, '枯叶在 medium 档消失').toBeGreaterThan(0);
    a.dispose(); b.dispose();
  });

  it('dispose 清空场景树且二次调用幂等', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    at(stage, 0.5);
    expect(ctx.root.children.length).toBeGreaterThan(0);
    stage.dispose();
    expect(ctx.root.children.length).toBe(0);
    // 幂等 + 释放后 update 静默失效（不得抛错、不得再往树上挂东西）。
    stage.dispose();
    at(stage, 0.8);
    expect(ctx.root.children.length).toBe(0);
  });
});
