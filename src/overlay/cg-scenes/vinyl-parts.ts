/**
 * 场景 40 vinyl 的建场层：8 个元素的具名节点。
 *
 * 元素与规格 §4.2 场景 40 一一对应：
 * ①唱片 mesh ②盘面纹路 ③唱针 ④音轨光流 ⑤转速视觉 ⑥音尘 ⑦灯语 ⑧旋转影
 *
 * ②盘面纹路与①唱片共用一张 mesh（纹路是盘面的着色，不是另一层几何），
 * 但纹路的圈数由 uniform 独立驱动，所以仍是可断言的独立元素。
 * ⑥音尘由 quarks 承载，锚点在 ./vinyl-dust 内随 emitter 一同建立——
 * 建在这里会变成一个从不更新的死节点，而按名字查得到、断言照样绿。
 */
import * as THREE from 'three';
import type { SceneResources } from '../cg-scene-kit';
import { createAdditivePlaneMaterial, createBlendedPlaneMaterial } from '../cg-shaders';
import {
  DISC_RADIUS_FRAC,
  GROOVE_TURNS,
  TRACK_INNER,
  TRACK_OUTER,
} from './vinyl-groove';
import {
  VINYL_DISC_FRAGMENT,
  VINYL_LAMP_FRAGMENT,
  VINYL_SPIN_FRAGMENT,
  VINYL_TRACK_FRAGMENT,
} from './vinyl-shaders';

/** 旋转影的层数：盘面在台面上的投影，多层叠出柔和边缘。 */
export const SHADOW_LAYERS = 3;

export type VinylPalette = {
  readonly sheen: THREE.Color;
  readonly track: THREE.Color;
  readonly lamp: THREE.Color;
};

export interface VinylParts {
  /** ①+② 唱片本体（盘面纹路是它的着色）。 */
  readonly disc: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  /** ③ 唱针（含唱臂，整体绕支点转）。 */
  readonly armPivot: THREE.Object3D;
  readonly stylus: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  /** ④ 音轨光流。 */
  readonly track: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  /** ⑤ 转速视觉。 */
  readonly spin: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  /** ⑦ 灯语。 */
  readonly lamp: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  /** ⑧ 旋转影。 */
  readonly shadows: readonly THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[];
  /** 唱片半径（像素），供 update 换算针尖世界位置。 */
  readonly discR: number;
}

/**
 * 建立 vinyl 场景的全部节点。
 *
 * @param res 场景资源容器
 * @param size 画面尺寸与短边
 * @param palette 配色
 */
export function buildVinylParts(
  res: SceneResources,
  size: { width: number; height: number; short: number },
  palette: VinylPalette,
): VinylParts {
  const { width, height, short } = size;
  const discR = short * DISC_RADIUS_FRAC;
  const discSpan = discR * 2;

  // ⑧ 旋转影：先建，压在盘下。层层放大并降不透明度，边缘就柔。
  const shadows: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];
  for (let i = 0; i < SHADOW_LAYERS; i += 1) {
    const grow = 1 + i * 0.055;
    const mesh = res.mesh(
      `spin-shadow-${i}`,
      new THREE.PlaneGeometry(discSpan * grow, discSpan * grow),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color('#04060B'),
        transparent: true,
        opacity: 0.3 / (i + 1),
        depthWrite: false,
        depthTest: false,
      }),
    );
    mesh.position.set(short * 0.014, -short * 0.016, -14 - i);
    res.group.add(mesh);
    shadows.push(mesh);
  }

  // ①+② 唱片：盘体与螺旋槽同一张 mesh，槽在片元里按螺线求值。
  const disc = res.mesh(
    'vinyl-disc',
    new THREE.PlaneGeometry(discSpan, discSpan),
    createBlendedPlaneMaterial({
      uniforms: {
        uTime: { value: 0 },
        uAngle: { value: 0 },
        uTurns: { value: GROOVE_TURNS },
        uInner: { value: TRACK_INNER },
        uOuter: { value: TRACK_OUTER },
        uSheen: { value: palette.sheen },
      },
      fragmentShader: VINYL_DISC_FRAGMENT,
    }),
  );
  disc.position.set(0, 0, -10);
  res.group.add(disc);

  // ⑤ 转速视觉：贴在盘面上方，强度随角速度。
  const spin = res.mesh(
    'spin-blur',
    new THREE.PlaneGeometry(discSpan, discSpan),
    createAdditivePlaneMaterial({
      uniforms: {
        uOmega: { value: 0 },
        uAngle: { value: 0 },
        uColor: { value: palette.sheen },
      },
      fragmentShader: VINYL_SPIN_FRAGMENT,
    }),
  );
  spin.position.set(0, 0, -8);
  res.group.add(spin);

  // ④ 音轨光流：与盘同尺寸，靠 uRadius 把亮带定位到针所在半径。
  const track = res.mesh(
    'track-glow',
    new THREE.PlaneGeometry(discSpan, discSpan),
    createAdditivePlaneMaterial({
      uniforms: {
        uRadius: { value: TRACK_OUTER },
        uGlow: { value: 0 },
        uAngle: { value: 0 },
        uTurns: { value: GROOVE_TURNS },
        uInner: { value: TRACK_INNER },
        uOuter: { value: TRACK_OUTER },
        uColor: { value: palette.track },
      },
      fragmentShader: VINYL_TRACK_FRAGMENT,
    }),
  );
  track.position.set(0, 0, -6);
  res.group.add(track);

  // ③ 唱针：唱臂绕支点转，针尖挂在臂末端。支点在盘右上方（真实唱机布局）。
  const armPivot = new THREE.Object3D();
  armPivot.name = 'stylus-arm';
  armPivot.position.set(discR * 1.12, discR * 0.86, -4);
  res.group.add(armPivot);

  const armLen = discR * 1.24;
  const arm = res.mesh(
    'stylus-beam',
    new THREE.PlaneGeometry(armLen, short * 0.011),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color('#C9D2E0'),
      transparent: true,
      opacity: 0.86,
      depthWrite: false,
      depthTest: false,
    }),
  );
  // 臂沿 -x 伸向盘心，几何中心因此后移半个臂长。
  arm.position.set(-armLen * 0.5, 0, 0);
  armPivot.add(arm);

  const stylus = res.mesh(
    'stylus-tip',
    new THREE.CircleGeometry(short * 0.012, 16),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color('#FFF3D6'),
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      depthTest: false,
    }),
  );
  stylus.position.set(-armLen, 0, 1);
  armPivot.add(stylus);

  // ⑦ 灯语：全屏光带，压在最底层。
  const lamp = res.mesh(
    'stage-lamp',
    new THREE.PlaneGeometry(width * 1.1, height * 1.1),
    createAdditivePlaneMaterial({
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 0 },
        uColor: { value: palette.lamp },
      },
      fragmentShader: VINYL_LAMP_FRAGMENT,
    }),
  );
  lamp.position.set(0, 0, -22);
  res.group.add(lamp);

  return { disc, armPivot, stylus, track, spin, lamp, shadows, discR };
}
