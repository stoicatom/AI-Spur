/**
 * 场景 23 trumpet 的元素搭建。
 *
 * 命名规则：不同性质的节点前缀互不包含（`hring-N` 号口环波 /
 * `valve-N` 按键光点 / `gleam-N` 金属反光带），避免前缀匹配的
 * 断言测错对象。
 */
import * as THREE from 'three';
import type { CgStageContext } from '../cg-scene';
import { createSceneResources, type SceneResources } from '../cg-scene-kit';
import { createAdditivePlaneMaterial, createBlendedPlaneMaterial } from '../cg-shaders';
import {
  TRUMPET_BODY_FRAGMENT,
  TRUMPET_CURTAIN_FRAGMENT,
  TRUMPET_PIPE_FRAGMENT,
  TRUMPET_RING_FRAGMENT,
} from './trumpet-shaders';
import { HORN_AXIS, HORN_HALF_ANGLE } from './trumpet-horn';

/** 号口环波圈数：规格写明「号口环波×3」。 */
export const HORN_RING_COUNT = 3;
/** 按键数：小号三键。 */
export const VALVE_COUNT = 3;
/** 金属反光带数量。 */
export const GLEAM_COUNT = 4;

type ShaderMesh = THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
type DotMesh = THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
type BandMesh = THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;

export type TrumpetRing = {
  readonly mesh: ShaderMesh;
  readonly index: number;
};

export type TrumpetValve = {
  readonly dot: DotMesh;
  readonly index: number;
};

export type TrumpetParts = {
  readonly res: SceneResources;
  readonly curtain: ShaderMesh;
  readonly body: ShaderMesh;
  readonly pipe: ShaderMesh;
  readonly rings: TrumpetRing[];
  readonly valves: TrumpetValve[];
  readonly gleams: BandMesh[];
  readonly goldWash: ShaderMesh;
  /** 号口在场景局部坐标中的位置（环波与音符都从这里出发）。 */
  readonly hornMouth: THREE.Vector2;
  /** 号口在环波贴片 UV 中的位置。 */
  readonly hornMouthUv: THREE.Vector2;
  readonly scale: number;
};

