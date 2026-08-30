/**
 * 场景 25 shield 的元素搭建。
 *
 * 命名规则：不同性质的节点前缀互不包含（`wavearc-N` 弧波 /
 * `dustgrain-N` 震尘 / `sparkanchor-N` 火花锚点），避免前缀匹配的断言
 * 测错对象（本项目曾因 `spark-` 与 `sparkle-` 撞车让物理断言测到贴片）。
 */
import * as THREE from 'three';
import type { CgStageContext } from '../cg-scene';
import { createSceneResources, type SceneResources } from '../cg-scene-kit';
import { createAdditivePlaneMaterial, createBlendedPlaneMaterial } from '../cg-shaders';
import {
  ARC_HALF_ANGLE, IMPACT_OFFSET, SHIELD_FACE_ANGLE, angleOf, strikeDeflected, toScreen,
} from './shield-deflect';
import { WAVE_COUNT } from './shield-timeline';
import {
  SHIELD_BACKLIGHT_FRAGMENT, SHIELD_BODY_FRAGMENT, SHIELD_CRACK_FRAGMENT,
  SHIELD_STRIKE_FRAGMENT, SHIELD_WAVE_FRAGMENT,
} from './shield-shaders';

type ShaderMesh = THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;

export type ShieldParts = {
  readonly res: SceneResources;
  /** ① 盾 mesh（圆盾+金属纹）。 */
  readonly body: ShaderMesh;
  /** ② 来击虚影（高速菱形幻影）。 */
  readonly strike: ShaderMesh;
  /** ③ 盾面冲击波：多道弧，开口朝弹开方向。 */
  readonly waves: ShaderMesh[];
  /** ⑤ 盾面战损闪（裂纹闪白）。 */
  readonly crack: ShaderMesh;
  /** ⑥ 格挡环（环形屏障）。 */
  readonly barrier: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  /** ⑧ 背光剪影（逆光轮廓）。 */
  readonly backlight: ShaderMesh;
  /** 盾半径（像素）与屏心到最远缘的距离。 */
  readonly shieldR: number;
  readonly reach: number;
  readonly groundY: number;
  readonly short: number;
  /** 撞击点在屏幕坐标系的位置（盾面局部）。 */
  readonly hitPoint: THREE.Vector2;
  /** 弹开方向的屏幕角（弧度）：③ 弧波的开口朝向。 */
  readonly deflectScreenAngle: number;
};

/** 撞击点在盾面上的极坐标半径占比：偏心命中，不在盾心。 */
const HIT_RADIUS_FRAC = 0.46;

