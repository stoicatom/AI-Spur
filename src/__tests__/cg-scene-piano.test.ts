import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import '../overlay/cg-scenes/cg-piano';
import { resolveScene } from '../overlay/cg-scene-registry';
import {
  KEY_STRIKE_COUNT,
  PIANO_ACT1_END,
  PIANO_ACT2_END,
  PIANO_DURATION_MS,
  STAFF_LINE_COUNT,
  keyFlash,
  keyStrikeAt,
  keyToNote,
  melodyDensity,
  noteBornAt,
  noteToKey,
  pedalGlow,
  soundboardGlow,
} from '../overlay/cg-scenes/piano-melody';
import {
  NOTE_HOP_COUNT,
  NOTE_SHAPE_COUNT,
  noteDustFall,
  noteHeight,
  noteHopPhase,
  noteShape,
  noteX,
  staffLineGlow,
} from '../overlay/cg-scenes/piano-notes';
import { DUST_COUNT, dustLevel } from '../overlay/cg-scenes/piano-dust';
import { makeSceneCtx, names, node, nodes, uniformOf } from './cg-scene-harness';
import type { CgStage, CgStageContext } from '../overlay/cg-scene';
import type { EffectQuality } from '../shared/config';

/** 规格 §4.2 场景 38 的 8 个元素的具名节点（音尘由 quarks 承载，用锚点观测）。 */
const NAMED_ELEMENTS = [
  'piano-body',   // ① 琴身（②键闪 与 ⑥共鸣板光 是它的 uniform）
  'noteprite-0',  // ③ 音符精灵
  'staffline-0',  // ④ 五线谱线
  'pedal-glow',   // ⑤ 踏板辉光
  'beat-pulse',   // ⑦ 节拍闪烁
  'dust-anchor',  // ⑧ 音尘（发射锚点）
];

function build(overrides: Partial<CgStageContext> = {}): { stage: CgStage; ctx: CgStageContext } {
  const scene = resolveScene('piano');
  if (!scene) throw new Error('piano 场景未注册');
  const ctx = makeSceneCtx(overrides);
  return { stage: scene.create(ctx), ctx };
}

/** piano 时长 1800ms。 */
function at(stage: CgStage, t: number, quality: EffectQuality = 'cinematic'): void {
  stage.update(t, t * PIANO_DURATION_MS, quality);
}

/** 精确正则收集：`noteprite-N` 与 `note-` 类前缀相近，必须锁「名字-数字」全形。 */
function collectExact(root: THREE.Object3D, prefix: string): THREE.Object3D[] {
  const re = new RegExp(`^${prefix}-\\d+$`);
  return nodes(root).filter((o) => re.test(o.name));
}

function noteNode(root: THREE.Object3D, n: number): THREE.Object3D {
  return node(root, `noteprite-${n}`);
}

/** 读键闪 uniform 数组的第 i 项（键闪不是节点，是琴身 shader 的数组 uniform）。 */
function keyFlashUniform(root: THREE.Object3D, i: number): number {
  const mesh = node(root, 'piano-body') as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  const arr = mesh.material.uniforms.uKeyFlash.value as number[];
  return arr[i];
}

/** 读折算后的粒子时钟（quarks 在 Group 根下首帧自毁，锚点是唯一出口）。 */
function particleClock(root: THREE.Object3D): number {
  const value = node(root, 'dust-anchor').userData.particleT;
  if (typeof value !== 'number') throw new Error('dust-anchor 未暴露 particleT');
  return value;
}

function dustRate(root: THREE.Object3D): number {
  const value = node(root, 'dust-anchor').userData.dustRate;
  if (typeof value !== 'number') throw new Error('dust-anchor 未暴露 dustRate');
  return value;
}

