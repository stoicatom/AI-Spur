/**
 * 场景 20 drum 的元素搭建（鼓皮粒子物理在 ./drum-skin）。
 *
 * 视角：鼓略微俯视，鼓面因此是压扁的椭圆（SQUASH），环波也同样压扁
 * ——贴地荡开而不是空中光圈。正交相机下 1 世界单位 = 1 像素。
 *
 * 命名规则：不同性质的节点前缀互不包含（`drum-body` / `drum-mallet` /
 * `head-impact` / `ripple-N` 环波 / `skin-N` 鼓皮粒子 / `boom-smear` /
 * `spark-burst`），避免前缀匹配的断言测错对象。特别地，环波用
 * `ripple-` 而非 `ring-`，粒子用 `skin-` 而非 `head-`：后者会与鼓面
 * 节点 `head-impact` 撞车，让物理断言实际测到一张贴片。
 */
import * as THREE from 'three';
import type { CgStageContext } from '../cg-scene';
import { createSceneResources, type SceneResources } from '../cg-scene-kit';
import { createAdditivePlaneMaterial, createBlendedPlaneMaterial } from '../cg-shaders';
import { RIPPLE_LAYERS } from './drum-impact';
import {
  DRUM_BODY_FRAGMENT,
  DRUM_HEAD_FRAGMENT,
  DRUM_RIPPLE_FRAGMENT,
  DRUM_SMEAR_FRAGMENT,
} from './drum-shaders';

/** 俯视压扁系数：鼓面与环波共用，保证两者贴在同一个"地面"上。 */
export const DRUM_SQUASH = 0.46;
/** 鼓面网格分段数：凹陷形变靠这些顶点表达。 */
export const HEAD_SEGMENTS = 30;
/** 鼓框内径占整只鼓的比例（鼓皮区在此以内）。 */
const HEAD_RATIO = 0.72;
/** 环波贴片相对屏幕的放大倍数：屏缘落在 UV 0.5/1.6 = 0.3125。 */
export const RIPPLE_PLANE_SCALE = 1.6;
/** 金钉颗数。 */
const STUD_COUNT = 18;

type ShaderMesh = THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;

export type DrumParts = {
  readonly res: SceneResources;
  /** ① 鼓身：红漆鼓框 + 金钉，中心挖空露出鼓皮。 */
  readonly body: ShaderMesh;
  /** ② 鼓槌：槌头 + 槌柄，整体飞入。 */
  readonly mallet: THREE.Group;
  /** ③ 鼓面冲击：可形变网格，凹陷与反弹写在顶点上。 */
  readonly head: ShaderMesh;
  /** 鼓面顶点的静止位形，形变每帧从它重算（避免误差累积）。 */
  readonly headRest: Float32Array;
  /** ④ 低频环波。 */
  readonly ripples: ShaderMesh[];
  /** ⑦ 音浪拖影。 */
  readonly smear: ShaderMesh;
  /** ⑧ 锤头火星的场景自持锚点（quarks emitter 会脱离场景树）。 */
  readonly sparkAnchor: THREE.Object3D;
  /** 鼓皮半径（像素）。 */
  readonly headRadius: number;
  /** 凹陷的最大深度（像素）。 */
  readonly dentDepth: number;
  /** 鼓槌飞入的起始位（局部坐标）。 */
  readonly malletFrom: THREE.Vector3;
  /** 击点（鼓面中心稍偏，局部坐标）。 */
  readonly strikePoint: THREE.Vector3;
  /** 长度尺度（像素）。 */
  readonly scale: number;
};

/** 凹陷的碗形剖面（纯函数）：中心最深、鼓缘恒为零（皮被框固定）。 */
export function bowlProfile(u: number): number {
  const k = Math.min(1, Math.max(0, u));
  const s = 1 - k * k;
  return s * s;
}

