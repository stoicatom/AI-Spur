import { describe, expect, it } from 'vitest';
import { BUILTIN_PACK_IDS } from '../shared/material-packs';
import { MATERIAL_IDENTITIES, materialIdentityFor } from '../overlay/material-identity';

describe('material identities', () => {
  it('covers all 42 built-ins with unique physical and acoustic signatures', () => {
    expect(Object.keys(MATERIAL_IDENTITIES).sort()).toEqual([...BUILTIN_PACK_IDS].sort());
    const identities = BUILTIN_PACK_IDS.map((id) => MATERIAL_IDENTITIES[id]);
    const physical = identities.map(({ physical: p }) =>
      [p.surface, p.force, p.mass, p.restitution, p.friction, p.drag, p.gravity, p.phase].join(':'));
    const acoustic = identities.map(({ acoustic: a }) =>
      [a.medium, a.density, a.roughness, a.resonanceHz, a.absorption, a.spaceWidth, a.transient].join(':'));
    expect(new Set(physical).size).toBe(42);
    expect(new Set(acoustic).size).toBe(42);
  });

  it('creates a deterministic bounded identity for custom packs', () => {
    const a = materialIdentityFor('custom-rain', 'downpour', { density: 1.4 });
    const b = materialIdentityFor('custom-rain', 'downpour', { density: 1.4 });
    expect(a).toEqual(b);
    expect(a.physical.mass).toBeGreaterThan(0);
    expect(a.physical.restitution).toBeGreaterThanOrEqual(0);
    expect(a.physical.restitution).toBeLessThanOrEqual(1);
    expect(a.acoustic.resonanceHz).toBeGreaterThanOrEqual(20);
    expect(a.acoustic.resonanceHz).toBeLessThanOrEqual(12000);
  });
});
