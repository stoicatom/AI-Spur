/**
 * 场景 19 guitar 的元素搭建。
 *
 * 命名规则：不同性质的节点前缀互不包含（`gstring-N` 琴弦 /
 * `wave-N` 音浪环 / `overtone-N` 泛音点），避免前缀匹配的断言
 * 测错对象。特别注意 `gstring-` 而非 `string-`：后者会与
 * 「泛音点挂在弦上」这类子节点命名撞车。
 */
import * as THREE from 'three';
import type { CgStageContext } from '../cg-scene';
import { createSceneResources, type SceneResources } from '../cg-scene-kit';
import { createAdditivePlaneMaterial, createBlendedPlaneMaterial } from '../cg-shaders';
import {
  GUITAR_BODY_FRAGMENT,
  GUITAR_RESONANCE_FRAGMENT,
  GUITAR_WAVE_FRAGMENT,
} from './guitar-shaders';

/** 琴弦数：吉他标准六弦。 */
export const STRING_COUNT = 6;
/** 音浪环数：规格三幕里写明「音浪环×4」。 */
export const WAVE_RINGS = 4;
/** 每根弦上取的采样段数：驻波形状靠这些顶点表达。 */
export const STRING_SEGMENTS = 32;

type ShaderMesh = THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
type LineMesh = THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
type DotMesh = THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;

export type GuitarString = {
  readonly line: LineMesh;
  /** 弦在琴面上的横向位置（局部坐标 y）。 */
  readonly y: number;
  /** 谐波次数：低音弦基频、高音弦泛音更明显。 */
  readonly harmonic: number;
  /** 角频率（rad / 归一化幕）：六根弦音高不同。 */
  readonly omega: number;
  /** 被拨时刻（整幕归一化），六根依次拨响成一记扫弦。 */
  readonly pluckAt: number;
  /** 振动的像素幅度。 */
  readonly amp: number;
};

export type GuitarWave = {
  readonly mesh: ShaderMesh;
  /** 该环的起爆序号，决定它在第二幕里第几个发出。 */
  readonly index: number;
};

export type GuitarOvertone = {
  readonly dot: DotMesh;
  /** 所属弦序号。 */
  readonly stringIndex: number;
  /** 沿弦的归一化位置（波节所在）。 */
  readonly along: number;
};

export type GuitarParts = {
  readonly res: SceneResources;
  readonly body: ShaderMesh;
  readonly resonance: ShaderMesh;
  readonly strings: GuitarString[];
  readonly waves: GuitarWave[];
  readonly overtones: GuitarOvertone[];
  readonly pick: DotMesh;
  /** 音孔在琴身局部坐标中的位置与半径（像素）。 */
  readonly holeCenter: THREE.Vector2;
  readonly holeRadius: number;
  /** 弦的两端 x（琴颈端、琴桥端）。 */
  readonly stringFromX: number;
  readonly stringToX: number;
  readonly scale: number;
};

