/**
 * 场景 34 revolver 的元素搭建。
 *
 * 命名规则：不同性质的节点前缀互不包含（`casing-N` 弹壳 / `spark-N`
 * 转轮光斑 / `smokepuff-N` 烟团），避免前缀匹配的断言测错对象。
 * 特别注意 `smoke-anchor` 与 `smokepuff-N` 不构成前缀包含关系。
 */
import * as THREE from 'three';
import type { CgStageContext } from '../cg-scene';
import { additiveMaterial, createSceneResources, type SceneResources } from '../cg-scene-kit';
import { createAdditivePlaneMaterial, createBlendedPlaneMaterial } from '../cg-shaders';
import {
  REVOLVER_BODY_FRAGMENT,
  REVOLVER_CONE_FRAGMENT,
  REVOLVER_SMOKE_FRAGMENT,
} from './revolver-shaders';

/** 硝烟团数：多团错相位堆出体积感。 */
export const SMOKE_PUFF_COUNT = 5;
/** 转轮侧向光斑数：六格弹巢里被照亮的那几格。 */
export const CYLINDER_SPARK_COUNT = 4;

type ShaderMesh = THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
type BasicMesh = THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;

export type SmokePuff = {
  readonly mesh: ShaderMesh;
  /** 该团相对枪口的漂移方向（枪口后上方，随后坐气流走）。 */
  readonly drift: THREE.Vector2;
  /** 相位偏移，让各团不同步涌出。 */
  readonly phase: number;
};

export type CylinderSpark = {
  readonly mesh: BasicMesh;
  /** 该光斑在转轮上的角位置（弧度）。 */
  readonly angle: number;
};

export type RevolverParts = {
  readonly res: SceneResources;
  /** ① 枪身（含转轮盘面）。 */
  readonly body: ShaderMesh;
  /** ② 枪口焰的锥光层（粒子焰在场景层用 quarks 发）。 */
  readonly cone: ShaderMesh;
  /** ④ 后坐力：枪身挂在这个容器上，位移施加于它。 */
  readonly recoilRig: THREE.Group;
  /** ⑤ 弹道火光（亮线）。 */
  readonly tracer: BasicMesh;
  /** ⑥ 硝烟团。 */
  readonly puffs: SmokePuff[];
  /** ⑦ 转轮偏转的侧向光斑。 */
  readonly sparks: CylinderSpark[];
  /** ⑧ 目标炸点（远端小闪）。 */
  readonly targetFlash: BasicMesh;
  /** 枪口在局部坐标里的位置（锥光与粒子焰的起点）。 */
  readonly muzzle: THREE.Vector3;
  /** 射击方向的符号：+1 向右。 */
  readonly aim: number;
  readonly short: number;
  readonly groundY: number;
};

/**
 * 建 revolver 场景的全部可见元素（弹壳刚体层在 ./revolver-casing）。
 *
 * @param ctx 场景上下文
 */
