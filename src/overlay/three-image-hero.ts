import * as THREE from 'three';
import type { SpriteFrame } from './effects-core';
import type { MaterialPhysics } from './three-effect-physics';

const HERO_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uEnergy;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 transformed = position;
    float wave = sin(uTime * 0.006 + position.x * 0.07 + position.y * 0.04);
    transformed.z += wave * uEnergy * 2.4;
    transformed.x += sin(uTime * 0.004 + position.y * 0.03) * uEnergy * 0.9;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
  }
`;

const HERO_FRAGMENT = /* glsl */ `
  uniform sampler2D map;
  uniform vec3 uTint;
  uniform float uProgress;
  uniform float uEnergy;
  uniform float uAlpha;
  varying vec2 vUv;
  void main() {
    vec4 texel = texture2D(map, vUv);
    float edge = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
    float rim = 1.0 - smoothstep(0.02, 0.18, edge);
    float pulse = 0.72 + 0.28 * sin(uProgress * 18.8496 + uEnergy * 2.0);
    float energy = rim * pulse * (0.55 + uEnergy * 0.28);
    vec3 rgb = texel.rgb * (0.18 + uEnergy * 0.18) + uTint * energy;
    float alpha = texel.a * (0.08 + energy * 0.88) * uAlpha;
    gl_FragColor = vec4(rgb, alpha);
  }
`;

export type ImageHeroLayers = {
  energy: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  echoNear: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  echoFar: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  pulse: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  objects: [
    THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>,
    THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>,
    THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>,
    THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>,
  ];
};

function additiveImageMaterial(texture: THREE.Texture, color: THREE.Color, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    map: texture,
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });
}

function placeHeroObject(
  object: THREE.Object3D,
  x: number,
  y: number,
  dx: number,
  dy: number,
  rotation: number,
): void {
  object.position.set(x + dx, y + dy, object.position.z);
  object.rotation.z = rotation;
}

/** Create the reusable image-derived depth/energy stack for one source texture. */
export function createImageHeroLayers(
  texture: THREE.Texture,
  size: number,
  color: THREE.Color,
  energy: number,
): ImageHeroLayers {
  texture.colorSpace = THREE.SRGBColorSpace;
  const tint = color.clone();
  const energyMaterial = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: texture },
      uTint: { value: tint },
      uTime: { value: 0 },
      uProgress: { value: 0 },
      uEnergy: { value: energy },
      uAlpha: { value: 1 },
    },
    vertexShader: HERO_VERTEX,
    fragmentShader: HERO_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });
  const energyLayer = new THREE.Mesh(new THREE.PlaneGeometry(size * 1.5, size * 1.5), energyMaterial);
  const nearColor = color.clone().multiplyScalar(0.72);
  const farColor = color.clone().multiplyScalar(0.46);
  const echoNear = new THREE.Mesh(
    new THREE.PlaneGeometry(size * 1.04, size * 1.04), additiveImageMaterial(texture, nearColor, 0.2),
  );
  const echoFar = new THREE.Mesh(
    new THREE.PlaneGeometry(size * 0.92, size * 0.92), additiveImageMaterial(texture, farColor, 0.12),
  );
  const pulse = new THREE.Mesh(
    new THREE.RingGeometry(size * 0.72, size * 0.78, 64),
    additiveImageMaterial(texture, color.clone().multiplyScalar(0.9), 0.18),
  );
  energyLayer.name = 'image-hero-energy';
  echoNear.name = 'image-hero-echo-near';
  echoFar.name = 'image-hero-echo-far';
  pulse.name = 'image-hero-pulse';
  energyLayer.position.z = 37;
  echoNear.position.z = 35;
  echoFar.position.z = 33;
  pulse.position.z = 38;
  const objects = [energyLayer, echoNear, echoFar, pulse] as ImageHeroLayers['objects'];
  return { energy: energyLayer, echoNear, echoFar, pulse, objects };
}

/** Update the stack from the same physical frame used by the core source sprite. */
export function updateImageHeroLayers(
  layers: ImageHeroLayers,
  frame: SpriteFrame,
  progress: number,
  now: number,
  physics: MaterialPhysics,
  origin: THREE.Vector3,
  direction: THREE.Vector2,
): void {
  const x = origin.x + frame.dx;
  const y = origin.y - frame.dy;
  const rotation = -frame.rot;
  const pulse = 1 + Math.sin(now * 0.006 + physics.phase) * 0.08;
  const trail = (14 + physics.travel * 12) * frame.scale * (0.88 + physics.signature * 0.14);
  const fade = Math.max(0, Math.min(1, frame.alpha));

  placeHeroObject(layers.energy, x, y, 0, 0, rotation);
  layers.energy.rotation.z = rotation;
  layers.energy.scale.setScalar(frame.scale * (1.08 + physics.energy * 0.08) * pulse);
  layers.energy.material.uniforms.uTime.value = now;
  layers.energy.material.uniforms.uProgress.value = progress;
  layers.energy.material.uniforms.uEnergy.value = physics.energy;
  layers.energy.material.uniforms.uAlpha.value = fade;

  placeHeroObject(
    layers.echoNear,
    x,
    y,
    -direction.x * trail,
    -direction.y * trail,
    rotation + Math.sin(now * 0.004) * 0.06,
  );
  layers.echoNear.scale.setScalar(frame.scale * (0.9 + pulse * 0.06));
  layers.echoNear.material.opacity = fade * (0.16 + physics.energy * 0.035);

  placeHeroObject(
    layers.echoFar,
    x,
    y,
    -direction.x * trail * 1.9,
    -direction.y * trail * 1.9,
    rotation - Math.sin(now * 0.003) * 0.1,
  );
  layers.echoFar.scale.setScalar(frame.scale * (0.78 + pulse * 0.04));
  layers.echoFar.material.opacity = fade * (0.08 + physics.energy * 0.02);

  placeHeroObject(layers.pulse, x, y, 0, 0, rotation + progress * Math.PI * 0.7);
  layers.pulse.scale.setScalar(frame.scale * (1.02 + progress * 1.4) * pulse);
  layers.pulse.material.opacity = fade * (0.12 + Math.max(0, 1 - progress) * 0.18);
}
