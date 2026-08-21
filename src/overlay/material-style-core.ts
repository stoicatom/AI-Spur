import type { Particle, WhipVel } from './particles';

export const TAU = Math.PI * 2;

export const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

export type CrackStyle = {
  hue: number;
  sprite: (t: number, vel: WhipVel) => { dx: number; dy: number; scale: number; rot: number; alpha: number };
  emit: (cx: number, cy: number, vel: WhipVel) => Particle[];
};

export type CrackStyleFactory = () => CrackStyle;
