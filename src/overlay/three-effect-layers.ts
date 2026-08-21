import * as THREE from 'three';
import type { PhysicalProfile } from './three-effect-profiles';
import { CosmicFamilyLayer } from './three-family-cosmic';
import { ImpactFamilyLayer } from './three-family-impact';
import { NaturalFamilyLayer } from './three-family-natural';
import { RhythmFamilyLayer } from './three-family-rhythm';
import { WeaponFamilyLayer } from './three-family-weapon';
import type { FamilyLayer } from './three-family-shared';

/** Dispatches every preset to a genuinely different physical stage family. */
export class CinematicLayers {
  private readonly layer: FamilyLayer;

  constructor(
    root: THREE.Group, origin: THREE.Vector3, color: THREE.Color, energy: number,
    profile: PhysicalProfile, direction = new THREE.Vector2(1, 0), width = 1, height = 1,
    params: Record<string, number> = {},
  ) {
    const context = { root, origin, color, energy, profile, direction, width, height, params };
    switch (profile.family) {
      case 'natural': this.layer = new NaturalFamilyLayer(context); break;
      case 'weapon': this.layer = new WeaponFamilyLayer(context); break;
      case 'rhythm': this.layer = new RhythmFamilyLayer(context); break;
      case 'cosmic': this.layer = new CosmicFamilyLayer(context); break;
      case 'impact': this.layer = new ImpactFamilyLayer(context); break;
    }
  }

  update(t: number, now: number, _profile?: PhysicalProfile): void {
    this.layer.update(t, now);
  }
}
