/**
 * 场景 12 water 实现验收（设计规格 §4.2 场景 12）。
 *
 * 结构照标杆用例 cg-scene-ice.test.ts：八元素齐备、三幕推进、全屏覆盖、
 * 多元素互动、独立签名、资源释放。
 *
 * 物理断言一律咬**真实物理量**而不是视觉代理量：
 * - 水珠走抛物线 → 逐帧竖直速度单调递减（重力恒定），且存在上升转下降的拐点；
 * - 鹅卵石落地反弹 → 连续两次弹跳的峰高比小于 1（能量按 restitution 衰减）。
 * 拿「opacity 变了」「scale 变了」当物理证据无法区分真物理与脚本化插值。
 *
 * 节点前缀刻意互不包含（`drop-` / `spray-` / `pebble-`），且收集时用
 * **精确正则**锁定序号形态：本项目曾出现 `collect('shard-')` 把反光片
 * `shard-glint-N` 一并收进「刚体」的事故，48 个样本里混进 21 个抄位置的贴片，
 * 「重力逐帧加速」的断言实际测的是贴片，却照样是绿的。
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { resolveScene } from '../overlay/cg-scene-registry';
import '../overlay/cg-scenes';
import { makeSceneCtx, names, node, uniformOf, box, visualSnapshot } from './cg-scene-harness';
import type { CgStage } from '../overlay/cg-scene';

/** 场景总时长（ms），三幕断言用它把归一化进度换回毫秒。 */
const DURATION = 1200;

const scene = resolveScene('water');

function makeCtx(overrides: Parameters<typeof makeSceneCtx>[0] = {}) {
  return makeSceneCtx({ color: new THREE.Color('#7FD8FF'), ...overrides });
}

/** 推进到某个归一化进度（now 与 t 同步，物理由时间轴折算而非 frameDelta）。 */
function at(stage: CgStage, t: number): void {
  stage.update(t, t * DURATION, 'cinematic');
}

/**
 * 按**精确正则**收集节点，杜绝前缀撞车。
 * `/^drop-\d+$/` 只命中水珠，不会碰到 `droplet-field` 容器或 `spray-N`。
 */
function collectExact(root: THREE.Object3D, pattern: RegExp): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  root.traverse((o) => { if (pattern.test(o.name)) out.push(o); });
  return out;
}

const DROP_RE = /^drop-\d+$/;
const SPRAY_RE = /^spray-\d+$/;
const PEBBLE_RE = /^pebble-\d+$/;

/** 规格 §4.2 场景 12 的八元素，逐项对应场景树里的具名节点。 */
const REQUIRED_ELEMENTS = [
  'water-column',   // ① 水柱
  'droplet-field',  // ② 水珠
  'ripple-rings',   // ③ 涟漪环
  'water-mist',     // ④ 水雾
  'bed-light',      // ⑤ 底光
  'pebble-bed',     // ⑥ 鹅卵石
  'foam-spray',     // ⑦ 水花白边
  'rainbow-fringe', // ⑧ 虹影
];