describe('场景 38 piano（琴键狂想）', () => {
  it('注册项声明规格的 8 个元素与独立签名', () => {
    const scene = resolveScene('piano');
    expect(scene).not.toBeNull();
    expect(scene!.config.elements).toHaveLength(8);
    expect(scene!.config.title).toBe('琴键狂想');
    expect(scene!.config.signature).toContain('旋律演奏');
    expect(scene!.config.signature).toContain('逐一配对');
    expect(scene!.config.preset).toBe('note-dance');
  });

  it('八个元素全部建出具名节点', () => {
    const { stage, ctx } = build();
    at(stage, 0.5);
    const tree = names(ctx.root);
    for (const name of NAMED_ELEMENTS) expect(tree).toContain(name);
    stage.dispose();
  });

  it('音符与谱线建齐，各持独立材质实例', () => {
    const { stage, ctx } = build();
    at(stage, 0.5);
    const notes = collectExact(ctx.root, 'noteprite');
    expect(notes).toHaveLength(KEY_STRIKE_COUNT);
    expect(collectExact(ctx.root, 'staffline')).toHaveLength(STAFF_LINE_COUNT);
    // 形状与透明度是逐个的，共用一份材质会让七个音符同形同步。
    const mats = new Set(notes.map((m) => (m as THREE.Mesh).material));
    expect(mats.size).toBe(KEY_STRIKE_COUNT);
    stage.dispose();
  });

  // ── 签名一：键盘连击与音符逐一配对（全库唯一）──

  it('签名：配对可逆——keyToNote 与 noteToKey 互为逆运算', () => {
    for (let i = 0; i < KEY_STRIKE_COUNT; i += 1) {
      expect(noteToKey(keyToNote(i))).toBe(i);
    }
    for (let n = 0; n < KEY_STRIKE_COUNT; n += 1) {
      expect(keyToNote(noteToKey(n))).toBe(n);
    }
  });

  it('签名：正向配对是单射且覆盖全部音符（没有孤立音符，也没有撞车）', () => {
    // 单独成条：vitest 在一条 it 内首个断言失败即中止，把「可逆」「单射」
    // 「同刻」挤在一条里会让后两个性质失去独立的守门人。
    const images = Array.from({ length: KEY_STRIKE_COUNT }, (_, i) => keyToNote(i));
    expect(new Set(images).size).toBe(KEY_STRIKE_COUNT);
    for (let n = 0; n < KEY_STRIKE_COUNT; n += 1) {
      expect(images.includes(n), `音符 ${n} 没有对应的击键`).toBe(true);
    }
  });

  it('签名：键闪时刻与它生出的音符起跳时刻同刻（两侧读同一张表）', () => {
    for (let i = 0; i < KEY_STRIKE_COUNT; i += 1) {
      expect(noteBornAt(keyToNote(i))).toBeCloseTo(keyStrikeAt(i), 12);
    }
  });

  it('签名：音符起跳时刻恒等于生它那次击键的时刻（不是另铺一张表）', () => {
    // 判据不能写成 noteBornAt(n) === keyStrikeAt(noteToKey(n))：两边都过
    // noteToKey，把它改成恒返回 0 后等式照样成立（同义反复，测不到东西）。
    // 真正的可观测后果是「起跳时刻集合 == 击键时刻集合」，逐项对齐。
    const strikes = Array.from({ length: KEY_STRIKE_COUNT }, (_, i) => keyStrikeAt(i));
    const borns = Array.from({ length: KEY_STRIKE_COUNT }, (_, n) => noteBornAt(n));
    // 每个音符的起跳都落在某次击键上（没有凭空出现的音符）。
    for (const b of borns) {
      expect(strikes.some((s) => Math.abs(s - b) < 1e-12), `起跳 ${b} 不对应任何击键`)
        .toBe(true);
    }
    // 且七个音符的起跳互不相同——配对是单射的，不是全挤在一次击键上。
    expect(new Set(borns.map((b) => b.toFixed(12))).size).toBe(KEY_STRIKE_COUNT);
    // 反向：每次击键都恰好生出一个音符（没有空转的键）。
    for (const s of strikes) {
      const hits = borns.filter((b) => Math.abs(s - b) < 1e-12);
      expect(hits, `击键 ${s} 未生出恰好一个音符`).toHaveLength(1);
    }
    // 换连击总数：两张表必须一起变。若音符另有时间表，这条会漂。
    for (const count of [3, 5, 11]) {
      const ss = Array.from({ length: count }, (_, i) => keyStrikeAt(i, count));
      const bb = Array.from({ length: count }, (_, n) => noteBornAt(n, count));
      expect(new Set(bb.map((b) => b.toFixed(12))).size).toBe(count);
      for (const b of bb) {
        expect(ss.some((s) => Math.abs(s - b) < 1e-12)).toBe(true);
      }
    }
  });

  it('击键时刻严格递增且全部落在演奏幕内', () => {
    const times = Array.from({ length: KEY_STRIKE_COUNT }, (_, i) => keyStrikeAt(i));
    for (let i = 1; i < times.length; i += 1) {
      expect(times[i]).toBeGreaterThan(times[i - 1]);
    }
    expect(times[0]).toBeGreaterThanOrEqual(PIANO_ACT1_END);
    expect(times[times.length - 1]).toBeLessThan(PIANO_ACT2_END);
    // 越界序号无时刻（不会凭空多出一次击键）。
    expect(keyStrikeAt(-1)).toBe(Number.POSITIVE_INFINITY);
    expect(keyStrikeAt(KEY_STRIKE_COUNT)).toBe(Number.POSITIVE_INFINITY);
  });

  it('乐句前疏后密：相邻间隔单调收窄（不是节拍器）', () => {
    const gaps: number[] = [];
    for (let i = 1; i < KEY_STRIKE_COUNT; i += 1) {
      gaps.push(keyStrikeAt(i) - keyStrikeAt(i - 1));
    }
    for (let i = 1; i < gaps.length; i += 1) {
      expect(gaps[i]).toBeLessThan(gaps[i - 1]);
    }
  });

  it('② 键闪逐个亮起：每键以自己的击打时刻为原点，不是全体同闪', () => {
    for (let i = 0; i < KEY_STRIKE_COUNT; i += 1) {
      const t = keyStrikeAt(i);
      expect(keyFlash(i, t - 1e-4)).toBe(0);
      expect(keyFlash(i, t)).toBeCloseTo(1, 6);
      expect(keyFlash(i, t + 0.05)).toBeLessThan(1);
    }
    // 「逐个」的可测出口：键 0 已在衰减时，末键还没亮。
    const early = keyStrikeAt(0) + 0.02;
    expect(keyFlash(0, early)).toBeGreaterThan(0);
    expect(keyFlash(KEY_STRIKE_COUNT - 1, early)).toBe(0);
  });

  // ── 签名二：跃动而非飘升（与 saxophone 的摇曳对立）──

  it('签名：竖向轨迹是抛物线段拼接，速度在落点换号（跃动）', () => {
    const n = 1;
    const born = noteBornAt(n);
    const h = 1e-4;
    let signChanges = 0;
    let prevSign = 0;
    // 扫过完整的三跳，统计竖向速度的换号次数。
    for (let k = 1; k < NOTE_HOP_COUNT * 60; k += 1) {
      const t = born + (k / 60) * (NOTE_HOP_COUNT * 0.075);
      const v = noteHeight(n, t + h) - noteHeight(n, t - h);
      const s = Math.sign(v);
      if (s !== 0 && prevSign !== 0 && s !== prevSign) signChanges += 1;
      if (s !== 0) prevSign = s;
    }
    // 三跳意味着「升—落」重复三次：至少两次由升转落的换号。
    expect(signChanges).toBeGreaterThanOrEqual(2);
  });

  it('每跳内确有升—顶—落：段中点高于两端', () => {
    const n = 2;
    const born = noteBornAt(n);
    const span = 0.075;
    for (let hop = 0; hop < NOTE_HOP_COUNT - 1; hop += 1) {
      const t0 = born + hop * span;
      const mid = noteHeight(n, t0 + span * 0.5);
      const start = noteHeight(n, t0 + span * 0.02);
      const end = noteHeight(n, t0 + span * 0.98);
      expect(mid).toBeGreaterThan(start);
      expect(mid).toBeGreaterThan(end);
    }
  });

  it('跳数有上界：跳完就不再升（音符不会一路飞出屏幕）', () => {
    const n = 0;
    const born = noteBornAt(n);
    expect(noteHopPhase(n, born - 1e-4)).toBe(0);
    expect(noteHopPhase(n, born)).toBe(0);
    expect(noteHopPhase(n, 1)).toBe(NOTE_HOP_COUNT);
    // 跳满之后高度不再变。
    const done = noteHeight(n, born + NOTE_HOP_COUNT * 0.075 + 0.05);
    expect(noteHeight(n, 1)).toBeCloseTo(done, 9);
  });

  it('起跳前恒在键面：没被击的键不会有音符', () => {
    for (let n = 0; n < KEY_STRIKE_COUNT; n += 1) {
      expect(noteHeight(n, 0)).toBe(0);
      expect(noteHeight(n, PIANO_ACT1_END * 0.5)).toBe(0);
      expect(noteHeight(n, noteBornAt(n) - 1e-4)).toBe(0);
    }
  });

  it('音符沿谱向右行进，且七个音符横向错开（一排而非一柱）', () => {
    const t = PIANO_ACT2_END * 0.9;
    const xs = Array.from({ length: KEY_STRIKE_COUNT }, (_, n) => noteX(n, t));
    for (let n = 1; n < xs.length; n += 1) {
      expect(xs[n]).toBeGreaterThan(xs[n - 1]);
    }
    // 单个音符自身随跳数右移。
    const n = 3;
    const born = noteBornAt(n);
    expect(noteX(n, born + 0.2)).toBeGreaterThan(noteX(n, born + 0.02));
  });

  it('三种音符形状轮转且由序号决定（重播两次序列一致）', () => {
    const shapes = Array.from({ length: KEY_STRIKE_COUNT }, (_, n) => noteShape(n));
    expect(new Set(shapes).size).toBe(NOTE_SHAPE_COUNT);
    for (const s of shapes) {
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(NOTE_SHAPE_COUNT);
    }
    // 同一序号恒得同一形状——不是随机。
    for (let n = 0; n < KEY_STRIKE_COUNT; n += 1) {
      expect(noteShape(n)).toBe(shapes[n]);
    }
  });

  // ── 互动①：音符跳完才成尘 ──

  it('互动①：坠落成尘严格晚于跳完（不是与音符同时出现）', () => {
    for (let n = 0; n < KEY_STRIKE_COUNT; n += 1) {
      const born = noteBornAt(n);
      // 还在跳时不起尘。
      expect(noteDustFall(n, born + 0.02)).toBe(0);
      expect(noteDustFall(n, born + NOTE_HOP_COUNT * 0.075 - 1e-4)).toBe(0);
      // 跳完之后才起。
      expect(noteDustFall(n, born + NOTE_HOP_COUNT * 0.075 + 0.05)).toBeGreaterThan(0);
    }
  });

  it('落尘强度归一化在 [0,1] 内，且多音符同落时叠加', () => {
    // 没有上界检查时，把归一化除数删掉（强度整体放大数倍）不会被发现。
    let peak = 0;
    for (let t = 0; t <= 1; t += 1 / 480) {
      const v = dustLevel(t);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      peak = Math.max(peak, v);
    }
    // 峰值必须真的用到量程（既不恒为 0，也不是一路顶满）。
    expect(peak).toBeGreaterThan(0.2);
    expect(peak).toBeLessThan(1);
    // 叠加语义：只有一个音符在落时的最强值，必须低于多个音符同落时的
    // 最强值。逐帧统计「此刻有几个音符在落」，再各取该状态下的峰值——
    // 取固定采样点会碰巧落在同一档上（音符落尘窗口比击键间隔宽得多）。
    let peakWhenOne = 0;
    let peakWhenMany = 0;
    for (let t = 0; t <= 1; t += 1 / 480) {
      let active = 0;
      for (let n = 0; n < KEY_STRIKE_COUNT; n += 1) {
        const f = noteDustFall(n, t);
        if (f > 0 && f < 1) active += 1;
      }
      if (active === 1) peakWhenOne = Math.max(peakWhenOne, dustLevel(t));
      if (active >= 2) peakWhenMany = Math.max(peakWhenMany, dustLevel(t));
    }
    expect(peakWhenOne).toBeGreaterThan(0);
    expect(peakWhenMany).toBeGreaterThan(peakWhenOne);
  });

  it('落尘强度门控在音符坠落上：演奏前恒为 0', () => {
    expect(dustLevel(0)).toBe(0);
    expect(dustLevel(PIANO_ACT1_END)).toBe(0);
    // 第一个音符跳完之后才有尘。
    const firstDone = noteBornAt(0) + NOTE_HOP_COUNT * 0.075;
    expect(dustLevel(firstDone - 1e-3)).toBe(0);
    expect(dustLevel(firstDone + 0.06)).toBeGreaterThan(0);
  });

  it('④ 谱线被音符点亮：无音符邻近的时刻恒暗', () => {
    // 演奏前所有谱线全暗（音符都在键面）。
    for (let j = 0; j < STAFF_LINE_COUNT; j += 1) {
      expect(staffLineGlow(j, PIANO_ACT1_END * 0.5)).toBe(0);
    }
    // 演奏中至少有一条被点亮。
    let lit = 0;
    for (let t = PIANO_ACT1_END; t <= PIANO_ACT2_END; t += 1 / 120) {
      for (let j = 0; j < STAFF_LINE_COUNT; j += 1) {
        if (staffLineGlow(j, t) > 0.2) lit += 1;
      }
    }
    expect(lit).toBeGreaterThan(0);
  });

  it('谱线亮度随踏板包络缩放（延音让谱线更亮）', () => {
    // 同一「音符邻近度」下，踏板深的时刻更亮。取一个有音符邻近的 t，
    // 再与踏板已松开的第三幕同构时刻比。
    let probe = -1;
    for (let t = PIANO_ACT1_END; t <= PIANO_ACT2_END; t += 1 / 240) {
      if (staffLineGlow(0, t) > 0.3) { probe = t; break; }
    }
    expect(probe).toBeGreaterThan(0);
    expect(pedalGlow(probe)).toBeGreaterThan(0.5);
    // 踏板在第三幕退到接近 0。
    expect(pedalGlow(1)).toBeCloseTo(0, 6);
  });

  // ── ⑤⑥⑦ 环境层与节奏 ──

  it('⑤ 踏板：起奏踩下、演奏段保持、尾声松开', () => {
    expect(pedalGlow(0)).toBe(0);
    expect(pedalGlow(PIANO_ACT1_END)).toBeCloseTo(0.9, 6);
    expect(pedalGlow((PIANO_ACT1_END + PIANO_ACT2_END) * 0.5)).toBeCloseTo(0.9, 6);
    expect(pedalGlow(1)).toBeCloseTo(0, 6);
    // 演奏段内不抖动（是包络不是脉冲）。
    let prev = -1;
    for (let t = PIANO_ACT1_END; t <= PIANO_ACT2_END; t += 1 / 120) {
      const g = pedalGlow(t);
      if (prev >= 0) expect(g).toBeCloseTo(prev, 9);
      prev = g;
    }
  });

  it('⑥ 共鸣板光比键闪钝且有余响（幕末仍有底光）', () => {
    const i = 0;
    const t = keyStrikeAt(i);
    // 同一时刻：键闪已冲到顶，共鸣板还在积累。
    expect(keyFlash(i, t)).toBeCloseTo(1, 6);
    expect(soundboardGlow(t)).toBeLessThan(1);
    // 键闪退到近零时，共鸣板仍有值。
    const late = t + 0.5;
    expect(keyFlash(i, late)).toBeLessThan(0.02);
    expect(soundboardGlow(late)).toBeGreaterThan(keyFlash(i, late));
    // 幕末底光犹存。
    expect(soundboardGlow(PIANO_ACT2_END)).toBeGreaterThan(0);

    // 关键：上面「共鸣板 > 键闪」被七键叠加掩护着——即使把余响时长改成
    // 与键闪相同，七个键的和照样大于单键。所以要直接测**衰减时长**：
    // 只看第一个键单独存在的那一小段（后续键还没落），共鸣板的半衰期
    // 必须显著长于键闪。
    const t0 = keyStrikeAt(0);
    const t1 = keyStrikeAt(1);
    // 取 t0 与 t1 之间，此时只有键 0 在响。
    const a = t0 + (t1 - t0) * 0.25;
    const b = t0 + (t1 - t0) * 0.9;
    expect(b).toBeLessThan(t1);
    const flashRatio = keyFlash(0, b) / keyFlash(0, a);
    const boardRatio = soundboardGlow(b) / soundboardGlow(a);
    // 衰减更慢 ⇒ 同一时间跨度内保留的比例更高。
    expect(boardRatio).toBeGreaterThan(flashRatio * 1.5);
  });

  it('⑦ 节拍闪烁读旋律密度：击键处起峰，演奏前恒为 0', () => {
    expect(melodyDensity(0)).toBe(0);
    expect(melodyDensity(PIANO_ACT1_END * 0.5)).toBe(0);
    // 每次击键都推高密度。
    for (let i = 0; i < KEY_STRIKE_COUNT; i += 1) {
      expect(melodyDensity(keyStrikeAt(i))).toBeGreaterThan(0);
    }
    // 后半段更密：末键处的密度高于首键处（多个键的余光叠加）。
    expect(melodyDensity(keyStrikeAt(KEY_STRIKE_COUNT - 1)))
      .toBeGreaterThan(melodyDensity(keyStrikeAt(0)));
  });

  it('三幕边界取自 1800ms 时间表', () => {
    expect(PIANO_ACT1_END).toBeCloseTo(400 / 1800, 9);
    expect(PIANO_ACT2_END).toBeCloseTo(1350 / 1800, 9);
    expect(PIANO_DURATION_MS).toBe(1800);
  });

  // ── 场景状态：签名必须落到节点上 ──

  it('签名落到场景状态：键闪逐个写入 uniform 数组', () => {
    const { stage, ctx } = build();
    const t = keyStrikeAt(1) + 0.005;
    at(stage, t);
    // 键 1 已亮，末键还没。
    expect(keyFlashUniform(ctx.root, 1)).toBeGreaterThan(0.9);
    expect(keyFlashUniform(ctx.root, KEY_STRIKE_COUNT - 1)).toBe(0);
    // 数组长度恒等于连击数（不多不少）。
    const mesh = node(ctx.root, 'piano-body') as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
    expect((mesh.material.uniforms.uKeyFlash.value as number[])).toHaveLength(KEY_STRIKE_COUNT);
    stage.dispose();
  });

  it('签名落到场景状态：音符竖向位置随跳数升高，横向随之右移', () => {
    const { stage, ctx } = build();
    const n = 2;
    const born = noteBornAt(n);
    at(stage, born + 0.02);
    const early = noteNode(ctx.root, n).position.clone();
    at(stage, born + NOTE_HOP_COUNT * 0.075);
    const late = noteNode(ctx.root, n).position.clone();
    expect(late.y).toBeGreaterThan(early.y);
    expect(late.x).toBeGreaterThan(early.x);
    stage.dispose();
  });

  it('音符起跳前不可见，起跳后现形（uAlpha 是配对的可视出口）', () => {
    const { stage, ctx } = build();
    const n = 4;
    at(stage, noteBornAt(n) - 1e-3);
    expect(uniformOf(noteNode(ctx.root, n), 'uAlpha')).toBe(0);
    at(stage, noteBornAt(n) + 0.03);
    expect(uniformOf(noteNode(ctx.root, n), 'uAlpha')).toBeGreaterThan(0);
    stage.dispose();
  });

  it('音符形状在建件后写死，不随时间变（同一音符不会换形状）', () => {
    const { stage, ctx } = build();
    at(stage, PIANO_ACT1_END);
    const before = Array.from(
      { length: KEY_STRIKE_COUNT },
      (_, n) => uniformOf(noteNode(ctx.root, n), 'uShape'),
    );
    at(stage, PIANO_ACT2_END);
    for (let n = 0; n < KEY_STRIKE_COUNT; n += 1) {
      expect(uniformOf(noteNode(ctx.root, n), 'uShape')).toBe(before[n]);
      expect(uniformOf(noteNode(ctx.root, n), 'uShape')).toBe(noteShape(n));
    }
    stage.dispose();
  });

  it('谱线与踏板/节拍的 uniform 由对应纯函数驱动', () => {
    const { stage, ctx } = build();
    const t = PIANO_ACT2_END * 0.8;
    at(stage, t);
    for (let j = 0; j < STAFF_LINE_COUNT; j += 1) {
      expect(uniformOf(node(ctx.root, `staffline-${j}`), 'uGlow'))
        .toBeCloseTo(staffLineGlow(j, t), 6);
    }
    expect(uniformOf(node(ctx.root, 'pedal-glow'), 'uIntensity'))
      .toBeCloseTo(pedalGlow(t), 6);
    expect(uniformOf(node(ctx.root, 'beat-pulse'), 'uIntensity'))
      .toBeGreaterThan(0);
    stage.dispose();
  });

  it('尾声渐弱：第三幕的衰减快于纯函数自身的衰减（fade 真的在起作用）', () => {
    // 不能拿「第二幕某点」与「t=1」直接比：共鸣板与节拍本身就在衰减，
    // 即使 fade 恒为 1 那个比较也成立（实测该变异存活）。判据要隔离出
    // fade 的贡献——同一时刻的场景值必须严格低于纯函数值，且第三幕越
    // 往后差得越多。
    const { stage, ctx } = build();
    const t1 = PIANO_ACT2_END + (1 - PIANO_ACT2_END) * 0.35;
    const t2 = PIANO_ACT2_END + (1 - PIANO_ACT2_END) * 0.95;

    at(stage, t1);
    const board1 = uniformOf(node(ctx.root, 'piano-body'), 'uBoardGlow');
    const ratio1 = board1 / soundboardGlow(t1);

    at(stage, t2);
    const board2 = uniformOf(node(ctx.root, 'piano-body'), 'uBoardGlow');
    const ratio2 = board2 / soundboardGlow(t2);

    // 场景值被 fade 压低：比例 < 1，且越往后压得越狠。
    expect(ratio1).toBeLessThan(1);
    expect(ratio2).toBeLessThan(ratio1);
    // 第三幕开始处不压（fade 从 1 起算）。
    at(stage, PIANO_ACT2_END);
    expect(uniformOf(node(ctx.root, 'piano-body'), 'uBoardGlow'))
      .toBeCloseTo(soundboardGlow(PIANO_ACT2_END), 6);
    stage.dispose();
  });

  it('⑧ 音尘发射率读落尘强度，且锚点落在键面', () => {
    const { stage, ctx } = build();
    at(stage, PIANO_ACT1_END);
    expect(dustRate(ctx.root)).toBe(0);
    // 第一个音符跳完之后起尘。
    at(stage, noteBornAt(0) + NOTE_HOP_COUNT * 0.075 + 0.06);
    expect(dustRate(ctx.root)).toBeGreaterThan(0);
    // 锚点在键面高度（不是屏心）。
    const anchor = node(ctx.root, 'dust-anchor');
    expect(anchor.position.y).toBeLessThan(0);
    stage.dispose();
  });

  // ── 稀疏 update / 降档 / dispose ──

  it('粒子时钟按场景时间轴折算，不随 update 次数漂移', () => {
    // mesh 状态是 t 的纯函数，稀疏/密集本来就相等——真正会漂的是粒子时钟。
    // 若把 hub.update 改成每帧固定推一步，调用次数就会直接写进粒子时间，
    // 这条断言即变红。
    const few = build();
    const many = build();
    at(few.stage, PIANO_ACT2_END);
    for (let i = 1; i <= 24; i += 1) at(many.stage, (i / 24) * PIANO_ACT2_END);
    expect(particleClock(few.ctx.root)).toBeGreaterThan(0);
    expect(particleClock(few.ctx.root)).toBeCloseTo(particleClock(many.ctx.root), 5);
    // 且确实推进到了该有的刻度，不是恒为 0 的空壳。
    const target = PIANO_ACT2_END * 1.8;
    expect(particleClock(few.ctx.root)).toBeGreaterThan(target - 1 / 60 - 1e-9);
    expect(particleClock(few.ctx.root)).toBeLessThanOrEqual(target + 1e-9);
    few.stage.dispose();
    many.stage.dispose();
  });

  it('稀疏 update 与密集 update 同结果（时变场不吃 frameDelta）', () => {
    const sparse = build();
    at(sparse.stage, 0.5);
    at(sparse.stage, PIANO_ACT2_END);

    const dense = build();
    for (let t = 0; t <= PIANO_ACT2_END; t += 1 / 240) at(dense.stage, t);
    at(dense.stage, PIANO_ACT2_END);

    for (let n = 0; n < KEY_STRIKE_COUNT; n += 1) {
      expect(noteNode(sparse.ctx.root, n).position.y)
        .toBeCloseTo(noteNode(dense.ctx.root, n).position.y, 6);
      expect(noteNode(sparse.ctx.root, n).position.x)
        .toBeCloseTo(noteNode(dense.ctx.root, n).position.x, 6);
      expect(keyFlashUniform(sparse.ctx.root, n))
        .toBeCloseTo(keyFlashUniform(dense.ctx.root, n), 6);
    }
    expect(dustRate(sparse.ctx.root)).toBeCloseTo(dustRate(dense.ctx.root), 6);
    sparse.stage.dispose();
    dense.stage.dispose();
  });

  it('低档位 8 元素一个不少，配对载体不被 scaledCount 削掉', () => {
    for (const quality of ['low', 'medium', 'high', 'cinematic'] as EffectQuality[]) {
      const { stage, ctx } = build({ quality });
      at(stage, PIANO_ACT2_END, quality);
      const tree = names(ctx.root);
      for (const name of NAMED_ELEMENTS) {
        expect(tree, `${quality} 档缺元素 ${name}`).toContain(name);
      }
      // 签名载体：音符数与谱线数不随档位缩放——七个键必须有七个音符，
      // 削掉任何一个都会让「一一对应」不成立。
      expect(collectExact(ctx.root, 'noteprite'), `${quality} 档音符被削`)
        .toHaveLength(KEY_STRIKE_COUNT);
      expect(collectExact(ctx.root, 'staffline'), `${quality} 档谱线被削`)
        .toHaveLength(STAFF_LINE_COUNT);
      stage.dispose();
    }
  });

  it('降档只减粒子密度，不改配对与轨迹', () => {
    const low = build({ quality: 'low' });
    const cine = build({ quality: 'cinematic' });
    const t = noteBornAt(3) + 0.05;
    at(low.stage, t, 'low');
    at(cine.stage, t, 'cinematic');
    for (let n = 0; n < KEY_STRIKE_COUNT; n += 1) {
      expect(noteNode(low.ctx.root, n).position.y)
        .toBeCloseTo(noteNode(cine.ctx.root, n).position.y, 9);
      expect(keyFlashUniform(low.ctx.root, n))
        .toBeCloseTo(keyFlashUniform(cine.ctx.root, n), 9);
    }
    // 但音尘发射率必须更低：档位差别落在粒子密度上。
    const dustT = noteBornAt(0) + NOTE_HOP_COUNT * 0.075 + 0.06;
    at(low.stage, dustT, 'low');
    at(cine.stage, dustT, 'cinematic');
    expect(dustRate(low.ctx.root)).toBeLessThan(dustRate(cine.ctx.root));
    expect(dustRate(low.ctx.root)).toBeGreaterThan(0);
    low.stage.dispose();
    cine.stage.dispose();
  });

  it('DUST_COUNT 在低档仍有粒子（不被缩放到 0）', () => {
    expect(DUST_COUNT).toBeGreaterThan(0);
    const low = build({ quality: 'low' });
    at(low.stage, noteBornAt(0) + NOTE_HOP_COUNT * 0.075 + 0.06, 'low');
    expect(dustRate(low.ctx.root)).toBeGreaterThan(0);
    low.stage.dispose();
  });

  it('dispose 递归清空子树且幂等，不留残余子节点', () => {
    const { stage, ctx } = build();
    at(stage, PIANO_ACT2_END);
    // dispose 前先抓住嵌套容器的引用：group.clear() 只摘一层。
    const anchor = node(ctx.root, 'dust-anchor');
    expect(anchor.children.length).toBeGreaterThan(0);

    stage.dispose();
    stage.dispose();

    expect(ctx.root.children).toHaveLength(0);
    expect(anchor.children).toHaveLength(0);
    // dispose 后继续 update 静默失效，不抛。
    expect(() => at(stage, 0.9)).not.toThrow();
  });

  it('update 覆盖整幕不抛异常（含边界与越界 t）', () => {
    const { stage } = build();
    expect(() => {
      for (let t = -0.1; t <= 1.1; t += 1 / 120) at(stage, t);
    }).not.toThrow();
    stage.dispose();
  });
});
