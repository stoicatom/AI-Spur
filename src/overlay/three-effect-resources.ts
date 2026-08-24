import * as THREE from 'three';

export function disposeTextureOnce(texture: THREE.Texture | null, disposed: WeakSet<THREE.Texture>): void {
  if (texture && !disposed.has(texture)) { disposed.add(texture); texture.dispose(); }
}

/** Releases a stage as a graph: family layers intentionally share some resources. */
export function disposeSceneResources(
  root: THREE.Object3D, extraTexture: THREE.Texture | null, disposedTextures: WeakSet<THREE.Texture>,
): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse((object) => {
    const node = object as THREE.Object3D & { geometry?: THREE.BufferGeometry; material?: THREE.Material | THREE.Material[] };
    if (node.geometry) geometries.add(node.geometry);
    if (Array.isArray(node.material)) node.material.forEach((material) => materials.add(material));
    else if (node.material) materials.add(node.material);
  });
  for (const material of materials) {
    Object.values(material as unknown as Record<string, unknown>).forEach((value) => collectTexture(value, textures));
    Object.values((material as THREE.ShaderMaterial).uniforms ?? {}).forEach((uniform) => collectTexture(uniform.value, textures));
    material.dispose();
  }
  geometries.forEach((geometry) => geometry.dispose());
  textures.forEach((texture) => disposeTextureOnce(texture, disposedTextures));
  disposeTextureOnce(extraTexture, disposedTextures);
}

function collectTexture(value: unknown, target: Set<THREE.Texture>): void {
  if (Array.isArray(value)) { value.forEach((entry) => collectTexture(entry, target)); return; }
  if (value && typeof value === 'object' && (value as THREE.Texture).isTexture) target.add(value as THREE.Texture);
}