/** 建 guitar 场景的全部元素。 */
export function buildGuitarParts(ctx: CgStageContext): GuitarParts {
  const { width, height, color } = ctx;
  const res = createSceneResources(ctx.root, ctx.origin, 'guitar-scene');
  const short = Math.min(width, height);
  const scale = short * 0.05;

  // 木色：素材色往原木暖棕推；共鸣光更亮更黄。
  const wood = color.clone().lerp(new THREE.Color('#8A5A2B'), 0.72);
  const rosette = color.clone().lerp(new THREE.Color('#3A2412'), 0.7);
  const glow = color.clone().lerp(new THREE.Color('#FFC978'), 0.75);
  const bright = color.clone().lerp(new THREE.Color('#FFF0C8'), 0.8);

  const bodyW = width * 0.62;
  const bodyH = height * 0.5;
  // 音孔在琴身偏右（靠琴桥），UV 坐标。
  const holeUv = new THREE.Vector2(0.62, 0.5);
  const holeRadius = bodyH * 0.13;
  const holeCenter = new THREE.Vector2((holeUv.x - 0.5) * bodyW, (holeUv.y - 0.5) * bodyH);

  // ⑥ 共鸣光：先加，让它在琴身之后（z 更小），从挖空的音孔透出。
  const resonance = res.mesh(
    'body-resonance',
    new THREE.PlaneGeometry(bodyW * 1.5, bodyH * 1.5),
    createAdditivePlaneMaterial({
      fragmentShader: GUITAR_RESONANCE_FRAGMENT,
      uniforms: {
        uColor: { value: glow },
        uAlpha: { value: 0 },
        uTime: { value: 0 },
        // 换算到共鸣贴片自身的 UV（贴片比琴身大 1.5 倍）。
        uHole: {
          value: new THREE.Vector2(
            0.5 + holeCenter.x / (bodyW * 1.5),
            0.5 + holeCenter.y / (bodyH * 1.5),
          ),
        },
      },
    }),
  );
  resonance.position.z = -2;
  res.group.add(resonance);

  // ① 琴身
  const body = res.mesh(
    'guitar-body',
    new THREE.PlaneGeometry(bodyW, bodyH),
    createBlendedPlaneMaterial({
      fragmentShader: GUITAR_BODY_FRAGMENT,
      uniforms: {
        uColor: { value: wood },
        uEdgeColor: { value: rosette },
        uAlpha: { value: 0 },
        uHole: { value: holeUv },
        uHoleRadius: { value: holeRadius / bodyH },
        uShake: { value: 0 },
      },
    }),
  );
  res.group.add(body);

  // ② 琴弦：从琴颈端拉到琴桥端，横跨琴身。
  const stringFromX = -bodyW * 0.46;
  const stringToX = bodyW * 0.46;
  const strings: GuitarString[] = [];
  for (let i = 0; i < STRING_COUNT; i += 1) {
    const y = (i / (STRING_COUNT - 1) - 0.5) * bodyH * 0.42;
    const positions = new Float32Array((STRING_SEGMENTS + 1) * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({
      color: bright,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
    });
    const line = new THREE.Line(geometry, material);
    line.name = `gstring-${i}`;
    line.position.z = 4;
    res.track(geometry);
    res.track(material);
    res.group.add(line);

    strings.push({
      line,
      y,
      // 低音弦（i=0）走基频，高音弦谐波次数递增：泛音点因此各不相同。
      harmonic: 1 + (i % 3),
      // 音高递增：每根弦角频率约提高一个音级。
      omega: 62 + i * 17,
      // 扫弦：六根依次拨响，间隔 12ms（0.01 幕）。
      pluckAt: 0.02 + i * 0.01,
      amp: bodyH * (0.035 - i * 0.003),
    });
  }

  // ④ 音浪环：从音孔起扩散，各自错峰。
  const waves: GuitarWave[] = [];
  for (let i = 0; i < WAVE_RINGS; i += 1) {
    const mesh = res.mesh(
      `wave-${i}`,
      new THREE.PlaneGeometry(width * 1.5, height * 1.5),
      createAdditivePlaneMaterial({
        fragmentShader: GUITAR_WAVE_FRAGMENT,
        uniforms: {
          uColor: { value: glow },
          uAlpha: { value: 0 },
          uRadius: { value: 0 },
          uThickness: { value: 0.03 },
          // 环心锁在音孔（换算到环贴片自身 UV）。
          uOrigin: {
            value: new THREE.Vector2(
              0.5 + holeCenter.x / (width * 1.5),
              0.5 + holeCenter.y / (height * 1.5),
            ),
          },
        },
      }),
    );
    mesh.position.z = -6;
    res.group.add(mesh);
    waves.push({ mesh, index: i });
  }

  // ⑦ 泛音点：落在各弦的谐波波节上。
  const overtones: GuitarOvertone[] = [];
  for (let i = 0; i < STRING_COUNT; i += 1) {
    const harmonic = strings[i].harmonic;
    // 基频弦（harmonic=1）无内部波节，给它中点当"半音点"以保证每弦都有。
    const alongs = harmonic > 1
      ? Array.from({ length: harmonic - 1 }, (_, k) => (k + 1) / harmonic)
      : [0.5];
    for (const along of alongs) {
      const geometry = new THREE.CircleGeometry(scale * 0.12, 12);
      const material = new THREE.MeshBasicMaterial({
        color: bright,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
      });
      const dot = new THREE.Mesh(geometry, material);
      dot.name = `overtone-${overtones.length}`;
      dot.position.z = 6;
      res.track(geometry);
      res.track(material);
      res.group.add(dot);
      overtones.push({ dot, stringIndex: i, along });
    }
  }

  // ⑤ 拨片闪光
  const pickGeometry = res.track(new THREE.CircleGeometry(scale * 0.42, 18));
  const pickMaterial = res.track(new THREE.MeshBasicMaterial({
    color: bright,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  }));
  const pick = new THREE.Mesh(pickGeometry, pickMaterial);
  pick.name = 'pick-flash';
  pick.position.z = 8;
  res.group.add(pick);

  return {
    res, body, resonance, strings, waves, overtones, pick,
    holeCenter, holeRadius, stringFromX, stringToX, scale,
  };
}
