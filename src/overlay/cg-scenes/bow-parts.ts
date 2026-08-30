/**
 * 场景 24 bow 的元素搭建。
 *
 * 命名规则：不同性质的节点前缀互不包含（`wisp-N` 云絮 /
 * `ripple-N` 靶心涟漪），避免前缀匹配的断言测错对象。
 */
import * as THREE from 'three';
import type { CgStageContext } from '../cg-scene';
import { createSceneResources, type SceneResources } from '../cg-scene-kit';
import { createAdditivePlaneMaterial, createBlendedPlaneMaterial } from '../cg-shaders';
import { arrowGeometry } from './bow-geometry';
import {
  BOW_BACKDROP_FRAGMENT,
  BOW_BODY_FRAGMENT,
  BOW_CLOUD_FRAGMENT,
  RIFT_SEGMENTS,
} from './bow-shaders';

/** 靶心涟漪圈数。 */
export const RIPPLE_COUNT = 3;
/** 被卷起的云絮数。 */
export const WISP_COUNT = 7;

type ShaderMesh = THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
type RingMesh = THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
type WispMesh = THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;

export type BowWisp = {
  readonly mesh: WispMesh;
  /** 该絮被卷起时所在的箭路进度（0–1）。 */
  readonly along: number;
  /** 被卷开的侧向（±1）与幅度。 */
  readonly lateral: number;
};

export type BowParts = {
  readonly res: SceneResources;
  readonly backdrop: ShaderMesh;
  readonly cloud: ShaderMesh;
  readonly body: ShaderMesh;
  readonly arrow: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  readonly cone: ShaderMesh;
  readonly ripples: RingMesh[];
  readonly wisps: BowWisp[];
  /** 箭路起点与终点（场景局部坐标）。 */
  readonly from: THREE.Vector2;
  readonly to: THREE.Vector2;
  /** 云层贴片尺寸，用于把场景坐标换算成云的 UV。 */
  readonly cloudSize: THREE.Vector2;
  readonly scale: number;
};

