import * as THREE from 'three';

export const TAU = Math.PI * 2;
export const clamp = (value: number, low: number, high: number): number => Math.max(low, Math.min(high, value));
export const numberParam = (params: Record<string, number>, names: string[], fallback: number): number => {
  for (const name of names) {
    const value = params[name];
    if (Number.isFinite(value)) return value;
  }
  return fallback;
};

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const delta = new THREE.Vector3();

/** Places a unit-height cylinder between two stable points without allocating. */
export function placeBeam(
  mesh: THREE.Mesh, ax: number, ay: number, az: number,
  bx: number, by: number, bz: number, radius = 1,
): void {
  delta.set(bx - ax, by - ay, bz - az);
  const length = Math.max(0.001, delta.length());
  mesh.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
  mesh.quaternion.setFromUnitVectors(Y_AXIS, delta.multiplyScalar(1 / length));
  mesh.scale.set(radius, length, radius);
}

export function shiftedColor(color: THREE.Color, hue: number, lightness: number): THREE.Color {
  return color.clone().offsetHSL(hue, 0, lightness);
}
