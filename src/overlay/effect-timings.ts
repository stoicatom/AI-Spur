import type { EffectPresetId } from '../shared/material-packs';
import { MATERIAL_ANIMATION_DURATION_SCALE } from './material-animation-constants';

/** Shared effect durations keep Canvas fallback, WebGL, and audio timelines aligned. */
const BASE_DEFAULT_EFFECT_DURATION_MS = 1200;
export const DEFAULT_EFFECT_DURATION_MS = Math.round(BASE_DEFAULT_EFFECT_DURATION_MS * MATERIAL_ANIMATION_DURATION_SCALE);

const DURATION_OVERRIDES: Readonly<Partial<Record<EffectPresetId, number>>> = Object.freeze({
  tornado: 1800,
  downpour: 1900,
  wildfire: 1750,
  gunshot: 720,
  'glass-break': 1550,
  boxing: 850,
  'whip-crack': 1100,
  'note-dance': 1800,
  groove: 1900,
  fireworks: 1950,
  singularity: 1850,
  'drum-beat': 1450,
});

export function effectDurationFor(id: EffectPresetId): number {
  const baseDuration = DURATION_OVERRIDES[id] ?? BASE_DEFAULT_EFFECT_DURATION_MS;
  return Math.round(baseDuration * MATERIAL_ANIMATION_DURATION_SCALE);
}

/** The tip snaps after the tension wave has reached the end of the lash. */
export const WHIP_CRACK_IMPACT_PROGRESS = 0.5;

export const WHIP_CRACK_IMPACT_SECONDS =
  effectDurationFor('whip-crack') * WHIP_CRACK_IMPACT_PROGRESS / 1000;
