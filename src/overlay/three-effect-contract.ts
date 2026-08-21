import type { EffectPresetId } from '../shared/material-packs';

/**
 * Rendering responsibilities for one preset.
 *
 * A family stage remains the complete physical composition. The source sprite
 * is a separate material-identity layer; generic particles stay opt-in so a
 * rain stage does not turn into a generic icon burst.
 */
export type EffectRenderContract = Readonly<{
  sourceSprite: boolean;
  genericParticles: boolean;
  pointLight: boolean;
}>;

const MATERIAL_STAGE: EffectRenderContract = Object.freeze({
  sourceSprite: true,
  genericParticles: false,
  pointLight: false,
});

const LEGACY_GENERIC: EffectRenderContract = Object.freeze({
  sourceSprite: true,
  genericParticles: true,
  pointLight: false,
});

const EMISSIVE_STAGE: EffectRenderContract = Object.freeze({
  sourceSprite: true,
  genericParticles: false,
  pointLight: true,
});

/** Presets whose family stage owns the complete physical scene. */
const SPECIALIZED = new Set<EffectPresetId>([
  'jet', 'rise', 'bolt', 'wave', 'orbit', 'dash', 'shatter', 'burst',
  'flame-rise', 'shatter-ice', 'shock-ring', 'water-splash', 'whirl',
  'star-burst', 'impact', 'comet', 'trail-burst', 'pulse', 'ring', 'petal',
  'echo', 'arc', 'explode', 'tornado', 'downpour', 'wildfire', 'gunshot',
  'glass-break', 'boxing', 'whip-crack', 'note-dance', 'groove', 'fireworks',
  'singularity', 'drum-beat',
]);

/** Small set retained for old user-created packs that expect an icon trail. */
const LEGACY = new Set<EffectPresetId>([
  'spiral', 'split', 'chain', 'twinkle', 'vortex', 'rain', 'glow',
]);

const EMISSIVE = new Set<EffectPresetId>([
  'bolt', 'flame-rise', 'explode', 'fireworks', 'singularity',
]);

export function renderContractFor(id: EffectPresetId): EffectRenderContract {
  if (LEGACY.has(id)) return LEGACY_GENERIC;
  if (SPECIALIZED.has(id)) {
    return EMISSIVE.has(id) ? EMISSIVE_STAGE : MATERIAL_STAGE;
  }
  return MATERIAL_STAGE;
}

export const DEFAULT_EFFECT_RENDER_CONTRACT = MATERIAL_STAGE;