/** 建 trumpet 场景的全部元素。 */
export function buildTrumpetParts(ctx: CgStageContext): TrumpetParts {
  const { width, height, color } = ctx;
  const res = createSceneResources(ctx.root, ctx.origin, 'trumpet-scene');
  const short = Math.min(width, height);
  const scale = short * 0.05;

  // 铜管暖金 + 幕布暗红：与 harp 的月夜冷调、guitar 的原木形成第三种底色。
  const brass = color.clone().lerp(new THREE.Color('#D9A441'), 0.74);
  const shine = color.clone().lerp(new THREE.Color('#FFF2C4'), 0.82);
  const crimson = new THREE.Color('#3A1216');

  // ⑧ 背景暖幕：最底层。
  const curtain = res.mesh(
    'stage-curtain',
    new THREE.PlaneGeometry(width * 1.2, height * 1.2),
    createBlendedPlaneMaterial({
      fragmentShader: TRUMPET_CURTAIN_FRAGMENT,
      uniforms: {
        uColor: { value: crimson },
        uGlowColor: { value: brass },
        uAlpha: { value: 0 },
        uGlow: { value: 0 },
      },
    }),
  );
  curtain.position.z = -24;
  res.group.add(curtain);

  // ⑦ 号声金光：整屏暖色罩，随号声强弱起伏。
  const goldWash = res.mesh(
    'gold-wash',
    new THREE.PlaneGeometry(width * 1.2, height * 1.2),
    createAdditivePlaneMaterial({
      fragmentShader: `
        varying vec2 vUv;
        uniform vec3 uColor;
        uniform float uAlpha;
        uniform vec2 uCenter;
        void main() {
          // 以号口为中心的暖光罩，向外柔和衰减。
          float d = distance(vUv, uCenter);
          float a = exp(-pow(d / 0.55, 2.0)) * uAlpha;
          if (a < 0.004) discard;
          gl_FragColor = vec4(uColor, a);
        }`,
      uniforms: {
        uColor: { value: brass },
        uAlpha: { value: 0 },
        uCenter: { value: new THREE.Vector2(0.62, 0.56) },
      },
    }),
  );
  goldWash.position.z = -18;
  res.group.add(goldWash);

  // ① 喇叭本体：号口朝右上，放在画面左下三分处。
  const bodyW = width * 0.46;
  const bodyH = height * 0.4;
  const body = res.mesh(
    'trumpet-body',
    new THREE.PlaneGeometry(bodyW, bodyH),
    createAdditivePlaneMaterial({
      fragmentShader: TRUMPET_BODY_FRAGMENT,
      uniforms: {
        uBrass: { value: brass },
        uShine: { value: shine },
        uAlpha: { value: 0 },
        uGleam: { value: 0 },
      },
    }),
  );
  body.position.set(-width * 0.18, -height * 0.12, 4);
  body.rotation.z = HORN_AXIS;
  res.group.add(body);

  // 号口位置：body 局部 (0.42, 0) 处，转到场景坐标。
  const mouthLocal = new THREE.Vector2(bodyW * 0.21, 0);
  const cos = Math.cos(HORN_AXIS);
  const sin = Math.sin(HORN_AXIS);
  const hornMouth = new THREE.Vector2(
    body.position.x + mouthLocal.x * cos - mouthLocal.y * sin,
    body.position.y + mouthLocal.x * sin + mouthLocal.y * cos,
  );

  // ② 号口环波：三圈，各自错峰喷出。贴片覆盖 1.5 倍屏幕。
  const ringSpanW = width * 1.5;
  const ringSpanH = height * 1.5;
  const hornMouthUv = new THREE.Vector2(
    0.5 + hornMouth.x / ringSpanW,
    0.5 + hornMouth.y / ringSpanH,
  );
  const rings: TrumpetRing[] = [];
  for (let i = 0; i < HORN_RING_COUNT; i += 1) {
    const mesh = res.mesh(
      `hring-${i}`,
      new THREE.PlaneGeometry(ringSpanW, ringSpanH),
      createAdditivePlaneMaterial({
        fragmentShader: TRUMPET_RING_FRAGMENT,
        uniforms: {
          uColor: { value: shine },
          uAlpha: { value: 0 },
          uRadius: { value: 0 },
          uThickness: { value: 0.026 },
          uAxis: { value: HORN_AXIS },
          uHalfAngle: { value: HORN_HALF_ANGLE },
          uOrigin: { value: hornMouthUv.clone() },
        },
      }),
    );
    mesh.position.z = -8;
    res.group.add(mesh);
    rings.push({ mesh, index: i });
  }

  // ⑥ 共鸣管波：贴在管身上的行进光。
  const pipe = res.mesh(
    'pipe-wave',
    new THREE.PlaneGeometry(bodyW * 0.62, bodyH * 0.16),
    createAdditivePlaneMaterial({
      fragmentShader: TRUMPET_PIPE_FRAGMENT,
      uniforms: {
        uColor: { value: shine },
        uAlpha: { value: 0 },
        uFront: { value: 0 },
      },
    }),
  );
  pipe.position.set(body.position.x - bodyW * 0.16, body.position.y - bodyH * 0.02, 6);
  pipe.rotation.z = HORN_AXIS;
  res.group.add(pipe);

  // ③ 按键光点：管身上三个，沿管长排开。
  const valves: TrumpetValve[] = [];
  for (let i = 0; i < VALVE_COUNT; i += 1) {
    const geometry = new THREE.CircleGeometry(scale * 0.3, 16);
    const material = new THREE.MeshBasicMaterial({
      color: shine,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });
    const dot = new THREE.Mesh(geometry, material);
    dot.name = `valve-${i}`;
    // 沿号口轴排在管身上，间距均匀。
    const along = -bodyW * 0.3 + i * scale * 1.5;
    dot.position.set(
      body.position.x + along * cos,
      body.position.y + along * sin + scale * 0.5,
      8,
    );
    res.track(geometry);
    res.track(material);
    res.group.add(dot);
    valves.push({ dot, index: i });
  }

  // ⑤ 金属光泽：沿管身的反光带。
  const gleams: BandMesh[] = [];
  for (let i = 0; i < GLEAM_COUNT; i += 1) {
    const geometry = new THREE.PlaneGeometry(scale * 0.5, scale * (1.4 + (i % 2) * 0.6));
    const material = new THREE.MeshBasicMaterial({
      color: shine,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `gleam-${i}`;
    const along = -bodyW * 0.34 + i * bodyW * 0.16;
    mesh.position.set(
      body.position.x + along * cos,
      body.position.y + along * sin,
      7,
    );
    mesh.rotation.z = HORN_AXIS + 0.25;
    res.track(geometry);
    res.track(material);
    res.group.add(mesh);
    gleams.push(mesh);
  }

  return {
    res, curtain, body, pipe, rings, valves, gleams, goldWash,
    hornMouth, hornMouthUv, scale,
  };
}
