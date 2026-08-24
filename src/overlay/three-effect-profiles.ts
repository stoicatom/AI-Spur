import * as THREE from 'three';
import type { EffectPresetId } from '../shared/material-packs';
import { DEFAULT_EFFECT_DURATION_MS, effectDurationFor } from './effect-timings';

export type Shape = 'sphere' | 'tetra' | 'box' | 'ring' | 'cone' | 'octa';
export type EffectFamily = 'natural' | 'weapon' | 'rhythm' | 'impact' | 'cosmic';
export type Motion =
  | 'thrust' | 'wing' | 'electric' | 'wave' | 'orbit' | 'slash'
  | 'shards' | 'radial' | 'flame' | 'pulse' | 'splash' | 'vortex'
  | 'impact' | 'ballistic' | 'petal' | 'arc' | 'split' | 'rain'
  | 'tornado' | 'downpour' | 'wildfire' | 'projectile' | 'fracture'
  | 'boxing' | 'whip' | 'melody' | 'groove' | 'fireworks'
  | 'singularity' | 'drum';

export type PhysicalProfile = {
  family: EffectFamily;
  shape: Shape;
  particle: Shape;
  motion: Motion;
  duration: number;
  gravity: number;
  drag: number;
  spin: number;
  spread: number;
  travel: number;
  lift: number;
  energy: number;
};

const BASE: PhysicalProfile = {
  family: 'impact', shape: 'sphere', particle: 'sphere', motion: 'radial',
  duration: DEFAULT_EFFECT_DURATION_MS, gravity: -0.05, drag: 0.985, spin: 1.2,
  spread: 1, travel: 0.8, lift: 0.2, energy: 1,
};

function profile(family: EffectFamily, motion: Motion, overrides: Partial<PhysicalProfile> = {}): PhysicalProfile {
  return { ...BASE, family, motion, ...overrides };
}

