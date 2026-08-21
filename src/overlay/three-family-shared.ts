import * as THREE from 'three';
import type { PhysicalProfile } from './three-effect-profiles';
import { materialForDomain, type MaterialDomain } from './three-material-domains';

export type FamilyContext = {
  root: THREE.Group;
  origin: THREE.Vector3;
  color: THREE.Color;
  energy: number;
  profile: PhysicalProfile;
  direction: THREE.Vector2;
  width: number;
  height: number;
  params: Record<string, number>;
};

export interface FamilyLayer {
  update(t: number, now: number): void;
}

export const fadeAt = (t: number, start = 0.7): number =>
  t < start ? 1 : Math.max(0, 1 - (t - start) / (1 - start));

export function additiveMaterial(color: THREE.Color, opacity = 0.8): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false,
  });
}

export function physicalMaterial(
  color: THREE.Color,
  energy: number,
  domain: MaterialDomain = 'metal',
): THREE.MeshPhysicalMaterial {
  return materialForDomain(color, energy, domain);
}

export function setOpacity(mesh: THREE.Object3D, opacity: number): void {
  const material = (mesh as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
  if (Array.isArray(material)) material.forEach((entry) => { entry.opacity = opacity; });
  else if (material) material.opacity = opacity;
}
