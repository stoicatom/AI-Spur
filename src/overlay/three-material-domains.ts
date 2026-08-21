import * as THREE from 'three';

export type MaterialDomain =
  | 'metal'
  | 'wood'
  | 'leather'
  | 'glass'
  | 'ice'
  | 'water'
  | 'rock'
  | 'fabric'
  | 'fire'
  | 'smoke';

type DomainParams = THREE.MeshPhysicalMaterialParameters & {
  emissiveScale?: number;
};

const DOMAIN_PARAMS: Record<MaterialDomain, DomainParams> = {
  metal: {
    metalness: 0.9, roughness: 0.27, clearcoat: 0.34, clearcoatRoughness: 0.22,
    envMapIntensity: 1.25, emissiveScale: 0.035,
  },
  wood: {
    metalness: 0, roughness: 0.72, clearcoat: 0.16, clearcoatRoughness: 0.48,
    sheen: 0.08, emissiveScale: 0.015,
  },
  leather: {
    metalness: 0, roughness: 0.66, clearcoat: 0.08, clearcoatRoughness: 0.72,
    sheen: 0.34, sheenRoughness: 0.78, emissiveScale: 0.012,
  },
  glass: {
    metalness: 0, roughness: 0.08, transmission: 0.7, thickness: 0.82,
    ior: 1.5, clearcoat: 1, clearcoatRoughness: 0.08, opacity: 0.76,
    emissiveScale: 0.045,
  },
  ice: {
    metalness: 0, roughness: 0.19, transmission: 0.42, thickness: 1.15,
    ior: 1.31, clearcoat: 0.86, clearcoatRoughness: 0.15, opacity: 0.86,
    emissiveScale: 0.08,
  },
  water: {
    metalness: 0, roughness: 0.07, transmission: 0.58, thickness: 0.35,
    ior: 1.333, clearcoat: 1, clearcoatRoughness: 0.05, opacity: 0.7,
    emissiveScale: 0.055,
  },
  rock: {
    metalness: 0.02, roughness: 0.94, clearcoat: 0, flatShading: true,
    emissiveScale: 0.008,
  },
  fabric: {
    metalness: 0, roughness: 0.88, clearcoat: 0, sheen: 0.7,
    sheenRoughness: 0.82, emissiveScale: 0.018,
  },
  fire: {
    metalness: 0, roughness: 0.35, clearcoat: 0, opacity: 0.78,
    emissiveScale: 1.35,
  },
  smoke: {
    metalness: 0, roughness: 1, clearcoat: 0, opacity: 0.16,
    emissiveScale: 0,
  },
};

/** Build a domain material without sharing mutable material instances. */
export function materialForDomain(
  color: THREE.Color,
  energy: number,
  domain: MaterialDomain,
): THREE.MeshPhysicalMaterial {
  const { emissiveScale = 0, ...params } = DOMAIN_PARAMS[domain];
  const material = new THREE.MeshPhysicalMaterial({
    ...params,
    color,
    emissive: color,
    emissiveIntensity: emissiveScale * Math.max(0, energy),
    transparent: true,
    depthWrite: false,
  });
  if ('sheenColor' in material && (domain === 'leather' || domain === 'fabric')) {
    material.sheenColor.copy(color).offsetHSL(0, -0.18, 0.08);
  }
  return material;
}

export function materialDomainParameters(domain: MaterialDomain): Readonly<DomainParams> {
  return DOMAIN_PARAMS[domain];
}
