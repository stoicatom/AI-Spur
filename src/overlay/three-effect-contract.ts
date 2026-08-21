import type { EffectPresetId } from '../shared/material-packs';

/**
 * Rendering responsibilities for one preset.
 *
 * A family stage is already a complete visual composition.  The legacy
 * sprite/particle/light layers are therefore opt-in instead of being added to
 * every run, which prevents a rain stage from turning into a glowing icon
 * burst and keeps the GPU budget predictable.
 */
export type EffectRenderContract = Readonly<{
  sourceSprite: boolean;
  genericParticles: boolean;
  pointLight: boolean;
}>;

const NONE: EffectRenderContract = Object.freeze({
  sourceSprite: false,
  genericParticles: false,
  pointLight: false,
});

const LEGACY_GENERIC: EffectRenderContract = Object.freeze({
  sourceSprite: true,
  genericParticles: true,
  pointLight: false,
});

const EMISSIVE_STAGE: EffectRenderContract = Object.freeze({
  sourceSprite: false,
  genericParticles: false,
  pointLight: true,
});

/** Presets whose family stage owns the complete scene. */
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
    return EMISSIVE.has(id) ? EMISSIVE_STAGE : NONE;
  }
  return NONE;
}

export const DEFAULT_EFFECT_RENDER_CONTRACT = NONE;