/** 建 shield 场景的全部渲染件（震尘刚体层在 ./shield-dust）。 */
export function buildShieldParts(ctx: CgStageContext): ShieldParts {
  const { width, height, color } = ctx;
  const res = createSceneResources(ctx.root, ctx.origin, 'shield-scene');
  const short = Math.min(width, height);
  const shieldR = short * 0.28;
  const reach = Math.hypot(width, height) * 0.5;
  const groundY = -height * 0.42;

  // 金属色：素材色往冷钢推；盾缘与格挡环偏亮（受光的金属唇）。
  const steel = color.clone().lerp(new THREE.Color('#7E8899'), 0.62);
  const rimColor = color.clone().lerp(new THREE.Color('#E8F0FF'), 0.6);
  const sparkColor = new THREE.Color('#FFD27A');

  // 撞击点：盾面局部坐标（先在盾面坐标系里定，再转屏幕）。
  // 弧面位置 s = IMPACT_OFFSET → 法线角 = s·ARC_HALF_ANGLE，
  // 撞击点沿该法线方向落在盾面上，所以"撞击点"与"该点法线"同源。
  const hitLocalAngle = IMPACT_OFFSET * ARC_HALF_ANGLE;
  const hitScreen = toScreen(
    { x: Math.cos(hitLocalAngle), y: Math.sin(hitLocalAngle) },
    SHIELD_FACE_ANGLE,
  );
  const hitPoint = new THREE.Vector2(
    hitScreen.x * shieldR * HIT_RADIUS_FRAC,
    hitScreen.y * shieldR * HIT_RADIUS_FRAC,
  );
  // 弹开方向：签名函数给出盾面坐标系的出射向量，再转到屏幕。
  const deflectScreenAngle = angleOf(toScreen(strikeDeflected(), SHIELD_FACE_ANGLE));
  // 盾面 shader 的 uHitAngle/uHitR 用的是盾局部单位圆坐标。
  const hitAngleUv = Math.atan2(hitScreen.y, hitScreen.x);

  // ⑧ 背光剪影：整幕垫底的逆光层，比盾大一圈。
  const backlight = res.mesh(
    'backlight-silhouette',
    new THREE.PlaneGeometry(shieldR * 4.2, shieldR * 4.2),
    createBlendedPlaneMaterial({
      fragmentShader: SHIELD_BACKLIGHT_FRAGMENT,
      uniforms: {
        uColor: { value: rimColor },
        uLevel: { value: 0 },
        // 盾半径换算到本贴片的单位圆尺度。
        uShieldR: { value: (shieldR * 2) / (shieldR * 4.2) * 2 },
      },
    }),
  );
  backlight.position.set(0, 0, -14);
  res.group.add(backlight);

  // ③ 盾面冲击波：多道弧，开口全部朝弹开方向（弧波覆盖全屏）。
  const waves: ShaderMesh[] = [];
  for (let i = 0; i < WAVE_COUNT; i += 1) {
    const mesh = res.mesh(
      // `wavearc-N` 与 `dustgrain-N` / `sparkanchor-N` 互不含前缀。
      `wavearc-${i}`,
      new THREE.PlaneGeometry(reach * 2.1, reach * 2.1),
      createAdditivePlaneMaterial({
        fragmentShader: SHIELD_WAVE_FRAGMENT,
        uniforms: {
          uColor: { value: i === 0 ? rimColor : steel },
          uAlpha: { value: 0 },
          uRadius: { value: 0 },
          uThickness: { value: 0.055 + i * 0.02 },
          uAimAngle: { value: deflectScreenAngle },
          // 后续道张角更大：波在传播中沿盾缘摊开。
          uSpanAngle: { value: 0.85 + i * 0.16 },
        },
      }),
    );
    // 弧波以撞击点为源：从盾缘扩出去，不是从屏心。
    mesh.position.set(hitPoint.x, hitPoint.y, -6 - i);
    res.group.add(mesh);
    waves.push(mesh);
  }

  // ① 盾 mesh：圆盘 + 金属纹。
  const body = res.mesh(
    'shield-body',
    new THREE.PlaneGeometry(shieldR * 2, shieldR * 2),
    createAdditivePlaneMaterial({
      fragmentShader: SHIELD_BODY_FRAGMENT,
      uniforms: {
        uColor: { value: steel },
        uRimColor: { value: rimColor },
        uAlpha: { value: 0.94 },
        uGlow: { value: 0 },
        uFlash: { value: 0 },
        uHitAngle: { value: hitAngleUv },
        uHitR: { value: HIT_RADIUS_FRAC },
      },
    }),
  );
  body.position.set(0, 0, -3);
  res.group.add(body);

  // ⑤ 盾面战损闪：裂纹从撞击点长出，与盾同尺寸同位。
  const crack = res.mesh(
    'crack-flash',
    new THREE.PlaneGeometry(shieldR * 2, shieldR * 2),
    createAdditivePlaneMaterial({
      fragmentShader: SHIELD_CRACK_FRAGMENT,
      uniforms: {
        uColor: { value: rimColor },
        uFlash: { value: 0 },
        uReveal: { value: 0 },
        uHitAngle: { value: hitAngleUv },
        uHitR: { value: HIT_RADIUS_FRAC },
      },
    }),
  );
  crack.position.set(0, 0, -2);
  res.group.add(crack);

  // ⑥ 格挡环：贴着盾缘的环形屏障。
  const ringGeometry = res.track(new THREE.RingGeometry(shieldR * 1.02, shieldR * 1.16, 96));
  const ringMaterial = res.track(new THREE.MeshBasicMaterial({
    color: rimColor,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
  }));
  const barrier = new THREE.Mesh(ringGeometry, ringMaterial);
  barrier.name = 'barrier-ring';
  barrier.position.set(0, 0, -4);
  res.group.add(barrier);

  // ② 来击虚影：从来路方向扑向盾，撞击后停在盾面。
  const strike = res.mesh(
    'strike-phantom',
    new THREE.PlaneGeometry(short * 0.3, short * 0.11),
    createAdditivePlaneMaterial({
      fragmentShader: SHIELD_STRIKE_FRAGMENT,
      uniforms: {
        uColor: { value: sparkColor },
        uAlpha: { value: 0 },
        uSmear: { value: 0 },
      },
    }),
  );
  strike.position.set(0, 0, -1);
  res.group.add(strike);

  return {
    res, body, strike, waves, crack, barrier, backlight,
    shieldR, reach, groundY, short, hitPoint, deflectScreenAngle,
  };
}
