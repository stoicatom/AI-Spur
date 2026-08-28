import * as THREE from 'three';
import {
  createImageHeroLayers,
  type ImageHeroLayers,
} from './three-image-hero';

export type ImageSpriteStack = {
  sprite: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  hero: ImageHeroLayers;
};

/** Build the source image and its image-derived cinematic depth stack together. */
export function createImageSpriteStack(
  texture: THREE.Texture,
  size: number,
  color: THREE.Color,
  energy: number,
): ImageSpriteStack {
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    color: 0xffffff,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const sprite = new THREE.Mesh(new THREE.PlaneGeometry(size, size), material);
  const hero = createImageHeroLayers(texture, size, color, energy);
  return { sprite, hero };
}
