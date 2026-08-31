/**
 * 场景 39 saxophone 的元素搭建。
 *
 * 命名规则：不同性质的节点前缀互不包含（`saxnote-N` 音符 /
 * `lightbeam-N` 光束 / `mist-anchor` 雾锚点），避免前缀匹配的断言
 * 测错对象（本项目曾因 `spark-` 与 `sparkle-` 撞车让物理断言测到贴片）。
 *
 * 按键流光与铜管反光带不建独立 mesh：管身 shader 里有 `uKeyLight[5]`
 * 数组与 `uSheenSeat`，一次绘制画完。所以这两个元素的可观测出口是
 * uniform 而非节点树。
 */
import * as THREE from 'three';
import type { CgStageContext } from '../cg-scene';
import { createSceneResources, type SceneResources } from '../cg-scene-kit';
import { createAdditivePlaneMaterial, createBlendedPlaneMaterial } from '../cg-shaders';
import { SAX_BEAM_COUNT, SAX_KEY_COUNT, SAX_NOTE_COUNT } from './sax-sway';
import {
  SAX_BEAM_FRAGMENT, SAX_BODY_FRAGMENT, SAX_MIST_FRAGMENT,
  SAX_NOTE_FRAGMENT, SAX_STAGE_FRAGMENT,
} from './sax-shaders';

type ShaderMesh = THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;

export type SaxParts = {
  readonly res: SceneResources;
  /** ① 克斯（含 ②按键流光 与 ⑤反光带 的 uniform）。 */
  readonly body: ShaderMesh;
  /** ③ 音符摇曳。 */
  readonly notes: ShaderMesh[];
  /** ④ 管口热雾。 */
  readonly mist: ShaderMesh;
  /** ⑦ 舞台暗幕（含 ⑥ 鼓点光的 uniform）。 */
  readonly stage: ShaderMesh;
  /** ⑧ 摇摆光束容器（摆角施加在容器上）与本体。 */
  readonly beamPivots: THREE.Group[];
  readonly beams: ShaderMesh[];
  /** 管口位置（音符与雾从这里出发，局部坐标）。 */
  readonly bellX: number;
  readonly bellY: number;
  /** 音符活动区上缘。 */
  readonly noteTopY: number;
  readonly width: number;
  readonly height: number;
  readonly short: number;
};

/** 萨克斯贴片占屏高的比例。 */
const SAX_H_FRAC = 0.56;
/** 管口在贴片内的归一化坐标（与 shader 里的喇叭口端点一致）。 */
const BELL_U = 0.28;
const BELL_V = 0.08;

