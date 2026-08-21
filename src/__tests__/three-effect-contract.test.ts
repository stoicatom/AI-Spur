import { describe, expect, it } from 'vitest';
import { EFFECT_PRESET_IDS } from '../shared/material-packs';
import { renderContractFor } from '../overlay/three-effect-contract';

describe('Three effect render contracts', () => {
  it('defines all three layer decisions for every preset', () => {
    for (const id of EFFECT_PRESET_IDS) {
      const contract = renderContractFor(id);
      expect(typeof contract.sourceSprite, `${id}.sourceSprite`).toBe('boolean');
      expect(typeof contract.genericParticles, `${id}.genericParticles`).toBe('boolean');
      expect(typeof contract.pointLight, `${id}.pointLight`).toBe('boolean');
    }
  });

  it.each(['downpour', 'tornado', 'wildfire'] as const)('%s owns its complete stage', (id) => {
    expect(renderContractFor(id)).toEqual({
      sourceSprite: false,
      genericParticles: false,
      pointLight: false,
    });
  });

  it('keeps only explicit compatibility presets on the generic path', () => {
    expect(renderContractFor('spiral')).toMatchObject({ sourceSprite: true, genericParticles: true });
    expect(renderContractFor('jet')).toMatchObject({ sourceSprite: false, genericParticles: false });
    expect(renderContractFor('fireworks')).toMatchObject({ sourceSprite: false, genericParticles: false, pointLight: true });
  });
});
