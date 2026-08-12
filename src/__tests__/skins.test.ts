import { describe, it, expect } from 'vitest';
import { SkinManifestSchema, BUILTIN_SKIN_IDS } from '../shared/skins';

const validManifest = {
  specVersion: '1' as const,
  id: 'test-skin',
  name: 'Test Skin',
  visuals: {
    handleColor: '#111111',
    bodyGradient: ['#111111', '#333333'] as [string, string],
    tipGlow: false,
    particleEffect: 'none' as const,
    outlineColor: '#ffffff',
    bgAlpha: 0.011,
  },
  sounds: {
    crack: ['A.mp3'],
    whoosh: [],
  },
};

describe('SkinManifest schema', () => {
  it('parses a valid manifest', () => {
    expect(SkinManifestSchema.safeParse(validManifest).success).toBe(true);
  });

  it('rejects a specVersion other than "1"', () => {
    const invalid = { ...validManifest, specVersion: '2' };
    expect(SkinManifestSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects an id with uppercase or spaces', () => {
    expect(SkinManifestSchema.safeParse({ ...validManifest, id: 'Bad Id' }).success).toBe(false);
    expect(SkinManifestSchema.safeParse({ ...validManifest, id: 'BadId' }).success).toBe(false);
  });

  it('rejects a non-hex handleColor', () => {
    const invalid = {
      ...validManifest,
      visuals: { ...validManifest.visuals, handleColor: 'red' },
    };
    expect(SkinManifestSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects bgAlpha above 0.1', () => {
    const invalid = {
      ...validManifest,
      visuals: { ...validManifest.visuals, bgAlpha: 0.2 },
    };
    expect(SkinManifestSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects an empty crack sound list', () => {
    const invalid = { ...validManifest, sounds: { crack: [], whoosh: [] } };
    expect(SkinManifestSchema.safeParse(invalid).success).toBe(false);
  });

  it('accepts every valid particleEffect value', () => {
    for (const effect of ['none', 'sparks', 'stars', 'lightning']) {
      const manifest = {
        ...validManifest,
        visuals: { ...validManifest.visuals, particleEffect: effect },
      };
      expect(SkinManifestSchema.safeParse(manifest).success).toBe(true);
    }
  });

  it('rejects an unknown particleEffect', () => {
    const invalid = {
      ...validManifest,
      visuals: { ...validManifest.visuals, particleEffect: 'explosion' },
    };
    expect(SkinManifestSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects a name longer than 40 characters', () => {
    const invalid = { ...validManifest, name: 'x'.repeat(41) };
    expect(SkinManifestSchema.safeParse(invalid).success).toBe(false);
  });

  it('declares the 4 built-in skin ids from the spec', () => {
    expect(BUILTIN_SKIN_IDS).toEqual(['default', 'fire', 'electric', 'neon']);
  });
});