// Exhaustive by design: a schema preset cannot reach WebGL without a family.
const PROFILES: Record<EffectPresetId, PhysicalProfile> = {
  jet: profile('cosmic', 'thrust', { shape: 'cone', gravity: 0.01, drag: 0.988, spread: 0.72, travel: 1.4, lift: 1.5, energy: 1.2 }),
  rise: profile('cosmic', 'wing', { shape: 'octa', particle: 'tetra', spin: 2.6, spread: 1.15, lift: 1.35, energy: 1.2 }),
  bolt: profile('natural', 'electric', { shape: 'octa', particle: 'tetra', gravity: 0, drag: 0.962, spin: 4, spread: 1.2, travel: 1.2, energy: 1.4 }),
  wave: profile('natural', 'wave', { shape: 'ring', gravity: 0, drag: 0.992, spread: 1.25, travel: 1.15, lift: 0, energy: 1.05 }),
  orbit: profile('cosmic', 'orbit', { shape: 'ring', gravity: 0, drag: 0.996, spin: 3.2, spread: 1.05, travel: 0.35, lift: 0, energy: 1.1 }),
  dash: profile('weapon', 'slash', { shape: 'box', particle: 'box', gravity: -0.01, drag: 0.978, spin: 0.8, spread: 0.58, travel: 1.9, lift: 0, energy: 1.3 }),
  shatter: profile('weapon', 'shards', { shape: 'tetra', particle: 'tetra', gravity: -0.2, drag: 0.972, spin: 2.8, spread: 1.35, travel: 0.6, lift: 0.4, energy: 1.2 }),
  burst: profile('impact', 'radial', { shape: 'octa', gravity: 0.015, drag: 0.986, spin: 1.8, spread: 1.45, travel: 0.45, lift: 0.35, energy: 1.15 }),
  'flame-rise': profile('natural', 'flame', { shape: 'cone', gravity: 0.035, drag: 0.982, spin: 1.7, spread: 0.95, travel: 0.5, lift: 1.7, energy: 1.3 }),
  'shatter-ice': profile('weapon', 'shards', { shape: 'octa', particle: 'octa', gravity: -0.16, drag: 0.98, spin: 3.2, spread: 1.4, travel: 0.7, lift: 0.5, energy: 1.2 }),
  'shock-ring': profile('impact', 'pulse', { shape: 'ring', particle: 'ring', gravity: 0, drag: 0.992, spin: 2.2, spread: 1.55, travel: 0.3, lift: 0, energy: 1.35 }),
  'water-splash': profile('natural', 'splash', { gravity: -0.24, drag: 0.986, spin: 1.7, spread: 1.45, travel: 0.5, lift: 1.45, energy: 1.2 }),
  whirl: profile('natural', 'vortex', { shape: 'ring', gravity: 0.015, drag: 0.992, spin: 3.7, spread: 1.3, travel: 0.3, lift: 0.85, energy: 1.05 }),
  'star-burst': profile('cosmic', 'radial', { shape: 'octa', particle: 'octa', gravity: -0.015, drag: 0.989, spin: 2.7, spread: 1.3, travel: 0.45, lift: 0.2, energy: 1.2 }),
  impact: profile('impact', 'impact', { shape: 'box', particle: 'tetra', gravity: -0.22, drag: 0.968, spin: 3.1, spread: 1.42, travel: 0.45, lift: 0.2, energy: 1.5 }),
  comet: profile('cosmic', 'ballistic', { gravity: -0.07, drag: 0.991, spin: 1.2, spread: 0.9, travel: 1.55, lift: 0.65, energy: 1.2 }),
  'trail-burst': profile('cosmic', 'ballistic', { shape: 'cone', particle: 'box', gravity: -0.04, drag: 0.987, spin: 1.9, spread: 0.85, travel: 1.5, lift: 0.5, energy: 1.25 }),
  pulse: profile('rhythm', 'pulse', { shape: 'ring', gravity: 0, drag: 0.993, spread: 1.25, travel: 0.2, lift: 0, energy: 1.15 }),
  ring: profile('rhythm', 'pulse', { shape: 'ring', particle: 'ring', gravity: 0, drag: 0.992, spin: 1.6, spread: 1.35, travel: 0.25, lift: 0, energy: 1.1 }),
  petal: profile('natural', 'petal', { shape: 'tetra', particle: 'tetra', gravity: -0.07, drag: 0.992, spin: 1.4, spread: 1.15, travel: 0.35, lift: 0.65, energy: 1 }),
  echo: profile('rhythm', 'pulse', { shape: 'ring', gravity: 0, drag: 0.996, spin: 1.2, spread: 1, travel: 0.55, lift: 0, energy: 0.95 }),
  arc: profile('cosmic', 'arc', { shape: 'ring', particle: 'box', gravity: -0.025, drag: 0.982, spin: 3, spread: 1.05, travel: 1.2, lift: 0.5, energy: 1.2 }),
  spiral: profile('cosmic', 'vortex', { shape: 'ring', gravity: 0.01, drag: 0.992, spin: 4, spread: 1.25, travel: 0.75, lift: 0.65, energy: 1.1 }),
  split: profile('weapon', 'split', { shape: 'octa', particle: 'tetra', gravity: -0.03, drag: 0.983, spin: 2.2, spread: 1.4, travel: 1, lift: 0.25, energy: 1.15 }),
  chain: profile('weapon', 'wave', { shape: 'ring', particle: 'box', gravity: -0.035, drag: 0.984, spin: 2.3, spread: 1.05, travel: 0.85, lift: 0.25, energy: 1.1 }),
  glow: profile('cosmic', 'pulse', { gravity: 0, drag: 0.996, spin: 0.8, spread: 1.2, travel: 0.2, lift: 0, energy: 1.35 }),
  twinkle: profile('cosmic', 'radial', { shape: 'octa', particle: 'octa', gravity: -0.02, drag: 0.991, spin: 3.5, spread: 1.1, travel: 0.3, lift: 0.25, energy: 1.1 }),
  vortex: profile('natural', 'vortex', { shape: 'ring', gravity: 0.01, drag: 0.994, spin: 4.2, spread: 1.5, travel: 0.2, lift: 0.55, energy: 1.1 }),
  rain: profile('natural', 'rain', { particle: 'box', gravity: -0.2, drag: 0.996, spin: 0.25, spread: 1.15, travel: 0.85, lift: 0, energy: 0.95 }),
  explode: profile('impact', 'impact', { particle: 'tetra', gravity: -0.13, drag: 0.976, spin: 2.1, spread: 1.55, travel: 0.75, lift: 0.45, energy: 1.5 }),
  tornado: profile('natural', 'tornado', { shape: 'ring', particle: 'box', duration: effectDurationFor('tornado'), gravity: 0.01, drag: 0.995, spin: 5.4, spread: 1.6, lift: 1.25, energy: 1.25 }),
  downpour: profile('natural', 'downpour', { particle: 'box', duration: effectDurationFor('downpour'), gravity: -0.28, drag: 0.998, spin: 0.15, spread: 1.7, travel: 1.35, lift: 0, energy: 1.15 }),
  wildfire: profile('natural', 'wildfire', { shape: 'cone', particle: 'cone', duration: effectDurationFor('wildfire'), gravity: 0.025, drag: 0.987, spin: 2.5, spread: 1.5, lift: 1.9, energy: 1.55 }),
  gunshot: profile('weapon', 'projectile', { shape: 'cone', particle: 'box', duration: effectDurationFor('gunshot'), gravity: -0.005, drag: 0.996, spin: 0.4, spread: 0.32, travel: 2.2, lift: 0, energy: 1.65 }),
  'glass-break': profile('weapon', 'fracture', { shape: 'tetra', particle: 'tetra', duration: effectDurationFor('glass-break'), gravity: -0.22, drag: 0.981, spin: 4.4, spread: 1.85, travel: 0.25, lift: 0.15, energy: 1.45 }),
  boxing: profile('impact', 'boxing', { shape: 'sphere', particle: 'box', duration: effectDurationFor('boxing'), gravity: -0.09, drag: 0.965, spin: 1.3, spread: 1.5, travel: 1.1, lift: 0, energy: 1.7 }),
  'whip-crack': profile('weapon', 'whip', { shape: 'ring', particle: 'box', duration: effectDurationFor('whip-crack'), gravity: -0.04, drag: 0.988, spin: 2.8, spread: 0.8, travel: 1.75, lift: 0.35, energy: 1.45 }),
  'note-dance': profile('rhythm', 'melody', { shape: 'sphere', particle: 'ring', duration: effectDurationFor('note-dance'), gravity: -0.04, drag: 0.994, spin: 2.1, spread: 1.25, travel: 0.75, lift: 1.05, energy: 1.2 }),
  groove: profile('rhythm', 'groove', { shape: 'ring', particle: 'ring', duration: effectDurationFor('groove'), gravity: 0, drag: 0.997, spin: 5.2, spread: 1.3, travel: 0.15, lift: 0, energy: 1.35 }),
  fireworks: profile('cosmic', 'fireworks', { shape: 'octa', particle: 'sphere', duration: effectDurationFor('fireworks'), gravity: -0.08, drag: 0.991, spin: 2.6, spread: 1.9, travel: 1.4, lift: 1.45, energy: 1.6 }),
  singularity: profile('cosmic', 'singularity', { shape: 'ring', particle: 'sphere', duration: effectDurationFor('singularity'), gravity: 0, drag: 0.998, spin: 6.2, spread: 2, travel: 0.08, lift: 0, energy: 1.7 }),
  'drum-beat': profile('rhythm', 'drum', { shape: 'ring', particle: 'ring', duration: effectDurationFor('drum-beat'), gravity: -0.03, drag: 0.989, spin: 1.1, spread: 1.65, travel: 0.1, lift: 0, energy: 1.55 }),
};

export function profileFor(id: EffectPresetId): PhysicalProfile { return PROFILES[id]; }

export function geometry(shape: Shape, size: number): THREE.BufferGeometry {
  switch (shape) {
    case 'tetra': return new THREE.TetrahedronGeometry(size, 0);
    case 'octa': return new THREE.OctahedronGeometry(size, 0);
    case 'box': return new THREE.BoxGeometry(size, size, size * 0.45);
    case 'ring': return new THREE.TorusGeometry(size * 0.72, Math.max(1, size * 0.1), 10, 36);
    case 'cone': return new THREE.ConeGeometry(size * 0.65, size * 1.6, 12);
    default: return new THREE.SphereGeometry(size, 12, 8);
  }
}
