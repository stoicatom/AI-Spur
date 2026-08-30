/**
 * 场景 13 wind 的元素搭建（规格 §4.2 场景 13 的八元素）。
 *
 * 与编排分离：本文件只负责「把元素立起来」，三幕动作在 cg-wind.ts；
 * 尘粒场在 ./wind-streams、枯叶刚体在 ./wind-leaves。
 * 拆分理由是 CLAUDE.md 的 250 行上限，也让元素清单能一眼对照规格。
 */
import * as THREE from 'three';
import type { CgStageContext } from '../cg-scene';
import { VOLUME_CLOUD_FRAGMENT, createAdditivePlaneMaterial, createBlendedPlaneMaterial } from '../cg-shaders';
import { additiveMaterial, createSceneResources, type SceneResources } from '../cg-scene-kit';
import { AXIS_SWEEP_FROM, AXIS_Y, FLOOR_Y, FUNNEL_HALF_WIDTH, FUNNEL_SPAN } from './wind-field';
import { DUST_FUNNEL_FRAGMENT, SAND_RIPPLE_FRAGMENT, WIND_EYE_FRAGMENT } from './wind-shaders';
import { buildDustLayers, type DustLayer } from './wind-streams';
import { createLeafField, type LeafField } from './wind-leaves';

/** 一层掠过的云：mesh + 该层的平移速度系数。 */
export type CloudLayer = {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  /** 该层横移速度系数，层间速度差是「快速掠过」的层次来源。 */
  rush: number;
};

export type WindParts = {
  res: SceneResources;
  /**
   * 涡轴节点：尘卷与风眼都挂在它下面。
   *
   * 把轴做成真节点而不是让两个 mesh 各自设 position.x：
   * 轴是这个场景的**唯一**几何基准（签名的旋转就是绕它发生的），
   * 有了它「涡心在哪」是场景树里可读的运行时真值，
   * 不必在多处复制同一个坐标表达式（复制过的地方总有一处会漏改）。
   */
  axis: THREE.Group;
  /** ① 风场流线（Points）。 */
  streams: DustLayer;
  /** ④ 扬尘幕（贴地 Points 层）。 */
  ground: DustLayer;
  /** ② 尘卷（SDF 锥体）。 */
  funnel: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  /** ③ 被卷起的枯叶（cannon 薄片刚体）。 */
  leafField: LeafField;
  /** ⑤ 地面砂纹（shader 波痕）。 */
  ripples: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  /** ⑥ 风眼（中心透明柱光）。 */
  eye: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  /** ⑦ 云层快速掠过。 */
  clouds: THREE.Group;
  cloudLayers: CloudLayer[];
  /** ⑧ 风声频闪（整屏尘色脉冲，密度节奏的可见载体）。 */
  strobe: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  /** 地面高度（局部坐标），砂纹与枯叶落地共用。 */
  floorY: number;
  /** 尘卷 mesh 的世界高度，编排层折算归一化高度时要用。 */
  funnelHeight: number;
  /** 涡轴高度（世界坐标），mesh 的局部 y 都相对它给。 */
  axisY: number;
};

