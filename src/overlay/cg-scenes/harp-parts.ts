/**
 * 场景 22 harp 的元素搭建。
 *
 * 命名规则：不同性质的节点前缀互不包含（`hstring-N` 竖列弦 /
 * `petal-N` 飘落花瓣 / `halo-N` 落地晕环），避免前缀匹配的断言
 * 测错对象。用 `hstring-` 而非 `string-`，与 guitar 的 `gstring-`
 * 一样刻意加族前缀。
 */
import * as THREE from 'three';
import type { CgStageContext } from '../cg-scene';
import { createSceneResources, type SceneResources } from '../cg-scene-kit';
import { createAdditivePlaneMaterial, createBlendedPlaneMaterial } from '../cg-shaders';
import { HARP_BEAM_FRAGMENT, HARP_FRAME_FRAGMENT, HARP_NIGHT_FRAGMENT } from './harp-shaders';

/** 竖列弦数：竖琴弦多，取 14 根形成明显的「列」。 */
export const HARP_STRING_COUNT = 14;
/** 飘落花瓣刚体数（电影级）。 */
export const PETAL_COUNT = 22;
/** 落地晕环数。 */
export const HALO_COUNT = 4;

type ShaderMesh = THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
type LineMesh = THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
type RingMesh = THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
type PetalMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;

export type HarpString = {
  readonly line: LineMesh;
  /** 在弦列中的归一化位置（0=最上，1=最下）——空间扫描的判据依据。 */
  readonly pos: number;
  /** 弦的左端 x（弧架决定弦长，上短下长）。 */
  readonly x: number;
  /** 弦顶与弦底的 y。 */
  readonly topY: number;
  readonly bottomY: number;
  /** 被扫到的时刻，运行期首次照亮时写入（-1 表示尚未被扫到）。 */
  litAt: number;
};

export type HarpPetal = {
  readonly mesh: PetalMesh;
  /** 起点（从某根弦上剥落）。 */
  readonly from: THREE.Vector2;
  /** 剥落时刻（整幕归一化）。 */
  readonly at: number;
  /** 下落距离、侧摆幅度、初相、自旋圈数。 */
  readonly fall: number;
  readonly swayAmp: number;
  readonly swayPhase: number;
  readonly spin: number;
};

export type HarpHalo = {
  readonly mesh: RingMesh;
  /** 绑定的花瓣序号——涟漪由那片花瓣的触地时刻激起。 */
  readonly petalIndex: number;
};

export type HarpParts = {
  readonly res: SceneResources;
  readonly night: ShaderMesh;
  readonly frame: ShaderMesh;
  readonly beam: ShaderMesh;
  readonly strings: HarpString[];
  readonly petals: HarpPetal[];
  readonly halos: HarpHalo[];
  /** 地面高度（局部坐标），花瓣在此触地。 */
  readonly groundY: number;
  readonly scale: number;
};

/** 花瓣几何：两片对称的椭圆瓣，比矩形贴片更像花瓣。 */
function petalGeometry(size: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.bezierCurveTo(size * 0.6, size * 0.2, size * 0.6, size * 0.9, 0, size);
  shape.bezierCurveTo(-size * 0.6, size * 0.9, -size * 0.6, size * 0.2, 0, 0);
  return new THREE.ShapeGeometry(shape, 8);
}

