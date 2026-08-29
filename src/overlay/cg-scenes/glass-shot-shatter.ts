/**
 * 场景 35 glass-shot 的碎裂层搭建：⑥玻璃碎片 ⑦碎片反光 ⑨地面碎渣。
 *
 * 从 glass-shot-parts.ts 分出来，一是 250 行上限，二是这三个元素
 * 共用一个 cannon 刚体世界，放一起边界比按元素散开更清楚。
 */
import * as THREE from 'three';
import { Body, Box, Plane, Vec3, World } from 'cannon-es';
import type { CgStageContext } from '../cg-scene';
import { additiveMaterial, type SceneResources } from '../cg-scene-kit';
import { scaledCount } from '../cg-particle-kit';

/** 一枚玻璃碎片：three 显示体 + cannon 刚体。 */
export type Shard = {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  body: Body;
  /** 静止时到冲击点的距离，决定「裂纹何时抵达」。 */
  radius: number;
  /** 该片脱落所需的裂纹前沿（归一化半径）。 */
  releaseAt: number;
  /** 已被释放为动态刚体。 */
  released: boolean;
  /** ⑦ 反光相位：每片镜面闪的错峰。 */
  glintPhase: number;
};

export type ShatterLayers = {
  shards: Shard[];
  glints: Array<THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>>;
  grit: Array<THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>>;
  world: World;
};

/** 伪随机：同一 i 每次构建结果一致，碎裂形态因此可重现。 */
function rand(i: number, salt: number): number {
  return ((Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453) % 1 + 1) % 1;
}

