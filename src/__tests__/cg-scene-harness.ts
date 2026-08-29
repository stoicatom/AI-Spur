/**
 * CG 场景验收共用夹具。
 *
 * 每个场景的验收都要「摊平场景树按 name 点元素、读 opacity/uniform、量包围盒」，
 * 这些取值方式与具体场景无关，抽出来让各场景用例只留下自己的规格断言。
 */
import * as THREE from 'three';
import type { CgStageContext } from '../overlay/cg-scene';

/** 造一份验收用上下文；各场景按需覆盖 quality、尺寸等。 */
export function makeSceneCtx(overrides: Partial<CgStageContext> = {}): CgStageContext {
  return {
    root: new THREE.Group(),
    origin: new THREE.Vector3(0, 0, 0),
    color: new THREE.Color('#5B7CFF'),
    energy: 1.5,
    direction: new THREE.Vector2(0, -1),
    width: 1920,
    height: 1080,
    quality: 'cinematic',
    params: {},
    now: 0,
    ...overrides,
  };
}

/** 摊平整棵场景树：状态变化都挂在子节点上，只看顶层会漏。 */
export function nodes(root: THREE.Object3D): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  root.traverse((o) => out.push(o));
  return out;
}

/** 具名节点连成一串，便于用 toContain 点元素清单。 */
export function names(root: THREE.Object3D): string {
  return nodes(root).map((o) => o.name).filter(Boolean).join('|');
}

/** 按 name 取节点；缺失直接抛，避免断言里出现 undefined 的二次报错。 */
export function node(root: THREE.Object3D, name: string): THREE.Object3D {
  const hit = nodes(root).find((o) => o.name === name);
  if (!hit) throw new Error(`节点缺失: ${name}`);
  return hit;
}

/** 读材质透明度；多材质与无材质节点一律按 0 处理。 */
export function opacity(o: THREE.Object3D): number {
  const material = (o as THREE.Mesh).material;
  if (!material || Array.isArray(material)) return 0;
  return (material as THREE.Material).opacity;
}

/** 读一个 float uniform（shader 材质专属状态，opacity 表达不了的那些）。 */
export function uniformOf(o: THREE.Object3D, key: string): number {
  const material = (o as THREE.Mesh).material as THREE.ShaderMaterial;
  return Number(material.uniforms[key].value);
}

/** 世界包围盒，用于验收全屏覆盖类断言。 */
export function box(o: THREE.Object3D): THREE.Box3 {
  o.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(o);
}

/** 名字/位置/缩放/透明度快照，用于比对两幕视觉状态是否真的不同。 */
export function visualSnapshot(root: THREE.Object3D): string {
  const rows: unknown[] = [];
  root.traverse((o) => {
    rows.push([
      o.name,
      o.position.toArray().map((n) => Number(n.toFixed(2))),
      o.scale.toArray().map((n) => Number(n.toFixed(3))),
      Number(opacity(o).toFixed(3)),
    ]);
  });
  return JSON.stringify(rows);
}