/** 建 harp 场景的全部元素。 */
export function buildHarpParts(ctx: CgStageContext): HarpParts {
  const { width, height, color } = ctx;
  const res = createSceneResources(ctx.root, ctx.origin, 'harp-scene');
  const short = Math.min(width, height);
  const scale = short * 0.05;
  const groundY = -height * 0.4;

  // 金漆 + 月色：与 guitar 的原木暖棕形成对照。
  const gold = color.clone().lerp(new THREE.Color('#E8C063'), 0.72);
  const pale = color.clone().lerp(new THREE.Color('#EAF2FF'), 0.78);
  const sky = new THREE.Color('#111A33');
  const petalColor = color.clone().lerp(new THREE.Color('#FFD9E8'), 0.68);

  // ⑤ 月夜景：最底层。
  const night = res.mesh(
    'night-sky',
    new THREE.PlaneGeometry(width * 1.2, height * 1.2),
    createBlendedPlaneMaterial({
      fragmentShader: HARP_NIGHT_FRAGMENT,
      uniforms: {
        uSky: { value: sky },
        uMoon: { value: pale },
        uAlpha: { value: 0 },
        uTime: { value: 0 },
      },
    }),
  );
  night.position.z = -20;
  res.group.add(night);

  // ① + ⑦ 竖琴框架与琴柱辉光（同一层 shader 承担轮廓与辉光）。
  const frameSize = Math.min(width * 0.55, height * 0.86);
  const frame = res.mesh(
    'harp-frame',
    new THREE.PlaneGeometry(frameSize, frameSize),
    createAdditivePlaneMaterial({
      fragmentShader: HARP_FRAME_FRAGMENT,
      uniforms: {
        uColor: { value: gold },
        uAlpha: { value: 0 },
        uGlow: { value: 0 },
      },
    }),
  );
  frame.position.set(-width * 0.08, height * 0.02, -4);
  res.group.add(frame);

  // ② 竖列弦：从上到下排开，弦长随弧架递增（上短下长）。
  const strings: HarpString[] = [];
  const columnLeft = -frameSize * 0.3;
  for (let i = 0; i < HARP_STRING_COUNT; i += 1) {
    const pos = i / (HARP_STRING_COUNT - 1);
    // 弦横向依次右移，纵向跨度随之变长——这就是竖琴的三角弦列。
    const x = columnLeft + pos * frameSize * 0.52;
    const topY = height * 0.3 - pos * height * 0.06;
    const bottomY = -height * 0.06 - pos * height * 0.2;

    const positions = new Float32Array(2 * 3);
    positions[0] = x; positions[1] = topY; positions[2] = 0;
    positions[3] = x; positions[4] = bottomY; positions[5] = 0;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({
      color: pale,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
    });
    const line = new THREE.Line(geometry, material);
    line.name = `hstring-${i}`;
    res.track(geometry);
    res.track(material);
    res.group.add(line);
    strings.push({ line, pos, x, topY, bottomY, litAt: -1 });
  }

  // ④ 拨弦闪光带：覆盖弦列区域，自上而下扫过。
  const beam = res.mesh(
    'pluck-beam',
    new THREE.PlaneGeometry(frameSize * 0.8, height * 0.9),
    createAdditivePlaneMaterial({
      fragmentShader: HARP_BEAM_FRAGMENT,
      uniforms: {
        uColor: { value: pale },
        uAlpha: { value: 0 },
        uBeam: { value: 0 },
        uWidth: { value: 0.05 },
      },
    }),
  );
  beam.position.set(columnLeft + frameSize * 0.26, height * 0.1, 2);
  res.group.add(beam);

  // ⑧ 飘落花瓣刚体：从弦上剥落，旋转下落。
  const petals: HarpPetal[] = [];
  const petalGeo = res.track(petalGeometry(scale * 0.5));
  for (let i = 0; i < PETAL_COUNT; i += 1) {
    const material = new THREE.MeshBasicMaterial({
      color: petalColor,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: false,
    });
    const mesh = new THREE.Mesh(petalGeo, material);
    mesh.name = `petal-${i}`;
    mesh.position.z = 3;
    res.track(material);
    res.group.add(mesh);

    // 每片花瓣从某根弦上剥落。取靠弦顶三分之一处而非中点：
    // 规格要求「花瓣飘落覆盖半屏以上」，从弦中点起落只有 287px 落差
    // （不足半屏 432px），从弦顶起落才够。
    const src = strings[i % strings.length];
    const from = new THREE.Vector2(src.x, src.topY - (src.topY - src.bottomY) * 0.12);
    petals.push({
      mesh,
      from,
      // 剥落时刻分布在第二幕：闪光扫完才开始落。
      at: 0.3 + (i / PETAL_COUNT) * 0.5,
      fall: from.y - groundY,
      swayAmp: scale * (1.4 + ((i * 37) % 100) / 100 * 1.8),
      swayPhase: (i * 2.399963) % (Math.PI * 2),
      spin: 1 + ((i * 17) % 100) / 100 * 1.6,
    });
  }

  // ⑥ 落地晕环：各自绑定一片花瓣，由那片的触地时刻激起。
  const halos: HarpHalo[] = [];
  for (let i = 0; i < HALO_COUNT; i += 1) {
    const radius = scale * (1.1 + i * 0.5);
    const geometry = new THREE.RingGeometry(radius * 0.72, radius, 64);
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
    mesh.name = `halo-${i}`;
    // 贴地压扁成椭圆。
    mesh.scale.y = 0.3;
    res.track(geometry);
    res.track(material);
    res.group.add(mesh);
    // 均匀取样几片花瓣做涟漪源，避免全绑在前几片上。
    halos.push({ mesh, petalIndex: Math.floor((i / HALO_COUNT) * PETAL_COUNT) });
  }

  return { res, night, frame, beam, strings, petals, halos, groundY, scale };
}
