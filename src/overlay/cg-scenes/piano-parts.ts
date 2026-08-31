/**
 * 场景 38 piano 的元素搭建。
 *
 * 命名规则：不同性质的节点前缀互不包含（`noteprite-N` 音符 /
 * `staffline-N` 谱线 / `dust-anchor` 音尘锚点），避免前缀匹配的断言
 * 测错对象（本项目曾因 `spark-` 与 `sparkle-` 撞车让物理断言测到贴片）。
 *
 * 键闪不建 7 个 mesh：琴身 shader 里有 `uKeyFlash[7]` 数组，一次绘制
 * 画完整排键。所以「键闪」这一元素的可观测出口是 uniform 数组而非
 * 节点树——测试读 `uKeyFlash` 的第 i 项。
 */
import * as THREE from 'three';
import type { CgStageContext } from '../cg-scene';
import { createSceneResources, type SceneResources } from '../cg-scene-kit';
import { createAdditivePlaneMaterial, createBlendedPlaneMaterial } from '../cg-shaders';
import { KEY_STRIKE_COUNT, STAFF_LINE_COUNT } from './piano-melody';
import {
  NOTE_FRAGMENT, PIANO_BODY_FRAGMENT, PIANO_GLOW_FRAGMENT, STAFF_LINE_FRAGMENT,
} from './piano-shaders';

type ShaderMesh = THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;

export type PianoParts = {
  readonly res: SceneResources;
  /** ① 琴身（含 ②键闪 与 ⑥共鸣板光 的 uniform）。 */
  readonly body: ShaderMesh;
  /** ③ 音符精灵。 */
  readonly notes: ShaderMesh[];
  /** ④ 五线谱线。 */
  readonly staff: ShaderMesh[];
  /** ⑤ 踏板辉光。 */
  readonly pedal: ShaderMesh;
  /** ⑦ 节拍闪烁。 */
  readonly beat: ShaderMesh;
  /** 音符活动区的屏幕范围（像素）。 */
  readonly noteBandY0: number;
  readonly noteBandY1: number;
  readonly width: number;
  readonly short: number;
  /** 键面高度（音尘从这里升起）。 */
  readonly keyTopY: number;
};

/** 琴身占屏高的比例。 */
const BODY_H_FRAC = 0.3;
/** 音符区下缘（键面上方一点）。 */
const BAND_LOW = 0.02;
/** 音符区上缘：铺满上半屏。 */
const BAND_HIGH = 0.46;

/** 建 piano 场景的全部渲染件（音尘粒子层在 ./piano-dust）。 */
export function buildPianoParts(ctx: CgStageContext): PianoParts {
  const { width, height, color } = ctx;
  const res = createSceneResources(ctx.root, ctx.origin, 'piano-scene');
  const short = Math.min(width, height);

  // 乌木与暖黄：素材色往琴体的深色推，音符与谱线取暖光。
  const bodyColor = color.clone().lerp(new THREE.Color('#241C2E'), 0.58);
  const noteColor = color.clone().lerp(new THREE.Color('#FFD98A'), 0.6);
  const staffColor = color.clone().lerp(new THREE.Color('#9FD4FF'), 0.5);
  const pedalColor = color.clone().lerp(new THREE.Color('#FFB347'), 0.66);

  const bodyH = height * BODY_H_FRAC;
  const keyTopY = -height * 0.5 + bodyH * 0.52;
  const noteBandY0 = keyTopY + height * BAND_LOW;
  const noteBandY1 = keyTopY + height * BAND_HIGH;

  // ⑤ 踏板辉光：琴身之下垫底，最先建所以压在最后。
  const pedal = res.mesh(
    'pedal-glow',
    new THREE.PlaneGeometry(short * 0.42, short * 0.42),
    createAdditivePlaneMaterial({
      fragmentShader: PIANO_GLOW_FRAGMENT,
      uniforms: { uColor: { value: pedalColor }, uAlpha: { value: 1 }, uIntensity: { value: 0 } },
    }),
  );
  pedal.position.set(0, -height * 0.5 + bodyH * 0.12, -16);
  res.group.add(pedal);

  // ⑦ 节拍闪烁：全屏尺度的背景脉动，压在最底层。
  const beat = res.mesh(
    'beat-pulse',
    new THREE.PlaneGeometry(width * 1.1, height * 1.1),
    createAdditivePlaneMaterial({
      fragmentShader: PIANO_GLOW_FRAGMENT,
      uniforms: { uColor: { value: noteColor }, uAlpha: { value: 1 }, uIntensity: { value: 0 } },
    }),
  );
  beat.position.set(0, 0, -20);
  res.group.add(beat);

  // ④ 五线谱线：横贯全屏，自下而上五条铺在音符区内。
  const staff: ShaderMesh[] = [];
  for (let j = 0; j < STAFF_LINE_COUNT; j += 1) {
    const mesh = res.mesh(
      `staffline-${j}`,
      new THREE.PlaneGeometry(width * 1.02, short * 0.03),
      createAdditivePlaneMaterial({
        fragmentShader: STAFF_LINE_FRAGMENT,
        uniforms: { uColor: { value: staffColor }, uAlpha: { value: 1 }, uGlow: { value: 0 } },
      }),
    );
    // 与 staffLineGlow 的 seat 同一套换算：(j+0.5)/5 映到音符区内。
    const seat = (j + 0.5) / STAFF_LINE_COUNT;
    mesh.position.set(0, noteBandY0 + (noteBandY1 - noteBandY0) * seat, -14);
    res.group.add(mesh);
    staff.push(mesh);
  }

  // ① 琴身：键列 + 琴盖，含键闪与共鸣板光的 uniform。
  const body = res.mesh(
    'piano-body',
    new THREE.PlaneGeometry(width * 0.72, bodyH),
    createBlendedPlaneMaterial({
      fragmentShader: PIANO_BODY_FRAGMENT,
      uniforms: {
        uColor: { value: bodyColor },
        uAlpha: { value: 1 },
        // 数组 uniform 必须一次给足长度，后续只改元素不换数组。
        uKeyFlash: { value: new Array<number>(KEY_STRIKE_COUNT).fill(0) },
        uBoardGlow: { value: 0 },
      },
    }),
  );
  body.position.set(0, -height * 0.5 + bodyH * 0.5, -6);
  res.group.add(body);

  // ③ 音符精灵：压在谱线之上，每个持独立材质（形状与透明度逐个不同）。
  const notes: ShaderMesh[] = [];
  const noteR = short * 0.075;
  for (let n = 0; n < KEY_STRIKE_COUNT; n += 1) {
    const mesh = res.mesh(
      `noteprite-${n}`,
      new THREE.PlaneGeometry(noteR * 2, noteR * 2),
      createAdditivePlaneMaterial({
        fragmentShader: NOTE_FRAGMENT,
        uniforms: {
          uColor: { value: noteColor },
          uAlpha: { value: 0 },
          uShape: { value: 0 },
          uSpin: { value: 0 },
        },
      }),
    );
    mesh.position.set(0, noteBandY0, -4 + n * 0.1);
    res.group.add(mesh);
    notes.push(mesh);
  }

  return { res, body, notes, staff, pedal, beat, noteBandY0, noteBandY1, width, short, keyTopY };
}