export function buildRevolverParts(ctx: CgStageContext): RevolverParts {
  const { width, height, color, direction } = ctx;
  const res = createSceneResources(ctx.root, ctx.origin, 'revolver-scene');
  const short = Math.min(width, height);
  const groundY = -height * 0.42;

  // 射击朝向：触发方向的横向分量决定枪口朝左还是朝右，零向量时朝右。
  const aim = direction.x >= 0 ? 1 : -1;

  // 配色：枪身是冷灰金属，焰是白热到橙的过渡，烟是暖灰。
  const steel = color.clone().lerp(new THREE.Color('#4A4E58'), 0.82);
  const hot = color.clone().lerp(new THREE.Color('#FFF4D6'), 0.78);
  const flame = color.clone().lerp(new THREE.Color('#FF8A24'), 0.7);
  const smoke = color.clone().lerp(new THREE.Color('#B8B2A6'), 0.8);

  // 枪身尺寸：约屏短边的三成，位于画面偏后方（枪口朝屏心一侧）。
  const bodyW = short * 0.34;
  const bodyH = short * 0.3;
  const bodyX = -aim * width * 0.3;
  const bodyY = -height * 0.12;

  // ④ 后坐 rig：枪身与转轮光斑都挂它，位移一处施加、整枪跟着退。
  const recoilRig = new THREE.Group();
  recoilRig.name = 'recoil-rig';
  recoilRig.position.set(bodyX, bodyY, 0);
  res.group.add(recoilRig);

  // ① 枪身剪影。
  const body = res.mesh(
    'gun-body',
    new THREE.PlaneGeometry(bodyW, bodyH),
    createBlendedPlaneMaterial({
      fragmentShader: REVOLVER_BODY_FRAGMENT,
      uniforms: {
        uColor: { value: steel },
        uHiColor: { value: hot },
        uAlpha: { value: 0 },
        uCylinder: { value: 0 },
        uFlash: { value: 0 },
      },
    }),
  );
  body.position.z = 4;
  // 朝左射击时整枪镜像。
  body.scale.x = aim;
  recoilRig.add(body);

  // 枪口位置：枪身局部 x 正向端点（已含镜像）。
  const muzzle = new THREE.Vector3(bodyX + aim * bodyW * 0.44, bodyY + bodyH * 0.04, 2);

  // ② 焰口锥光：一侧铺满全屏（规格「全屏」）。长度取全宽的 1.25 倍，
  // 保证 uReach=1 时锥尖真的越过屏缘而不是刚好贴边。
  const coneLen = width * 1.25;
  const cone = res.mesh(
    'muzzle-cone',
    new THREE.PlaneGeometry(coneLen, height * 1.15),
    createAdditivePlaneMaterial({
      fragmentShader: REVOLVER_CONE_FRAGMENT,
      uniforms: {
        uColor: { value: flame },
        uCoreColor: { value: hot },
        uAlpha: { value: 0 },
        uReach: { value: 0 },
        uTime: { value: 0 },
      },
    }),
  );
  // 锥的 uv.x=0 一端对齐枪口：几何中心因此偏出半个锥长。
  cone.position.set(muzzle.x + aim * coneLen * 0.5, muzzle.y, 1);
  cone.scale.x = aim;
  res.group.add(cone);

  // ⑤ 弹道火光：从枪口射向远端的一条亮线。
  const tracer = res.mesh(
    'tracer-line',
    new THREE.PlaneGeometry(coneLen * 0.92, Math.max(2, short * 0.006)),
    additiveMaterial(hot),
  );
  tracer.position.set(muzzle.x + aim * coneLen * 0.46, muzzle.y, 3);
  res.group.add(tracer);

  // ⑧ 目标炸点：远端屏缘附近的小闪。
  const targetFlash = res.mesh(
    'target-burst',
    new THREE.PlaneGeometry(short * 0.16, short * 0.16),
    additiveMaterial(hot),
  );
  targetFlash.position.set(aim * width * 0.42, muzzle.y + short * 0.03, 2);
  res.group.add(targetFlash);

  // ⑦ 转轮偏转的侧向光斑：挂在 rig 上随枪一起退。
  const sparks: CylinderSpark[] = [];
  for (let i = 0; i < CYLINDER_SPARK_COUNT; i += 1) {
    const angle = (i / CYLINDER_SPARK_COUNT) * Math.PI * 2;
    const mesh = res.mesh(
      `spark-${i}`,
      new THREE.PlaneGeometry(short * 0.03, short * 0.03),
      additiveMaterial(hot),
    );
    mesh.position.z = 5;
    recoilRig.add(mesh);
    sparks.push({ mesh, angle });
  }

  // ⑥ 硝烟团：枪口前上方一片，各团错相位。
  const puffs: SmokePuff[] = [];
  for (let i = 0; i < SMOKE_PUFF_COUNT; i += 1) {
    const mesh = res.mesh(
      `smokepuff-${i}`,
      new THREE.PlaneGeometry(short * 0.26, short * 0.26),
      createAdditivePlaneMaterial({
        fragmentShader: REVOLVER_SMOKE_FRAGMENT,
        uniforms: {
          uColor: { value: smoke },
          uAlpha: { value: 0 },
          uTime: { value: 0 },
          uSwell: { value: 0 },
        },
      }),
    );
    mesh.material.blending = THREE.NormalBlending;
    mesh.position.z = 6;
    res.group.add(mesh);
    puffs.push({
      mesh,
      // 烟往枪口前方偏上飘：燃气比空气热所以上浮。
      drift: new THREE.Vector2(aim * (0.35 + i * 0.22), 0.24 + (i % 3) * 0.16),
      phase: (i * 2.399963) % (Math.PI * 2),
    });
  }

  return {
    res, body, cone, recoilRig, tracer, puffs, sparks, targetFlash,
    muzzle, aim, short, groundY,
  };
}