/** 建 drum 场景的全部视觉元素。 */
export function buildDrumParts(ctx: CgStageContext): DrumParts {
  const { width, height, color } = ctx;
  const res = createSceneResources(ctx.root, ctx.origin, 'drum-scene');
  const short = Math.min(width, height);
  const scale = short * 0.06;

  // 战鼓配色：素材色往朱红推；金钉与高光另取。
  const lacquer = color.clone().lerp(new THREE.Color('#B3241C'), 0.74);
  const gold = color.clone().lerp(new THREE.Color('#F0C24A'), 0.85);
  const hide = color.clone().lerp(new THREE.Color('#D9B98A'), 0.7);
  const boom = color.clone().lerp(new THREE.Color('#FF9A4D'), 0.6);

  const headRadius = short * 0.3;
  const bodyRadius = headRadius / HEAD_RATIO;
  const dentDepth = headRadius * 0.34;

  // ⑦ 音浪拖影：最靠后，整屏级暖雾。
  const smear = res.mesh(
    'boom-smear',
    new THREE.PlaneGeometry(width * RIPPLE_PLANE_SCALE, height * RIPPLE_PLANE_SCALE),
    createAdditivePlaneMaterial({
      fragmentShader: DRUM_SMEAR_FRAGMENT,
      uniforms: {
        uColor: { value: boom },
        uAlpha: { value: 0 },
        uTime: { value: 0 },
        uOrigin: { value: new THREE.Vector2(0.5, 0.5) },
      },
    }),
  );
  smear.position.z = -14;
  res.group.add(smear);

  // ④ 低频环波：多层粗环，各层错峰发出。
  const ripples: ShaderMesh[] = [];
  for (let i = 0; i < RIPPLE_LAYERS; i += 1) {
    const mesh = res.mesh(
      `ripple-${i}`,
      new THREE.PlaneGeometry(width * RIPPLE_PLANE_SCALE, height * RIPPLE_PLANE_SCALE),
      createAdditivePlaneMaterial({
        fragmentShader: DRUM_RIPPLE_FRAGMENT,
        uniforms: {
          uColor: { value: boom },
          uAlpha: { value: 0 },
          uRadius: { value: 0 },
          // 低频波前厚且钝：外层更厚（高频先衰减，剩下的更低频）。
          uThickness: { value: 0.03 + i * 0.012 },
          uOrigin: { value: new THREE.Vector2(0.5, 0.5) },
          uSquash: { value: DRUM_SQUASH },
        },
      }),
    );
    mesh.position.z = -10 + i * 0.5;
    res.group.add(mesh);
    ripples.push(mesh);
  }

  // ③ 鼓面冲击：分段平面网格，凹陷写在顶点上（真形变，不是贴图）。
  const headGeometry = new THREE.PlaneGeometry(
    headRadius * 2, headRadius * 2, HEAD_SEGMENTS, HEAD_SEGMENTS,
  );
  const head = res.mesh(
    'head-impact',
    headGeometry,
    createBlendedPlaneMaterial({
      fragmentShader: DRUM_HEAD_FRAGMENT,
      uniforms: {
        uColor: { value: hide },
        uHotColor: { value: gold },
        uAlpha: { value: 0 },
        uDent: { value: 0 },
      },
    }),
  );
  head.position.z = -2;
  head.scale.y = DRUM_SQUASH;
  res.group.add(head);
  const headRest = Float32Array.from(
    (headGeometry.getAttribute('position') as THREE.BufferAttribute).array,
  );

  // ① 鼓身：鼓框环带 + 金钉，中心圆已在 shader 里挖空。
  const body = res.mesh(
    'drum-body',
    new THREE.PlaneGeometry(bodyRadius * 2, bodyRadius * 2),
    createBlendedPlaneMaterial({
      fragmentShader: DRUM_BODY_FRAGMENT,
      uniforms: {
        uColor: { value: lacquer },
        uStudColor: { value: gold },
        uAlpha: { value: 0 },
        uStuds: { value: STUD_COUNT },
        uHeadRadius: { value: HEAD_RATIO },
        uShake: { value: 0 },
      },
    }),
  );
  body.position.z = 0;
  body.scale.y = DRUM_SQUASH;
  res.group.add(body);

  // ② 鼓槌：槌头（球）+ 槌柄（细杆），整体从左上抡下。
  const mallet = new THREE.Group();
  mallet.name = 'drum-mallet';
  mallet.position.z = 12;
  const knobGeometry = res.track(new THREE.CircleGeometry(scale * 0.42, 20));
  const knobMaterial = res.track(new THREE.MeshBasicMaterial({
    color: hide, transparent: true, opacity: 0, depthWrite: false, depthTest: false,
  }));
  const knob = new THREE.Mesh(knobGeometry, knobMaterial);
  knob.name = 'mallet-knob';
  mallet.add(knob);
  const shaftGeometry = res.track(new THREE.PlaneGeometry(scale * 0.14, scale * 3.2));
  const shaftMaterial = res.track(new THREE.MeshBasicMaterial({
    color: gold, transparent: true, opacity: 0, depthWrite: false, depthTest: false,
  }));
  const shaft = new THREE.Mesh(shaftGeometry, shaftMaterial);
  shaft.name = 'mallet-shaft';
  // 柄接在槌头后方，整组绕槌头旋转。
  shaft.position.set(0, scale * 1.7, -0.5);
  mallet.add(shaft);
  res.group.add(mallet);

  // ⑧ 锤头火星锚点：quarks 的 emitter 一旦被 BatchedRenderer 摘走就无法
  // 按节点名定位，用场景自持的具名 Object3D 镜像发射点。
  const sparkAnchor = new THREE.Object3D();
  sparkAnchor.name = 'spark-burst';
  res.group.add(sparkAnchor);

  // 击点：鼓面中心偏上（槌打在皮上而非鼓框）。
  const strikePoint = new THREE.Vector3(0, headRadius * DRUM_SQUASH * 0.18, 6);
  // 起始位：左上远处，抡出一段可见的飞入轨迹。
  const malletFrom = new THREE.Vector3(
    strikePoint.x - bodyRadius * 1.35,
    strikePoint.y + bodyRadius * 1.5,
    12,
  );

  return {
    res, body, mallet, head, headRest, ripples, smear, sparkAnchor,
    headRadius, dentDepth, malletFrom, strikePoint, scale,
  };
}
