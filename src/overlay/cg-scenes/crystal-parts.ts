/**
 * 场景 07 crystal 的晶体本体：折射材质、晶塔、8 层剥落壳。
 *
 * 三层分工：本文件造晶体实体，crystal-veils.ts 造屏空间光效，
 * crystal-shards.ts 管刚体物理，编排全部归主文件。
 */
import * as THREE from 'three';
import type { CgStageContext } from '../cg-scene';
import type { SceneResources } from '../cg-scene-kit';
import { createAdditivePlaneMaterial } from '../cg-shaders';
import { TOWER_CORE_FRAGMENT } from './crystal-shaders';

/** 规格「8 层」是签名形态，任何档位都不缩减。 */
export const PEEL_LAYERS = 8;

/**
 * 折射材质：签名之二，全库唯一的真折射。
 *
 * 用 MeshPhysicalMaterial 的 transmission/ior/thickness——这是 three 里唯一
 * 真正做透射折射的材质路径，靠 opacity 假透明达不到「光穿过晶体被弯折」的观感。
 * ior 1.54 取水晶（石英）实测折射率。
 */
export function createRefractiveMaterial(res: SceneResources, color: THREE.Color): THREE.MeshPhysicalMaterial {
  return res.track(new THREE.MeshPhysicalMaterial({
    color: color.clone().lerp(new THREE.Color('#ffffff'), 0.55),
    transmission: 0.92,
    ior: 1.54,
    thickness: 26,
    roughness: 0.06,
    metalness: 0,
    // 晶体边缘的高光镶边：折射体的立体感主要靠这层清漆反射读出来。
    clearcoat: 0.85,
    clearcoatRoughness: 0.12,
    transparent: true,
    opacity: 1,
    side: THREE.DoubleSide,
    depthWrite: false,
  }));
}

/** ① 晶塔：居中高耸的六方晶柱，含塔芯蓄力辉光。 */
export function createTower(
  res: SceneResources,
  ctx: CgStageContext,
  span: number,
  material: THREE.MeshPhysicalMaterial,
): { group: THREE.Group; core: THREE.Mesh } {
  const group = new THREE.Group();
  group.name = 'crystal-tower';
  res.group.add(group);

  // 六方晶系：6 边棱柱 + 收顶，radialSegments 取 6 是材质使然而非省面数。
  const height = span * 0.86;
  const body = new THREE.Mesh(
    res.track(new THREE.CylinderGeometry(span * 0.085, span * 0.13, height, 6, 1, false)),
    material,
  );
  body.name = 'tower-facets';
  group.add(body);

  const cap = new THREE.Mesh(
    res.track(new THREE.ConeGeometry(span * 0.085, span * 0.26, 6)),
    material,
  );
  cap.name = 'tower-apex';
  cap.position.y = height * 0.5 + span * 0.13;
  group.add(cap);

  const core = new THREE.Mesh(
    res.track(new THREE.PlaneGeometry(span * 0.34, height * 1.18)),
    res.track(createAdditivePlaneMaterial({
      fragmentShader: TOWER_CORE_FRAGMENT,
      uniforms: {
        uColor: { value: ctx.color.clone() },
        uCharge: { value: 0 },
        uTime: { value: 0 },
      },
    })),
  );
  core.name = 'tower-core';
  core.position.z = 6;
  group.add(core);
  return { group, core };
}

/**
 * ② 8 层剥落壳：自塔顶而下逐层剥离。
 *
 * 每层是包住塔身一段高度的空心壳。层序与高度绑定（0 在顶、7 在底），
 * 让「剥离顺序自上而下」有物理动机：击中点在塔顶，裂纹沿轴向下扩展。
 */
export function createPeelLayers(
  res: SceneResources,
  span: number,
  material: THREE.MeshPhysicalMaterial,
): THREE.Mesh[] {
  const group = new THREE.Group();
  group.name = 'facet-peel';
  res.group.add(group);

  const height = span * 0.86;
  const slice = height / PEEL_LAYERS;
  const layers: THREE.Mesh[] = [];
  for (let i = 0; i < PEEL_LAYERS; i += 1) {
    // 顶端最细：与塔身的锥度一致，剥下来的壳才贴合塔面。
    const topRatio = 1 - i / PEEL_LAYERS;
    const rTop = span * (0.085 + 0.045 * topRatio);
    const rBottom = span * (0.085 + 0.045 * (1 - (i + 1) / PEEL_LAYERS));
    const shell = new THREE.Mesh(
      res.track(new THREE.CylinderGeometry(rTop * 1.06, rBottom * 1.06, slice * 0.94, 6, 1, true)),
      material,
    );
    shell.name = `peel-layer-${i}`;
    // 索引越大越靠下：测试据此断言剥离顺序自上而下。
    shell.position.y = height * 0.5 - slice * (i + 0.5);
    group.add(shell);
    layers.push(shell);
  }
  return layers;
}
