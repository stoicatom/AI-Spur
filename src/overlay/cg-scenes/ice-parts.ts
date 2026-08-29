/**
 * 场景 10 ice 的元素搭建（规格 §4.2 场景 10 的八元素，雪幕在 ./ice-veil）。
 *
 * 与编排分离：本文件只负责「把元素立起来」，三幕动作在 cg-ice.ts。
 * 拆分理由是 CLAUDE.md 的 250 行上限，也让元素清单能一眼对照规格。
 */
import * as THREE from 'three';
import { Body, Box, Plane, Vec3, World } from 'cannon-es';
import type { CgStageContext } from '../cg-scene';
import { VOLUME_CLOUD_FRAGMENT, createAdditivePlaneMaterial, createBlendedPlaneMaterial } from '../cg-shaders';
import { AURORA_FRAGMENT, ICE_CRACK_FRAGMENT } from './ice-shaders';
import { additiveMaterial, createSceneResources, type SceneResources } from '../cg-scene-kit';
import { scaledCount } from '../cg-particle-kit';
import { MATERIAL_IDENTITIES } from '../material-identity';
import { buildSnowVeil, type SnowLayer } from './ice-veil';
import { bladeGeometry, icicleGeometry, rand } from './ice-geometry';

/** 一片寒雾层。 */
export type FogLayer = {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  /** 该层漂移速度系数，错位漂移才有体积感。 */
  drift: number;
};

/** 一根冰棱：three 显示体 + cannon 刚体。 */
export type Icicle = {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  body: Body;
  /** 出生时的横向落点（世界坐标），决定它对应哪段裂纹。 */
  landX: number;
  /** 该根被抛出的时刻（第二幕内归一化），错峰飞散。 */
  releaseAt: number;
  released: boolean;
};

export type IceParts = {
  res: SceneResources;
  /** ① 雪幕容器与远近两层。 */
  veil: THREE.Group;
  near: SnowLayer;
  far: SnowLayer;
  /** ② 风力切变指示层（旋转即风向）。 */
  shear: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  /** ③ 寒雾（多层错位）。 */
  fog: THREE.Group;
  fogLayers: FogLayer[];
  /** ④ 冰晶虹吸（晶核）。 */
  siphon: THREE.Group;
  siphonCore: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  siphonBlades: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[];
  /** ⑤ 地面冰裂纹。 */
  cracks: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  /** ⑥ 霜白闪光（整屏冷白脉冲）。 */
  flash: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  /** ⑦ 冰棱飞散（cannon 刚体）。 */
  shardGroup: THREE.Group;
  icicles: Icicle[];
  world: World;
  /** ⑧ 极光带。 */
  aurora: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  /** 爆点与地面高度，编排层要用同一组坐标做互动。 */
  burst: THREE.Vector2;
  floorY: number;
};