export function buildWindParts(ctx: CgStageContext): WindParts {
  const res = createSceneResources(ctx.root, new THREE.Vector3(), 'cg-wind');
  const { width, height } = ctx;
  const short = Math.min(width, height);
  const floorY = height * FLOOR_Y;

  const axisY = height * AXIS_Y;

  // ①④ 尘粒两层（见 ./wind-streams）。
  const { streams, ground } = buildDustLayers(res, ctx);

  // 涡轴：横扫时整根柱子（尘卷 + 风眼）跟着它走。
  const axis = new THREE.Group();
  axis.name = 'whirl-axis';
  axis.position.set(width * AXIS_SWEEP_FROM, axisY, 0);
  res.group.add(axis);

  // ② 尘卷：一块竖立的 SDF 平面。几何尺寸取自 wind-field 的漏斗常量——
  // shader 的 p.x∈[-1,1] 正好映射到 ±FUNNEL_HALF_WIDTH，
  // 枯叶的向心目标半径因此与画出来的壁面严格重合。
  // 高度顶到屏顶：旋风是从地面顶到天的一根柱子，截半会读作一堆尘。
  const funnelHeight = height * FUNNEL_SPAN;
  const funnel = res.mesh(
    'dust-funnel',
    new THREE.PlaneGeometry(short * FUNNEL_HALF_WIDTH * 2, funnelHeight),
    createAdditivePlaneMaterial({
      uniforms: {
        uColor: { value: new THREE.Color('#C9A876') },
        uCoreColor: { value: new THREE.Color('#F6E7C6') },
        uSpin: { value: 0 },
        uForm: { value: 0 },
        uDensity: { value: 0 },
      },
      fragmentShader: DUST_FUNNEL_FRAGMENT,
    }),
  );
  // 锥体几何的 uv.y=0 在下缘，所以把 mesh 底边对齐地面（局部坐标扣掉轴高）。
  funnel.position.set(0, floorY + funnelHeight * 0.5 - axisY, 8);
  axis.add(funnel);

  // ③ 枯叶刚体（见 ./wind-leaves）。叶子生在尘柱的**起始轴位**周围，
  // 与尘幕的成员归属同锚：旋风带着自己的沙与叶横扫旷野，
  // 而不是在半途凭空把地上的叶子抓进来（那会看见叶子瞬间弹位）。
  const leafField = createLeafField(res, ctx, floorY, width * AXIS_SWEEP_FROM);

  // ⑤ 地面砂纹：贴地铺满全屏宽的平面，纵向只占下半屏（那才是「地面」）。
  const ripples = res.mesh(
    'sand-ripples',
    new THREE.PlaneGeometry(width * 1.25, height * 0.62),
    createBlendedPlaneMaterial({
      uniforms: {
        uColor: { value: new THREE.Color('#8E7550') },
        uCrestColor: { value: new THREE.Color('#E3CEA4') },
        uTime: { value: 0 },
        uStrength: { value: 0 },
        uAngle: { value: 0 },
        uAxis: { value: new THREE.Vector2(0, 0) },
      },
      fragmentShader: SAND_RIPPLE_FRAGMENT,
    }),
  );
  ripples.position.set(0, floorY + height * 0.24, -30);
  res.group.add(ripples);

  // ⑥ 风眼：与尘卷同底同高的一根柱光，画在尘卷之前（在漏斗内部）。
  const eye = res.mesh(
    'wind-eye',
    new THREE.PlaneGeometry(short * FUNNEL_HALF_WIDTH * 1.5, funnelHeight * 0.85),
    createAdditivePlaneMaterial({
      uniforms: {
        uColor: { value: new THREE.Color('#FFF3D8') },
        uOpen: { value: 0 },
        uSpin: { value: 0 },
      },
      fragmentShader: WIND_EYE_FRAGMENT,
    }),
  );
  eye.position.set(0, floorY + funnelHeight * 0.425 - axisY, 14);
  axis.add(eye);

  // ⑦ 云层快速掠过：两层反向速度的低云。单层云平移会显得像贴图在滑，
  // 层间速度差才有「掠过」的纵深。
  const clouds = new THREE.Group();
  clouds.name = 'rush-clouds';
  clouds.position.z = -60;
  res.group.add(clouds);
  const cloudLayers: CloudLayer[] = [0, 1].map((i) => {
    const mesh = res.mesh(
      `cloud-layer-${i}`,
      // 每层都盖满全屏并留出横移余量：掠过时屏缘不能露出云的边界。
      new THREE.PlaneGeometry(width * 1.9, height * (0.52 + i * 0.16)),
      createBlendedPlaneMaterial({
        uniforms: {
          uColor: { value: new THREE.Color(i === 0 ? '#6F6857' : '#8E866F') },
          uFlashColor: { value: new THREE.Color('#D9CDB2') },
          uTime: { value: 0 },
          uDensity: { value: 0 },
          uFlash: { value: 0 },
        },
        fragmentShader: VOLUME_CLOUD_FRAGMENT,
      }),
    );
    mesh.position.set(0, height * (0.3 - i * 0.1), i * 3);
    clouds.add(mesh);
    return { mesh, rush: 1 + i * 0.9 };
  });

  // ⑧ 风声频闪：整屏尘色薄膜。频闪做成一个独立元素而不是「让粒子自己闪」，
  // 是因为「密度节奏」的整体明暗人眼读的是**整场**的一阵一阵，
  // 逐粒改 opacity 只会得到噪点闪烁。
  const strobe = res.mesh(
    'wind-strobe',
    new THREE.PlaneGeometry(width * 1.1, height * 1.1),
    additiveMaterial('#E8D6AE', 0),
  );
  strobe.position.z = 40;
  res.group.add(strobe);

  return {
    res, axis, streams, ground, funnel, leafField, ripples, eye,
    clouds, cloudLayers, strobe, floorY, funnelHeight, axisY,
  };
}