/** 建 saxophone 场景的全部渲染件（音符粒子雾在 ./sax-mist）。 */
export function buildSaxParts(ctx: CgStageContext): SaxParts {
  const { width, height, color } = ctx;
  const res = createSceneResources(ctx.root, ctx.origin, 'sax-scene');
  const short = Math.min(width, height);

  // 黄铜与暖黄：素材色往铜色推，光束与音符取暖光，台取深褐。
  const brass = color.clone().lerp(new THREE.Color('#C79A3E'), 0.68);
  const sheen = color.clone().lerp(new THREE.Color('#FFF1C4'), 0.74);
  const noteColor = color.clone().lerp(new THREE.Color('#FFCE72'), 0.62);
  const beamColor = color.clone().lerp(new THREE.Color('#FFD9A0'), 0.58);
  const stageColor = color.clone().lerp(new THREE.Color('#2A1D12'), 0.72);

  // ⑦ 舞台暗幕：最底层，全屏。
  const stage = res.mesh(
    'stage-curtain',
    new THREE.PlaneGeometry(width * 1.08, height * 1.08),
    createBlendedPlaneMaterial({
      fragmentShader: SAX_STAGE_FRAGMENT,
      uniforms: {
        uColor: { value: stageColor },
        uAlpha: { value: 1 },
        uPulse: { value: 0 },
      },
    }),
  );
  stage.position.set(0, 0, -30);
  res.group.add(stage);

  // ⑧ 摇摆光束：从上方斜射，绕顶点摆动。两束反相所以会交叉。
  const beamPivots: THREE.Group[] = [];
  const beams: ShaderMesh[] = [];
  const beamH = height * 1.15;
  for (let b = 0; b < SAX_BEAM_COUNT; b += 1) {
    const pivot = new THREE.Group();
    pivot.name = `beampivot-${b}`;
    // 顶点在屏幕上方两侧：左束与右束对射，交叉在中下部。
    pivot.position.set((b === 0 ? -1 : 1) * width * 0.24, height * 0.52, -26 + b);
    res.group.add(pivot);

    const mesh = res.mesh(
      `lightbeam-${b}`,
      new THREE.PlaneGeometry(short * 0.62, beamH),
      createAdditivePlaneMaterial({
        fragmentShader: SAX_BEAM_FRAGMENT,
        uniforms: {
          uColor: { value: beamColor },
          uAlpha: { value: 1 },
          uLevel: { value: 0 },
        },
      }),
    );
    // 贴片顶边贴住 pivot：绕 pivot 转即绕光源顶点摆。
    mesh.position.set(0, -beamH * 0.5, 0);
    pivot.add(mesh);
    beamPivots.push(pivot);
    beams.push(mesh);
  }

  // ① 萨克斯 mesh。
  const saxH = height * SAX_H_FRAC;
  const saxW = saxH * 0.78;
  const body = res.mesh(
    'sax-body',
    new THREE.PlaneGeometry(saxW, saxH),
    createBlendedPlaneMaterial({
      fragmentShader: SAX_BODY_FRAGMENT,
      uniforms: {
        uColor: { value: brass },
        uSheenColor: { value: sheen },
        uAlpha: { value: 1 },
        // 数组 uniform 必须一次给足长度，后续只改元素不换数组。
        uKeyLight: { value: new Array<number>(SAX_KEY_COUNT).fill(0) },
        uSheenSeat: { value: 0.5 },
      },
    }),
  );
  // 萨克斯偏左下站位，右上留给音符摇曳的空间。
  const saxCenterX = -width * 0.22;
  const saxCenterY = -height * 0.14;
  body.position.set(saxCenterX, saxCenterY, -8);
  res.group.add(body);

  // 管口的世界位置：由 shader 里同一组端点常量换算，两处不各写一遍。
  const bellX = saxCenterX + (BELL_U - 0.5) * saxW;
  const bellY = saxCenterY + (BELL_V - 0.5) * saxH;
  const noteTopY = height * 0.46;

  // ④ 管口热雾：贴在管口上方。
  const mistH = short * 0.42;
  const mist = res.mesh(
    'breath-mist',
    new THREE.PlaneGeometry(short * 0.26, mistH),
    createAdditivePlaneMaterial({
      fragmentShader: SAX_MIST_FRAGMENT,
      uniforms: {
        uColor: { value: sheen },
        uAlpha: { value: 1 },
        uLevel: { value: 0 },
        uTime: { value: 0 },
      },
    }),
  );
  mist.position.set(bellX, bellY + mistH * 0.42, -6);
  res.group.add(mist);

  // ③ 音符摇曳：压在最前，各持独立材质（摆角与透明度逐个不同）。
  const notes: ShaderMesh[] = [];
  const noteR = short * 0.07;
  for (let n = 0; n < SAX_NOTE_COUNT; n += 1) {
    const mesh = res.mesh(
      `saxnote-${n}`,
      new THREE.PlaneGeometry(noteR * 2, noteR * 2),
      createAdditivePlaneMaterial({
        fragmentShader: SAX_NOTE_FRAGMENT,
        uniforms: {
          uColor: { value: noteColor },
          uAlpha: { value: 0 },
          uTilt: { value: 0 },
        },
      }),
    );
    mesh.position.set(bellX, bellY, -4 + n * 0.1);
    res.group.add(mesh);
    notes.push(mesh);
  }

  return {
    res, body, notes, mist, stage, beamPivots, beams,
    bellX, bellY, noteTopY, width, height, short,
  };
}