/** ⑥ 三角碎片几何：不规则三角才像玻璃断口，矩形会露出网格。 */
function shardGeometry(i: number, size: number): THREE.BufferGeometry {
  const pts: number[] = [];
  for (let k = 0; k < 3; k += 1) {
    const a = (k / 3) * Math.PI * 2 + rand(i, k + 1) * 1.5;
    const rad = size * (0.55 + rand(i, k + 5) * 0.75);
    pts.push(Math.cos(a) * rad, Math.sin(a) * rad, 0);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * 从冲击点沿 angle 射到「板内可落区」边界的距离。
 * 上/左/右边界是板缘，下边界取地面：碎片起始不能在地面以下。
 */
function edgeReach(
  ctx: CgStageContext,
  impact: THREE.Vector2,
  floorY: number,
  angle: number,
): number {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const halfW = ctx.width * 0.5;
  const limits: number[] = [];
  if (Math.abs(cos) > 1e-4) {
    limits.push(((cos > 0 ? halfW : -halfW) - impact.x) / cos);
  }
  if (Math.abs(sin) > 1e-4) {
    // 向下只到地面上方一点，留出碎片自身厚度。
    const bound = sin > 0 ? ctx.height * 0.5 : floorY + ctx.height * 0.03;
    limits.push((bound - impact.y) / sin);
  }
  const positive = limits.filter((d) => d > 0);
  return positive.length > 0 ? Math.min(...positive) : ctx.width * 0.5;
}

/** ⑥⑦⑨ 碎片刚体、片上反光与地面碎渣。 */
export function buildShatterLayers(
  res: SceneResources,
  ctx: CgStageContext,
  impact: THREE.Vector2,
  span: number,
  floorY: number,
): ShatterLayers {
  // 刚体世界只管碎片：重力用像素量纲（正交相机下 1 世界单位 = 1px），
  // 所以 g 要放大到屏幕尺度，否则碎片像在月球上飘。
  const world = new World({ gravity: new Vec3(0, -ctx.height * 1.9, 0) });
  world.allowSleep = true;

  // 地面：cannon 的 Plane 法线固定朝 +z，绕 x 轴转 +90° 才朝上（+y）。
  const floor = new Body({ type: Body.STATIC, shape: new Plane(), position: new Vec3(0, floorY, 0) });
  floor.quaternion.setFromAxisAngle(new Vec3(1, 0, 0), -Math.PI / 2);
  world.addBody(floor);

  const shardGroup = new THREE.Group();
  shardGroup.name = 'glass-shards';
  shardGroup.position.z = 12;
  res.group.add(shardGroup);

  const shardCount = scaledCount(48, ctx.quality);
  const shards: Shard[] = [];
  for (let i = 0; i < shardCount; i += 1) {
    // 碎片按环带铺开：靠冲击点的密而小，靠板缘的疏而大，和真实碎裂一致。
    const ringK = rand(i, 31);
    const norm = 0.08 + ringK * 0.92;
    const angle = rand(i, 33) * Math.PI * 2;
    const size = span * (0.018 + norm * 0.055);
    const material = additiveMaterial('#CDEBFF', 0);
    const mesh = res.mesh(`shard-${i}`, shardGeometry(i, size), material);
    // 沿该方向量到板缘的距离：碎片必须落在板内（规格「碎片铺满」），
    // 且不能起始于地面之下——否则刚体一步进就被地面顶上来，看着像在升。
    const reach = edgeReach(ctx, impact, floorY, angle);
    const px = impact.x + Math.cos(angle) * norm * reach;
    const py = impact.y + Math.sin(angle) * norm * reach;
    mesh.position.set(px, py, 0);
    mesh.rotation.z = rand(i, 37) * Math.PI * 2;
    shardGroup.add(mesh);

    const body = new Body({
      mass: 0.05 + norm * 0.12,
      shape: new Box(new Vec3(size * 0.6, size * 0.6, Math.max(0.6, size * 0.12))),
      position: new Vec3(px, py, 0),
      // 静止期设为 STATIC：玻璃未裂时碎片是板的一部分，不该先掉。
      type: Body.STATIC,
      linearDamping: 0.04,
      angularDamping: 0.12,
    });
    world.addBody(body);

    shards.push({
      mesh, body, radius: norm * span,
      // 互动①「裂纹到板缘时碎片率先脱落」：板缘片先走，所以阈值随半径反向——
      // 外圈是被支撑最弱的一环，裂纹一贯到边就整片掉，孔口附近反而挂得更久。
      releaseAt: 1 - norm * 0.92,
      released: false,
      glintPhase: rand(i, 41) * Math.PI * 2,
    });
  }

  // ⑦ 碎片反光：独立薄片跟随碎片，闪相错峰，让崩落面有镜面感。
  const glints: ShatterLayers['glints'] = [];
  const glintCount = Math.min(shardCount, scaledCount(20, ctx.quality));
  for (let i = 0; i < glintCount; i += 1) {
    const mesh = res.mesh(
      `shard-glint-${i}`,
      new THREE.PlaneGeometry(span * 0.05, Math.max(1.2, span * 0.005)),
      additiveMaterial('#FFFFFF'),
    );
    mesh.position.z = 14;
    res.group.add(mesh);
    glints.push(mesh);
  }
  const glintAnchor = new THREE.Group();
  glintAnchor.name = 'shard-glint';
  glintAnchor.position.z = 14;
  res.group.add(glintAnchor);

  // ⑨ 地面碎渣：落地细渣，第三幕沿地面铺开收束。
  const gritGroup = new THREE.Group();
  gritGroup.name = 'floor-grit';
  gritGroup.position.set(0, floorY, 16);
  res.group.add(gritGroup);

  const grit: ShatterLayers['grit'] = [];
  const gritCount = scaledCount(34, ctx.quality);
  for (let i = 0; i < gritCount; i += 1) {
    const mesh = res.mesh(
      `grit-${i}`,
      new THREE.CircleGeometry(Math.max(1, span * 0.004 * (0.6 + rand(i, 43))), 6),
      additiveMaterial('#E4F5FF'),
    );
    mesh.position.set((rand(i, 47) - 0.5) * ctx.width * 0.95, (rand(i, 53) - 0.5) * ctx.height * 0.05, 0);
    gritGroup.add(mesh);
    grit.push(mesh);
  }

  return { shards, glints, grit, world };
}

