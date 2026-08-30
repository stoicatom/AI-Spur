/**
 * 场景 17 meteor 的元素搭建（碎片层在 ./meteor-debris）。
 *
 * 命名规则：不同性质的节点前缀互不包含（`meteor-core` / `debris-N` /
 * `dust-N` / `mach-cone`），避免前缀匹配的断言测错对象。
 */
import * as THREE from 'three';
import type { CgStageContext } from '../cg-scene';
import { createSceneResources, type SceneResources } from '../cg-scene-kit';
import { createAdditivePlaneMaterial } from '../cg-shaders';
import { METEOR_MACH_FRAGMENT, METEOR_SHELL_FRAGMENT, METEOR_TRAIL_FRAGMENT } from './meteor-shaders';

/** 坠地尘环层数：三圈不同速度外扩。 */
const DUST_RINGS = 3;

type ShaderMesh = THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
type RingMesh = THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;

export type MeteorParts = {
  readonly res: SceneResources;
  /** ① 陨核：不规则多面体，飞行中持续翻滚。 */
  readonly core: THREE.Mesh<THREE.IcosahedronGeometry, THREE.MeshBasicMaterial>;
  /** ② 火鞘：包在陨核外的高温层，跟着核走并按迎风方向转。 */
  readonly shell: ShaderMesh;
  /** ④ 电离尾迹。 */
  readonly trail: ShaderMesh;
  /** ⑤ 音爆锥。 */
  readonly mach: ShaderMesh;
  /** ⑥ 坠地闪光。 */
  readonly flash: ShaderMesh;
  /** ⑦ 尘环。 */
  readonly dustRings: RingMesh[];
  /** 轨迹起点与终点（局部坐标）。 */
  readonly from: THREE.Vector2;
  readonly to: THREE.Vector2;
  /** 长度尺度（像素）。 */
  readonly scale: number;
  /** 尾迹贴片长度，用于按轨迹进度拉伸。 */
  readonly trailLength: number;
};

/** 建 meteor 场景的全部视觉元素。 */
export function buildMeteorParts(ctx: CgStageContext): MeteorParts {
  const { width, height, color } = ctx;
  const res = createSceneResources(ctx.root, ctx.origin, 'meteor-scene');
  const short = Math.min(width, height);
  const scale = short * 0.06;

  // 再入火色：素材色往炽白-橙推。
  const ember = color.clone().lerp(new THREE.Color('#FF7A2E'), 0.62);
  const white = color.clone().lerp(new THREE.Color('#FFF6E0'), 0.82);
  const ion = color.clone().lerp(new THREE.Color('#7FD4FF'), 0.5);

  // 轨迹：左上入射、右下坠地，斜贯全屏（规格「轨迹斜贯全屏」）。
  const from = new THREE.Vector2(-width * 0.52, height * 0.46);
  const to = new THREE.Vector2(width * 0.3, -height * 0.34);

  // ① 陨核：低面数二十面体当不规则岩块，比球体更像陨石。
  const coreGeometry = res.track(new THREE.IcosahedronGeometry(scale * 0.5, 0));
  const coreMaterial = res.track(new THREE.MeshBasicMaterial({
    color: '#4A3B33',
    transparent: true,
    opacity: 0,
  }));
  const core = new THREE.Mesh(coreGeometry, coreMaterial);
  core.name = 'meteor-core';
  res.group.add(core);

  // ② 火鞘
  const shell = res.mesh(
    'fire-shell',
    new THREE.PlaneGeometry(scale * 4.2, scale * 4.2),
    createAdditivePlaneMaterial({
      fragmentShader: METEOR_SHELL_FRAGMENT,
      uniforms: {
        uColor: { value: ember },
        uHotColor: { value: white },
        uTime: { value: 0 },
        uHeat: { value: 0 },
        uAlpha: { value: 0 },
      },
    }),
  );
  res.group.add(shell);

  // ④ 电离尾迹：贴片长度覆盖整条轨迹，按进度缩放。
  const trailLength = from.distanceTo(to) * 1.05;
  const trail = res.mesh(
    'ion-trail',
    new THREE.PlaneGeometry(trailLength, scale * 2.4),
    createAdditivePlaneMaterial({
      fragmentShader: METEOR_TRAIL_FRAGMENT,
      uniforms: {
        uColor: { value: ion },
        uTime: { value: 0 },
        uAlpha: { value: 0 },
        uBreak: { value: 0 },
      },
    }),
  );
  res.group.add(trail);

  // ⑤ 音爆锥：锥顶跟着陨核，向后张开。
  const mach = res.mesh(
    'mach-cone',
    new THREE.PlaneGeometry(scale * 9, scale * 7),
    createAdditivePlaneMaterial({
      fragmentShader: METEOR_MACH_FRAGMENT,
      uniforms: {
        uColor: { value: white },
        uMach: { value: 1.2 },
        uAlpha: { value: 0 },
      },
    }),
  );
  res.group.add(mach);

  // ⑥ 坠地闪光：整屏级白闪，落点为中心。
  const flash = res.mesh(
    'impact-flash',
    new THREE.PlaneGeometry(width * 1.6, height * 1.6),
    createAdditivePlaneMaterial({
      fragmentShader: `
        varying vec2 vUv;
        uniform vec3 uColor;
        uniform float uAlpha;
        uniform vec2 uCenter;
        void main() {
          // 落点为中心的径向白闪，边缘快速衰减。
          float d = distance(vUv, uCenter);
          float a = exp(-pow(d / 0.28, 2.0)) * uAlpha;
          if (a < 0.004) discard;
          gl_FragColor = vec4(uColor, a);
        }`,
      uniforms: {
        uColor: { value: white },
        uAlpha: { value: 0 },
        // 落点归一化到贴片 UV：贴片中心是 (0.5,0.5)。
        uCenter: { value: new THREE.Vector2(0.5 + to.x / (width * 1.6), 0.5 + to.y / (height * 1.6)) },
      },
    }),
  );
  res.group.add(flash);

  // ⑦ 尘环：坠地点三圈外扬。
  const dustRings: RingMesh[] = [];
  for (let i = 0; i < DUST_RINGS; i += 1) {
    const radius = scale * (2.2 + i * 1.3);
    const geometry = new THREE.RingGeometry(radius * 0.82, radius, 96);
    const material = new THREE.MeshBasicMaterial({
      color: ember,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `dust-${i}`;
    mesh.position.set(to.x, to.y, 0);
    // 地面透视：环压扁成椭圆才像贴地扬尘而非空中光圈。
    mesh.scale.y = 0.34;
    res.track(geometry);
    res.track(material);
    res.group.add(mesh);
    dustRings.push(mesh);
  }

  return { res, core, shell, trail, mach, flash, dustRings, from, to, scale, trailLength };
}
