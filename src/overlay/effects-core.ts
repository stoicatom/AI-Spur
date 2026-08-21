import type { EffectPresetId } from '../shared/material-packs';
import type { Particle, WhipVel } from './particles';

export interface SpriteFrame {
  dx: number;
  dy: number;
  scale: number;
  rot: number;
  alpha: number;
}

export interface EffectPreset {
  id: EffectPresetId;
  sprite: (t: number, vel: WhipVel, params: Record<string, number>) => SpriteFrame;
  emit: (cx: number, cy: number, vel: WhipVel, params: Record<string, number>) => Particle[];
}

export const TAU = Math.PI * 2;
export const rand = (lo: number, hi: number): number => lo + Math.random() * (hi - lo);

export function num(params: Record<string, number>, key: string, fallback: number): number {
  const value = params[key];
  return value === undefined || Number.isNaN(value) ? fallback : value;
}

export const ease = {
  outCubic: (t: number): number => 1 - Math.pow(1 - t, 3),
  inCubic: (t: number): number => t * t * t,
  outQuart: (t: number): number => 1 - Math.pow(1 - t, 4),
  outQuint: (t: number): number => 1 - Math.pow(1 - t, 5),
  inOutSine: (t: number): number => -(Math.cos(Math.PI * t) - 1) / 2,
  outBack: (t: number): number => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  outElastic: (t: number): number => {
    const c4 = (2 * Math.PI) / 3;
    return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },
};

export function layer(parts: Particle[][], cap = 115): Particle[] {
  return parts.flat().slice(0, cap);
}

export function velScale(vel: WhipVel): number {
  return 0.8 + Math.min(vel.speed, 6) * 0.12;
}

export const burstDir = (vel: WhipVel): number => vel.dir;

