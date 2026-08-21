import * as THREE from 'three';

export const TAU = Math.PI * 2;
export const clamp = (value: number, low: number, high: number): number =>
  Math.max(low, Math.min(high, value));
export const easeOut = (value: number): number => 1 - Math.pow(1 - clamp(value, 0, 1), 3);

export function cosmicParam(params: Record<string, number>, names: string[], fallback: number): number {
  for (const name of names) {
    const value = params[name];
    if (Number.isFinite(value)) return value;
  }
  return fallback;
}

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const beamDelta = new THREE.Vector3();

/** Places a unit-height mesh between two immutable stage-space endpoints. */
export function placeCosmicBeam(
  mesh: THREE.Mesh, ax: number, ay: number, az: number,
  bx: number, by: number, bz: number, radius = 1,
): void {
  beamDelta.set(bx - ax, by - ay, bz - az);
  const length = Math.max(0.001, beamDelta.length());
  mesh.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
  mesh.quaternion.setFromUnitVectors(Y_AXIS, beamDelta.multiplyScalar(1 / length));
  mesh.scale.set(radius, length, radius);
}

export function starGeometry(points: number, outer = 1, inner = 0.42): THREE.ShapeGeometry {
  const shape = new THREE.Shape();
  const count = Math.max(3, Math.round(points));
  for (let i = 0; i < count * 2; i++) {
    const angle = -Math.PI / 2 + i * Math.PI / count;
    const radius = i % 2 === 0 ? outer : inner;
    const x = Math.cos(angle) * radius; const y = Math.sin(angle) * radius;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

export function setObjectOpacity(object: THREE.Object3D, opacity: number): void {
  object.traverse((child) => {
    const material = (child as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(material)) material.forEach((entry) => { entry.opacity = opacity; });
    else if (material) material.opacity = opacity;
  });
}