export function buildIceParts(ctx: CgStageContext): IceParts {
  const res = createSceneResources(ctx.root, new THREE.Vector3(), 'cg-ice');
  const { width, height, color, quality } = ctx;
  const identity = MATERIAL_IDENTITIES.ice.physical;
  const short = Math.min(width, height);
  const frostColor = new THREE.Color('#E8F6FF');

  // 爆点略偏屏心上方：冰晶在半空炸开，裂纹才有从空中砸到地面的因果。
  const burst = new THREE.Vector2(-width * 0.04, height * 0.06);
  const floorY = -height * 0.42;

  // ① 狂风雪幕（签名载体，见 ./ice-veil）。
  const { veil, near, far } = buildSnowVeil(res, ctx);

  // ② 风力切变：一条贴屏的斜向风纹带，它的 rotation.z 就是当帧风向。
  // 单独立一个元素而不是「让雪自己转」，是因为风向要可被看见——
  // 满屏雪粒的统计朝向人眼读不出来，一道扫掠的风纹能读出来。
  const shear = res.mesh(
    'wind-shear',
    new THREE.PlaneGeometry(width * 1.6, height * 0.16),
    additiveMaterial('#BFDCFF', 0),
  );
  shear.position.z = 20;
  res.group.add(shear);

  // ③ 寒雾：三层错位漂移。单层雾只是一块贴图，
  // 层间速度差才让雾看起来有前后厚度。
  const fog = new THREE.Group();
  fog.name = 'cold-fog';
  fog.position.z = -20;
  res.group.add(fog);

  const fogLayers: FogLayer[] = [0, 1, 2].map((i) => {
    const mesh = res.mesh(
      `fog-layer-${i}`,
      // 每层都盖满全屏：雾的「分层」是深度上的，不是把屏幕切成三块。
      new THREE.PlaneGeometry(width * (1.15 + i * 0.12), height * (1.1 + i * 0.1)),
      createBlendedPlaneMaterial({
        uniforms: {
          uColor: { value: new THREE.Color(i === 0 ? '#8FB4D8' : '#AFCCE8') },
          uFlashColor: { value: frostColor.clone() },
          uTime: { value: 0 },
          uDensity: { value: 0 },
          uFlash: { value: 0 },
        },
        fragmentShader: VOLUME_CLOUD_FRAGMENT,
      }),
    );
    mesh.position.set(0, -height * 0.06 * i, i * 3);
    fog.add(mesh);
    return { mesh, drift: 0.6 + i * 0.55 };
  });

  // ④ 冰晶虹吸：晶核 + 六向叶片。整体是一个元素，
  // 所以挂在自己的容器下，缩放与抬升作用在容器上。
  const siphon = new THREE.Group();
  siphon.name = 'crystal-siphon';
  siphon.position.set(burst.x, burst.y, 10);
  res.group.add(siphon);

  const coreR = short * 0.05;
  const siphonCore = res.mesh(
    'siphon-core',
    new THREE.OctahedronGeometry(coreR, 0),
    additiveMaterial(frostColor, 0),
  );
  siphon.add(siphonCore);

  const siphonBlades = [0, 1, 2, 3, 4, 5].map((i) => {
    const blade = res.mesh(
      `siphon-blade-${i}`,
      bladeGeometry(short * 0.13),
      additiveMaterial(color, 0),
    );
    // 六重对称是冰晶的定义特征，不是随机摆放。
    blade.rotation.z = (i / 6) * Math.PI * 2;
    siphon.add(blade);
    return blade;
  });

  // ⑤ 地面冰裂纹：贴地一张全屏宽的裂纹图，前沿由 uSpread 推。
  const cracks = res.mesh(
    'ice-cracks',
    new THREE.PlaneGeometry(width * 1.3, height * 0.34),
    createAdditivePlaneMaterial({
      uniforms: {
        uColor: { value: new THREE.Color('#9FD8FF') },
        uSpread: { value: 0 },
        uGlow: { value: 0 },
      },
      fragmentShader: ICE_CRACK_FRAGMENT,
    }),
  );
  cracks.position.set(0, floorY, 6);
  res.group.add(cracks);

  // ⑥ 霜白闪光：整屏冷白。
  const flash = res.mesh(
    'frost-flash',
    new THREE.PlaneGeometry(width * 1.5, height * 1.5),
    additiveMaterial('#F2FAFF', 0),
  );
  flash.position.z = 40;
  res.group.add(flash);

  // ⑦ 冰棱飞散：刚体世界只管冰棱。重力用像素量纲（正交相机下
  // 1 世界单位 = 1px），gravity 签名（-.16）是冰的「轻」偏置，
  // 叠在屏幕尺度的基准重力上，不能当唯一量级用。
  const world = new World({ gravity: new Vec3(0, -height * (1.7 + identity.gravity), 0) });
  world.allowSleep = true;

  // 地面：cannon 的 Plane 法线固定朝 +z，绕 x 轴转 -90° 才朝上（+y）。
  const floor = new Body({ type: Body.STATIC, shape: new Plane(), position: new Vec3(0, floorY, 0) });
  floor.quaternion.setFromAxisAngle(new Vec3(1, 0, 0), -Math.PI / 2);
  world.addBody(floor);

  const shardGroup = new THREE.Group();
  shardGroup.name = 'icicle-shards';
  shardGroup.position.z = 14;
  res.group.add(shardGroup);

  const shardCount = scaledCount(26, quality);
  const icicles: Icicle[] = [];
  for (let i = 0; i < shardCount; i += 1) {
    const length = short * (0.05 + rand(i, 23) * 0.06);
    const radius = length * 0.16;
    const mesh = res.mesh(
      `icicle-${i}`,
      icicleGeometry(length, radius),
      additiveMaterial('#D8EEFF', 0),
    );
    mesh.position.set(burst.x, burst.y, 0);
    shardGroup.add(mesh);

    const body = new Body({
      mass: identity.mass * (0.3 + rand(i, 29) * 0.7),
      shape: new Box(new Vec3(radius, length * 0.5, radius)),
      position: new Vec3(burst.x, burst.y, 0),
      // 未炸开前是 STATIC：冰晶还没裂，棱柱是晶核的一部分，不该先掉。
      type: Body.STATIC,
      // drag 签名（.974）转成线性阻尼：数值越接近 1 阻力越小。
      linearDamping: 1 - identity.drag,
      angularDamping: 0.14,
    });
    world.addBody(body);

    icicles.push({
      mesh, body,
      // 落点按半径铺开，让裂纹前沿扫到哪就有棱柱在哪落地。
      landX: (rand(i, 31) - 0.5) * width * 0.9,
      // 错峰释放：一次性全抛会变成一朵烟花，冰棱应该是连续崩落。
      releaseAt: rand(i, 37) * 0.42,
      released: false,
    });
  }

  // ⑧ 极光带：远处微光层，z 必须比雪幕近景更远（测试按此断言层序）。
  const aurora = res.mesh(
    'aurora-band',
    new THREE.PlaneGeometry(width * 1.4, height * 0.66),
    createAdditivePlaneMaterial({
      uniforms: {
        uColor: { value: new THREE.Color('#7CFFC4') },
        uEdgeColor: { value: new THREE.Color('#3C6BC8') },
        uTime: { value: 0 },
        uAlpha: { value: 0 },
      },
      fragmentShader: AURORA_FRAGMENT,
    }),
  );
  aurora.position.set(0, height * 0.24, -90);
  res.group.add(aurora);

  return {
    res, veil, near, far, shear, fog, fogLayers,
    siphon, siphonCore, siphonBlades, cracks, flash,
    shardGroup, icicles, world, aurora, burst, floorY,
  };
}