describe('场景 12 water', () => {
  it('已注册且签名声明流体柱崩散与 downpour 的材质对照', () => {
    expect(scene).not.toBeNull();
    expect(scene!.config.signature).toContain('流体柱崩散');
    expect(scene!.config.signature).toContain('downpour');
    expect(scene!.config.preset).toBe('water-splash');
    expect(scene!.config.elements).toHaveLength(8);
  });

  it('八个规格元素全部落地为具名节点', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const tree = names(ctx.root);
    for (const element of REQUIRED_ELEMENTS) {
      expect(tree, `缺元素 ${element}`).toContain(element);
    }
    // 三类可寻址个体都不能是空壳。
    expect(collectExact(ctx.root, DROP_RE).length).toBeGreaterThan(10);
    expect(collectExact(ctx.root, SPRAY_RE).length).toBeGreaterThan(5);
    expect(collectExact(ctx.root, PEBBLE_RE).length).toBeGreaterThan(3);
    stage.dispose();
  });

  it('三幕推进：各幕视觉状态互不相同', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    // 0–250 涌起 / 250–850 崩散 / 850–1200 静复
    at(stage, 0.12);
    const act1 = visualSnapshot(ctx.root);
    at(stage, 0.5);
    const act2 = visualSnapshot(ctx.root);
    at(stage, 0.95);
    const act3 = visualSnapshot(ctx.root);
    expect(act1).not.toBe(act2);
    expect(act2).not.toBe(act3);
    stage.dispose();
  });

  it('签名：水柱涌起期高度单调增，崩散期回落且水珠数增加', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const column = node(ctx.root, 'water-column');
    const airborne = () => collectExact(ctx.root, DROP_RE).filter((d) => d.visible).length;

    // 涌起：第一幕内逐点采样，柱高必须严格单调增（水面在长高，不是淡入）。
    const rising: number[] = [];
    for (let i = 1; i <= 6; i += 1) {
      at(stage, (i / 6) * 0.2);
      rising.push(column.scale.y);
    }
    for (let i = 1; i < rising.length; i += 1) {
      expect(rising[i], `涌起期第 ${i} 步未长高`).toBeGreaterThan(rising[i - 1]);
    }

    // 峰值在第一幕末：这是「先涌起」的定义。
    at(stage, 0.2);
    const peak = column.scale.y;
    const dropsAtPeak = airborne();

    // 崩散：柱高回落，同时水珠数量上升——水量从柱体转成了水珠。
    at(stage, 0.62);
    const collapsing = column.scale.y;
    expect(collapsing, '崩散期柱高应回落').toBeLessThan(peak);
    expect(airborne(), '崩散期空中水珠应多于峰顶时刻').toBeGreaterThan(dropsAtPeak);
    // 失稳程度（分缕强度）随崩散推进上升。
    expect(uniformOf(column, 'uBreak')).toBeGreaterThan(0.2);

    // 静复：柱体抹平回水面。
    at(stage, 0.99);
    expect(column.scale.y, '尾幕柱体应基本抹平').toBeLessThan(peak * 0.35);
    stage.dispose();
  });

  it('物理：水珠走抛物线——竖直速度逐帧递减（重力恒定），且有上升转下降的拐点', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const drops = collectExact(ctx.root, DROP_RE);
    expect(drops.length).toBeGreaterThan(0);

    // 密集采样整段轨迹，逐颗记录高度与可见性（只有在空中的采样才算轨迹）。
    const STEPS = 120;
    const tracks = drops.map(() => [] as (number | null)[]);
    for (let i = 0; i <= STEPS; i += 1) {
      at(stage, i / STEPS);
      drops.forEach((d, idx) => tracks[idx].push(d.visible ? d.position.y : null));
    }

    let parabolic = 0;
    let apexed = 0;
    for (const track of tracks) {
      // 取该颗水珠连续可见的最长飞行段。
      let best: number[] = [];
      let run: number[] = [];
      for (const y of track) {
        if (y === null) { if (run.length > best.length) best = run; run = []; }
        else run.push(y);
      }
      if (run.length > best.length) best = run;
      if (best.length < 8) continue;

      // 一阶差分 = 竖直速度（采样等间距，故与真实 vy 成正比）。
      const vy: number[] = [];
      for (let i = 1; i < best.length; i += 1) vy.push(best[i] - best[i - 1]);
      // 重力恒定 ⇒ vy 严格单调递减。这是抛物线的**充分特征**，
      // 而「先升后降」只要一条折线就能满足。
      const monotone = vy.every((v, i) => i === 0 || v < vy[i - 1] + 1e-6);
      // 二阶差分（加速度）应基本恒定：抛物线的定义。
      const acc: number[] = [];
      for (let i = 1; i < vy.length; i += 1) acc.push(vy[i] - vy[i - 1]);
      const meanAcc = acc.reduce((a, b) => a + b, 0) / acc.length;
      const flat = acc.every((a) => Math.abs(a - meanAcc) < Math.abs(meanAcc) * 0.35 + 1e-6);
      // 加速度必须为**负**（向下）**且量级足够**。只写 meanAcc < 0 会被浮点
      // 噪声骗过去：重力改成 0 时直线轨迹的二阶差分是 ±1e-14 级的随机数，
      // 半数会碰巧为负而让断言照样变绿（本条已由变异验证证实）。
      // 判据取「弯曲量占速度量级的比例」，与屏幕尺度和采样密度都无关。
      const meanSpeed = vy.reduce((a, b) => a + Math.abs(b), 0) / vy.length;
      const bent = meanAcc < -meanSpeed * 0.005;
      if (monotone && flat && bent) parabolic += 1;
      // 拐点：出膛向上、末段向下。
      if (vy[0] > 0 && vy[vy.length - 1] < 0) apexed += 1;
    }
    // 绝大多数水珠都要是真抛物线，不是「个别一条像」。
    expect(parabolic, '应有多颗水珠呈恒定负加速度的抛物线').toBeGreaterThan(drops.length * 0.5);
    expect(apexed, '应有水珠越过顶点由升转降').toBeGreaterThan(drops.length * 0.3);
    stage.dispose();
  });

  it('物理：鹅卵石被水推起、落回泉底并反弹，弹跳峰高逐次衰减', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const pebbles = collectExact(ctx.root, PEBBLE_RE);
    const surfaceY = node(ctx.root, 'ripple-rings').children[0].position.y;
    expect(pebbles.length).toBeGreaterThan(0);

    // 第一幕内卵石不动：水柱还没涌起。
    at(stage, 0.05);
    const parked = pebbles.map((p) => p.position.y);

    const STEPS = 260;
    const tracks = pebbles.map(() => [] as number[]);
    for (let i = 1; i <= STEPS; i += 1) {
      at(stage, i / STEPS);
      pebbles.forEach((p, idx) => tracks[idx].push(p.position.y));
    }

    // 被水推动：至少半数卵石离开过泉底。
    const lifted = tracks.filter((ys, idx) => Math.max(...ys) > parked[idx] + 8).length;
    expect(lifted, '卵石应被涌起的水推离泉底').toBeGreaterThan(pebbles.length * 0.5);
    // 不穿透泉底。
    for (const ys of tracks) {
      expect(Math.min(...ys)).toBeGreaterThan(surfaceY - 12);
    }

    // 反弹衰减：只数**落地之后**的回跳峰。
    //
    // 不能笼统地「找连续两个局部峰、后峰更低」——被水推起的那一记抛射本身
    // 就是一个大峰，它后面接的「落地静止」平台也算一个更低的峰，
    // 于是把 restitution 整段删掉（卵石落地即停）这个断言照样是绿的
    // （本条已由变异验证证实）。回跳必须从**首次触底之后**开始数，
    // 且高度以该枚卵石自己的静止高度 parked 为零点——那就是泉底 + 半径。
    const bounceProfile = (ys: number[], rest: number): number[] => {
      // 首次触底：先被抬离泉底（>16px），再回到泉底附近（<4px）。
      let flew = false;
      let contact = -1;
      for (let i = 0; i < ys.length; i += 1) {
        if (ys[i] > rest + 16) flew = true;
        else if (flew && ys[i] <= rest + 4) { contact = i; break; }
      }
      if (contact < 0) return [];
      // 触底之后的回跳顶点（相对静止高度）。
      //
      // 先把**连续相等的采样压成一个值**再找严格局部极大。采样密度（260 步）
      // 高于物理步长（60Hz），同一物理位置会被连采两次，于是上升段长成
      // `6 6 11 11 16 16` 的阶梯；不压平的话 `y[i]>y[i-1] && y[i]>=y[i+1]`
      // 会把每一级台阶都当成峰，整条上升段都被算作「一串递增的峰」，
      // 后续的「后峰更低」判据就永远能在某处凑到，断言随之失效。
      const flat: number[] = [];
      for (let i = contact; i < ys.length; i += 1) {
        if (flat.length === 0 || Math.abs(ys[i] - flat[flat.length - 1]) > 1e-9) flat.push(ys[i]);
      }
      const peaks: number[] = [];
      for (let i = 1; i < flat.length - 1; i += 1) {
        if (flat[i] > flat[i - 1] && flat[i] > flat[i + 1] && flat[i] - rest > 3) {
          peaks.push(flat[i] - rest);
        }
      }
      return peaks;
    };

    const damped = tracks.some((ys, idx) => {
      const peaks = bounceProfile(ys, parked[idx]);
      // 至少两次回跳才谈得上「逐次衰减」：一次回跳区分不出弹性与脚本化过冲。
      if (peaks.length < 2) return false;
      // 第一记回跳要有实高度（不是接触噪声），且后一记明显更低。
      return peaks[0] > 8 && peaks[1] < peaks[0] * 0.9;
    });
    expect(damped, '卵石应有逐次衰减的落地反弹').toBe(true);
    stage.dispose();
  });

  it('互动一：涟漪由绑定水珠的触底时刻激起（不是定时器）', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const rings = node(ctx.root, 'ripple-rings').children;
    expect(rings.length).toBe(3);

    // 逐圈找出「首次出现非零半径」的进度点，即它的启动时刻。
    const STEPS = 240;
    const startedAt = rings.map(() => -1);
    const drops = collectExact(ctx.root, DROP_RE);
    // 每颗水珠首次消失（触底）的进度点。
    const wasVisible = drops.map(() => false);
    const impactAt = drops.map(() => -1);
    for (let i = 0; i <= STEPS; i += 1) {
      const t = i / STEPS;
      at(stage, t);
      rings.forEach((ring, idx) => {
        if (startedAt[idx] < 0 && uniformOf(ring, 'uRadius') > 0) startedAt[idx] = t;
      });
      drops.forEach((d, idx) => {
        if (wasVisible[idx] && !d.visible && impactAt[idx] < 0) impactAt[idx] = t;
        if (d.visible) wasVisible[idx] = true;
      });
    }

    for (const started of startedAt) {
      expect(started, '每圈涟漪都应被激起').toBeGreaterThan(0);
    }
    // 因果核心：每圈的启动时刻必须与**某颗水珠**的触底时刻吻合（±1 采样步），
    // 而不是均匀分布的定时点。
    const impacts = impactAt.filter((v) => v > 0);
    expect(impacts.length).toBeGreaterThan(0);
    const tol = 1.5 / STEPS;
    for (let i = 0; i < startedAt.length; i += 1) {
      const matched = impacts.some((imp) => Math.abs(imp - startedAt[i]) <= tol);
      expect(matched, `第 ${i} 圈涟漪的启动时刻 ${startedAt[i]} 未对应任何水珠触底`).toBe(true);
    }
    // 三圈不同时开：绑的是不同水珠，落水有先后。
    expect(new Set(startedAt.map((v) => v.toFixed(4))).size).toBeGreaterThan(1);
    stage.dispose();
  });

  it('互动一（续）：涟漪圆心落在绑定水珠的触底横坐标上', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const rings = node(ctx.root, 'ripple-rings').children;
    const drops = collectExact(ctx.root, DROP_RE);

    // 记录每颗水珠触底瞬间的横坐标。
    const STEPS = 240;
    const wasVisible = drops.map(() => false);
    const lastX = drops.map(() => Number.NaN);
    const impactX: number[] = [];
    for (let i = 0; i <= STEPS; i += 1) {
      at(stage, i / STEPS);
      drops.forEach((d, idx) => {
        if (wasVisible[idx] && !d.visible && !Number.isNaN(lastX[idx])) {
          impactX.push(d.position.x);
          lastX[idx] = Number.NaN;
          wasVisible[idx] = false;
          return;
        }
        if (d.visible) { wasVisible[idx] = true; lastX[idx] = d.position.x; }
      });
    }
    expect(impactX.length).toBeGreaterThan(0);

    // 每圈圆心都要能在落点集合里找到匹配（涟漪开在水珠落水处，不是钉在屏心）。
    for (let i = 0; i < rings.length; i += 1) {
      const cx = rings[i].position.x;
      const matched = impactX.some((x) => Math.abs(x - cx) < 2);
      expect(matched, `第 ${i} 圈圆心 ${cx} 不在任何水珠落点上`).toBe(true);
    }
    // 至少两圈圆心不同：否则三圈重叠，看不出「一滴一圈」。
    expect(new Set(rings.map((r) => r.position.x.toFixed(2))).size).toBeGreaterThan(1);
    stage.dispose();
  });

  it('互动二：水雾中心随水柱峰顶移动（柱涨雾升，柱崩雾落）', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const column = node(ctx.root, 'water-column');
    const mist = node(ctx.root, 'water-mist');
    const layer0 = mist.children[0];
    expect(mist.children.length).toBeGreaterThanOrEqual(2);

    // 采样若干进度点，比较柱顶高度与雾层中心高度的同向性。
    const crest: number[] = [];
    const mistY: number[] = [];
    for (let i = 1; i <= 24; i += 1) {
      at(stage, i / 24);
      // 柱顶 = 柱底 + 实际柱高（scale.y 乘单位高几何体）。
      crest.push(column.position.y + column.scale.y);
      mistY.push(layer0.position.y);
    }
    // 相关性：两条曲线的逐点差分必须同号（雾跟着柱顶走，不是各演各的）。
    let sameSign = 0;
    let compared = 0;
    for (let i = 1; i < crest.length; i += 1) {
      const dc = crest[i] - crest[i - 1];
      const dm = mistY[i] - mistY[i - 1];
      if (Math.abs(dc) < 1e-6) continue;
      compared += 1;
      if (Math.sign(dc) === Math.sign(dm)) sameSign += 1;
    }
    expect(compared).toBeGreaterThan(5);
    expect(sameSign, '雾层中心应与柱顶同向移动').toBe(compared);
    // 涌起期雾在高处、尾幕雾随柱落回：跨度要足够大才看得出「在峰顶散开」。
    expect(Math.max(...mistY) - Math.min(...mistY)).toBeGreaterThan(ctx.height * 0.1);
    stage.dispose();
  });

  it('全屏：水珠在末幕铺满半屏，水雾覆盖全屏', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);

    // 崩散末段取横向跨度：规格「水柱居中，水珠铺满半屏」。
    let spread = 0;
    for (const t of [0.55, 0.7, 0.82]) {
      at(stage, t);
      const xs = collectExact(ctx.root, DROP_RE)
        .filter((d) => d.visible)
        .map((d) => d.position.x);
      if (xs.length < 2) continue;
      spread = Math.max(spread, Math.max(...xs) - Math.min(...xs));
    }
    expect(spread, '水珠横向跨度应达半屏').toBeGreaterThanOrEqual(ctx.width * 0.5);

    // 水雾盖满全屏（体积雾是环境层，不是屏心一小块）。
    at(stage, 0.5);
    const size = box(node(ctx.root, 'water-mist')).getSize(new THREE.Vector3());
    expect(size.x).toBeGreaterThanOrEqual(ctx.width);
    expect(size.y).toBeGreaterThanOrEqual(ctx.height);
    // 虹影在屏缘，覆盖范围也要大过屏。
    expect(box(node(ctx.root, 'rainbow-fringe')).getSize(new THREE.Vector3()).x)
      .toBeGreaterThanOrEqual(ctx.width);
    stage.dispose();
  });

  it('底光与虹影按幕呼吸：涌起聚能、崩散最亮、尾幕回落', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const bed = node(ctx.root, 'bed-light');
    const fringe = node(ctx.root, 'rainbow-fringe');

    at(stage, 0.06);
    const early = uniformOf(bed, 'uEnergy');
    at(stage, 0.5);
    const mid = uniformOf(bed, 'uEnergy');
    const fringeMid = uniformOf(fringe, 'uAlpha');
    at(stage, 0.99);
    const late = uniformOf(bed, 'uEnergy');

    expect(mid).toBeGreaterThan(early);
    expect(late).toBeLessThan(mid);
    expect(fringeMid).toBeGreaterThan(0);
    // 色散带随水雾扩散推开：uSpread 单调增。
    at(stage, 0.2);
    const spreadEarly = uniformOf(fringe, 'uSpread');
    at(stage, 0.8);
    expect(uniformOf(fringe, 'uSpread')).toBeGreaterThan(spreadEarly);
    stage.dispose();
  });

  it('层序：底光在水体之下，虹影在最外层', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const bedZ = node(ctx.root, 'bed-light').position.z;
    const columnZ = node(ctx.root, 'water-column').position.z;
    const fringeZ = node(ctx.root, 'rainbow-fringe').position.z;
    expect(bedZ).toBeLessThan(columnZ);
    expect(fringeZ).toBeGreaterThan(columnZ);
    stage.dispose();
  });

  it('降档：medium 保留全部八元素，只有密度严格变少', () => {
    const hi = makeCtx({ quality: 'cinematic' });
    const lo = makeCtx({ quality: 'medium' });
    const a = scene!.create(hi);
    const b = scene!.create(lo);
    at(a, 0.6);
    b.update(0.6, 720, 'medium');

    for (const element of REQUIRED_ELEMENTS) {
      expect(names(lo.root), `medium 档缺 ${element}`).toContain(element);
      expect(names(hi.root), `cinematic 档缺 ${element}`).toContain(element);
    }
    for (const pattern of [DROP_RE, SPRAY_RE, PEBBLE_RE]) {
      const loN = collectExact(lo.root, pattern).length;
      const hiN = collectExact(hi.root, pattern).length;
      expect(loN, `${pattern} 低档应更稀疏`).toBeLessThan(hiN);
      expect(loN, `${pattern} 低档不得归零`).toBeGreaterThan(0);
    }
    a.dispose();
    b.dispose();
  });

  it('确定性：同一 t 稀疏调用与连续播放画面一致（R-PERF-001）', () => {
    const sparseCtx = makeCtx();
    const denseCtx = makeCtx();
    const sparse = scene!.create(sparseCtx);
    const dense = scene!.create(denseCtx);
    // 稀疏：直接跳到 0.7。连续：120 步走到 0.7。
    at(sparse, 0.7);
    for (let i = 1; i <= 120; i += 1) at(dense, (i / 120) * 0.7);
    // 水珠是闭式弹道，跳帧不影响；用它们的位置比对。
    const sparseXs = collectExact(sparseCtx.root, DROP_RE).map((d) => d.position.y.toFixed(2));
    const denseXs = collectExact(denseCtx.root, DROP_RE).map((d) => d.position.y.toFixed(2));
    expect(sparseXs).toEqual(denseXs);
    sparse.dispose();
    dense.dispose();
  });

  it('dispose 清空根节点且幂等，之后 update 静默失效', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    expect(ctx.root.children.length).toBeGreaterThan(0);
    stage.dispose();
    expect(ctx.root.children).toHaveLength(0);
    expect(() => stage.dispose()).not.toThrow();
    expect(() => at(stage, 0.5)).not.toThrow();
    expect(ctx.root.children).toHaveLength(0);
  });
});
