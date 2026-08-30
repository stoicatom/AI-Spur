/**
 * 场景 07 crystal 的四面体构形：显示几何与 cannon 凸包共用同一组顶点。
 *
 * 单独成文的理由：这组顶点与面序被视觉与物理两侧同时消费，
 * 放在任一侧都会让另一侧反向依赖。
 */
import * as THREE from 'three';
import { ConvexPolyhedron, Vec3 } from 'cannon-es';

/**
 * 四面体面序（CCW 绕外法线）。
 *
 * 顶点取自正方体的四个交错角，天然构成正四面体。面序不能随手写：
 * winding 反了 cannon 会判定法线朝内并打印告警，随后碰撞检测按内法线做，
 * 晶屑会陷进地面。这组序号是按「面法线与面心同向」逐面校正出来的。
 */
const TETRA_FACES: readonly number[][] = [[0, 2, 1], [0, 1, 3], [0, 3, 2], [1, 2, 3]];
const TETRA_CORNERS: readonly [number, number, number][] = [
  [1, 1, 1], [-1, -1, 1], [-1, 1, -1], [1, -1, -1],
];

/** 伪随机：同一 i 每次构建结果一致，碎裂形态因此可重现。 */
export function rand(i: number, salt: number): number {
  return ((Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453) % 1 + 1) % 1;
}

/** 四面体显示几何：与刚体形状同一组顶点，视觉与物理不脱节。 */
export function tetraGeometry(radius: number): THREE.BufferGeometry {
  const pts: number[] = [];
  for (const face of TETRA_FACES) {
    for (const idx of face) {
      const [x, y, z] = TETRA_CORNERS[idx];
      pts.push(x * radius, y * radius, z * radius);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export function tetraShape(radius: number): ConvexPolyhedron {
  return new ConvexPolyhedron({
    vertices: TETRA_CORNERS.map(([x, y, z]) => new Vec3(x * radius, y * radius, z * radius)),
    faces: TETRA_FACES.map((face) => [...face]),
  });
}
