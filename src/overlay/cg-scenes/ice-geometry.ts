/**
 * 场景 10 ice 的几何原料：冰的解理形状与散布随机源。
 *
 * 与 ice-parts 分开的理由：这里只回答「一根冰棱/一片晶叶长什么样」，
 * 不知道场上有几根、摆在哪、用什么材质——那些是 ice-parts 的搭建职责。
 * 形状函数是纯函数且无场景依赖，单独放一处便于调形状而不动搭建逻辑。
 */
import * as THREE from 'three';

/** 伪随机：同一 (i, salt) 每次构建一致，冰棱散布因此可重现。 */
export function rand(i: number, salt: number): number {
  return ((Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453) % 1 + 1) % 1;
}

/** 六棱柱冰棱：细长六面体才像冰的解理面，方块会露出网格感。 */
export function icicleGeometry(length: number, radius: number): THREE.BufferGeometry {
  // 顶端收细：冰棱是尖的，等径柱体看着像铅笔。
  return new THREE.CylinderGeometry(radius * 0.25, radius, length, 6, 1);
}

/** ④ 晶核叶片：六向辐射的菱形薄片，构成冰晶的六重对称。 */
export function bladeGeometry(span: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(span * 0.16, span * 0.34);
  shape.lineTo(0, span);
  shape.lineTo(-span * 0.16, span * 0.34);
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}
