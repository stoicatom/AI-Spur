import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MaterialPackSchema, type MaterialPack } from '../shared/material-packs';
import { resolveMaterialPhysics } from '../overlay/three-effect-physics';
import { profileFor } from '../overlay/three-effect-profiles';

const packsDir = resolve(__dirname, '../../src-tauri/packs');

function bundledPacks(): MaterialPack[] {
  return readdirSync(packsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const disk = JSON.parse(readFileSync(resolve(packsDir, entry.name, 'pack.json'), 'utf-8'));
      return MaterialPackSchema.parse({
        id: disk.id,
        name: disk.name,
        builtin: true,
        imageFile: disk.icon,
        dataUri: 'data:image/svg+xml;base64,PHN2Zy8+',
        effect: disk.effect,
        sound: disk.sound,
        palette: disk.palette,
      });
    });
}

describe('真实素材物理参数覆盖', () => {
  it('42 个内置素材均拥有独立的 3D 物理身份', () => {
    const packs = bundledPacks();
    expect(packs).toHaveLength(42);
    const identities = packs.map((pack) => {
      const physics = resolveMaterialPhysics(profileFor(pack.effect.preset), pack.effect.params, 6);
      return `${pack.effect.preset}:${physics.signature}`;
    });
    expect(new Set(identities).size).toBe(42);
  });

  it('每一个清单物理参数都会改变主 3D 粒子求解指纹', () => {
    for (const pack of bundledPacks()) {
      const profile = profileFor(pack.effect.preset);
      const baseline = resolveMaterialPhysics(profile, pack.effect.params, 6);

      for (const [key, value] of Object.entries(pack.effect.params)) {
        const altered = resolveMaterialPhysics(profile, { ...pack.effect.params, [key]: value + 0.137 }, 6);
        expect(altered.signature, `${pack.id}.${key} must affect particle identity`).not.toBe(baseline.signature);
        expect(altered.phase, `${pack.id}.${key} must affect particle phase`).not.toBe(baseline.phase);
      }
    }
  });
});