/** 建 bow 场景的全部元素。 */
export function buildBowParts(ctx: CgStageContext): BowParts {
  const { width, height, color } = ctx;
  const res = createSceneResources(ctx.root, ctx.origin, 'bow-scene');
  const short = Math.min(width, height);
  const scale = short * 0.05;

  const wood = color.clone().lerp(new THREE.Color('#7A4A22'), 0.7);
  const pale = color.clone().lerp(new THREE.Color('#F2F6FF'), 0.8);
  const cloudColor = color.clone().lerp(new THREE.Color('#8C97AE'), 0.6);
  const sky = new THREE.Color('#141C2E');

  // 箭路：左下发、右上落，斜贯全屏（规格「箭路斜贯全屏」）。
  const from = new THREE.Vector2(-width * 0.42, -height * 0.3);
  const to = new THREE.Vector2(width * 0.46, height * 0.34);

  // ⑧ 远处闪电暗场：最底层。
  const backdrop = res.mesh(
    'storm-backdrop',
    new THREE.PlaneGeometry(width * 1.2, height * 1.2),
    createBlendedPlaneMaterial({
      fragmentShader: BOW_BACKDROP_FRAGMENT,
      uniforms: {
        uSky: { value: sky },
        uFlashColor: { value: pale },
        uAlpha: { value: 0 },
        uFlash: { value: 0 },
      },
    }),
  );
  backdrop.position.z = -30;
  res.group.add(backdrop);

  // ③ 云层（含穿云缝）：缝的每段张开量由 uOpen 数组逐段给。
  const cloudSize = new THREE.Vector2(width * 1.15, height * 1.15);
  const cloud = res.mesh(
    'cloud-rift',
    new THREE.PlaneGeometry(cloudSize.x, cloudSize.y),
    createBlendedPlaneMaterial({
      fragmentShader: BOW_CLOUD_FRAGMENT,
      uniforms: {
        uColor: { value: cloudColor },
        uEdgeColor: { value: pale },
        uAlpha: { value: 0 },
        uTime: { value: 0 },
        // 箭路端点换算到云贴片的 UV。
        uFrom: {
          value: new THREE.Vector2(
            0.5 + from.x / cloudSize.x,
            0.5 + from.y / cloudSize.y,
          ),
        },
        uTo: {
          value: new THREE.Vector2(
            0.5 + to.x / cloudSize.x,
            0.5 + to.y / cloudSize.y,
          ),
        },
        uOpen: { value: new Float32Array(RIFT_SEGMENTS) },
      },
    }),
  );
  cloud.position.z = -12;
  res.group.add(cloud);

  // ① 弓身 + 弓弦：放在箭路起点。
  const bowSize = Math.min(width * 0.24, height * 0.44);
  const body = res.mesh(
    'bow-body',
    new THREE.PlaneGeometry(bowSize, bowSize),
    createAdditivePlaneMaterial({
      fragmentShader: BOW_BODY_FRAGMENT,
      uniforms: {
        uWood: { value: wood },
        uString: { value: pale },
        uAlpha: { value: 0 },
        uDraw: { value: 0 },
        uShake: { value: 0 },
      },
    }),
  );
  body.position.set(from.x, from.y, 6);
  // 弓面对准箭路方向。
  body.rotation.z = Math.atan2(to.y - from.y, to.x - from.x);
  res.group.add(body);

  // ② 箭矢
  const arrowGeo = res.track(arrowGeometry(scale * 3.4, scale * 0.5));
  const arrowMat = res.track(new THREE.MeshBasicMaterial({
    color: pale,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
    depthTest: false,
  }));
  const arrow = new THREE.Mesh(arrowGeo, arrowMat);
  arrow.name = 'arrow-shaft';
  arrow.position.z = 8;
  res.group.add(arrow);

  // ⑤ 破空锥：跟着箭头的小号音爆锥。
  const cone = res.mesh(
    'sonic-cone',
    new THREE.PlaneGeometry(scale * 5, scale * 3.4),
    createAdditivePlaneMaterial({
      fragmentShader: `
        varying vec2 vUv;
        uniform vec3 uColor;
        uniform float uAlpha;
        uniform float uMach;
        void main() {
          // 锥顶在右缘中点，向左张开；uMach 越大越尖。
          vec2 p = vec2(1.0 - vUv.x, (vUv.y - 0.5) * 2.0);
          if (p.x <= 0.0) discard;
          float halfAngle = 1.0 / max(1.05, uMach);
          float edge = abs(p.y) - p.x * halfAngle;
          float shell = exp(-pow(edge / 0.07, 2.0));
          float a = shell * exp(-p.x * 1.6) * uAlpha;
          if (a < 0.005) discard;
          gl_FragColor = vec4(uColor * (0.7 + shell * 0.7), a);
        }`,
      uniforms: {
        uColor: { value: pale },
        uAlpha: { value: 0 },
        uMach: { value: 1.4 },
      },
    }),
  );
  cone.position.z = 7;
  res.group.add(cone);

  // ⑥ 靶心涟漪：命中点（箭路终点）的环。
  const ripples: RingMesh[] = [];
  for (let i = 0; i < RIPPLE_COUNT; i += 1) {
    const radius = scale * (1.2 + i * 0.7);
    const geometry = new THREE.RingGeometry(radius * 0.8, radius, 64);
    const material = new THREE.MeshBasicMaterial({
      color: pale,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `ripple-${i}`;
    mesh.position.set(to.x, to.y, 5);
    res.track(geometry);
    res.track(material);
    res.group.add(mesh);
    ripples.push(mesh);
  }

  // ⑦ 云絮被卷：沿箭路的小块云，被箭带着侧移。
  const wisps: BowWisp[] = [];
  for (let i = 0; i < WISP_COUNT; i += 1) {
    const geometry = new THREE.CircleGeometry(scale * (0.5 + (i % 3) * 0.22), 12);
    const material = new THREE.MeshBasicMaterial({
      color: cloudColor,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `wisp-${i}`;
    mesh.position.z = -10;
    res.track(geometry);
    res.track(material);
    res.group.add(mesh);
    wisps.push({
      mesh,
      along: 0.12 + (i / WISP_COUNT) * 0.78,
      lateral: (i % 2 === 0 ? 1 : -1) * (0.6 + ((i * 29) % 100) / 160),
    });
  }

  return { res, backdrop, cloud, body, arrow, cone, ripples, wisps, from, to, cloudSize, scale };
}
