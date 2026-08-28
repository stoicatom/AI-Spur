import * as THREE from 'three';

export const TAU = Math.PI * 2;
export const clamp = (value: number, low: number, high: number): number => Math.max(low, Math.min(high, value));
export const easeOut = (value: number): number => 1 - Math.pow(1 - clamp(value, 0, 1), 3);

export function weaponParam(params: Record<string, number>, name: string, fallback: number): number {
  const value = params[name];
  return Number.isFinite(value) ? value : fallback;
}

export function weaponColor(color: THREE.Color, hue: number, lightness: number): THREE.Color {
  return color.clone().offsetHSL(hue, 0, lightness);
}

/** Family stage groups own material instances, so this can fade compound props in one pass. */
export function setWeaponOpacity(object: THREE.Object3D, opacity: number): void {
  object.traverse((child) => {
    const material = (child as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(material)) material.forEach((entry) => { entry.opacity = opacity; });
    else if (material) material.opacity = opacity;
  });
}
