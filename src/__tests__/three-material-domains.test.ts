import { describe, expect, it } from 'vitest';
import { materialDomainParameters, type MaterialDomain } from '../overlay/three-material-domains';

const DOMAINS: MaterialDomain[] = [
  'metal', 'wood', 'leather', 'glass', 'ice', 'water', 'rock', 'fabric', 'fire', 'smoke',
];

describe('physical material domains', () => {
  it('defines distinct optical responses for all required substances', () => {
    expect(DOMAINS.map((domain) => materialDomainParameters(domain))).toHaveLength(10);
    expect(materialDomainParameters('metal').metalness).toBeGreaterThan(0.8);
    expect(materialDomainParameters('wood').roughness).toBeGreaterThan(0.6);
    expect(materialDomainParameters('leather').sheen).toBeGreaterThan(0.2);
    expect(materialDomainParameters('glass').transmission).toBeGreaterThan(0.6);
    expect(materialDomainParameters('ice').ior).not.toBe(materialDomainParameters('glass').ior);
    expect(materialDomainParameters('water').ior).toBeCloseTo(1.333, 3);
    expect(materialDomainParameters('rock').roughness).toBeGreaterThan(0.9);
    expect(materialDomainParameters('fabric').sheen).toBeGreaterThan(0.6);
    expect(materialDomainParameters('fire').emissiveScale).toBeGreaterThan(1);
    expect(materialDomainParameters('smoke').opacity).toBeLessThan(0.2);
  });
});
