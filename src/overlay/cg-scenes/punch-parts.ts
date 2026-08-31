/**
 * 场景 36 boxing-glove 的元素搭建。
 *
 * 命名规则：不同性质的节点前缀互不包含（`ringlayer-N` 压缩环 /
 * `ghostlayer-N` 残影 / `sweat-anchor` 汗滴锚点），避免前缀匹配的断言
 * 测错对象（本项目曾因 `spark-` 与 `sparkle-` 撞车让物理断言测到贴片）。
 *
 * 拳路方向固定为屏幕 +x（自左向右出拳），所有沿拳路的位移都乘
 * `punchAxis` 得到，不各写一遍角度——写两遍就会悄悄错开。
 */
import * as THREE from 'three';
import type { CgStageContext } from '../cg-scene';
import { createSceneResources, type SceneResources } from '../cg-scene-kit';
import { createAdditivePlaneMaterial, createBlendedPlaneMaterial } from '../cg-shaders';
import { RING_COUNT } from './punch-impact';
import { GHOST_COUNT } from './punch-recoil';
import {
  COMPRESSION_RING_FRAGMENT, GLOVE_FRAGMENT, HIT_FLASH_FRAGMENT, SANDBAG_FRAGMENT,
} from './punch-shaders';

type ShaderMesh = THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;

export type PunchParts = {
  readonly res: SceneResources;
  /** 震屏容器：整个场景挂在它下面，位移施加在这一层。 */
  readonly shakeRig: THREE.Group;
  /** ① 拳套 mesh。 */
  readonly glove: ShaderMesh;
  /** ② 压缩环（多层）。 */
  readonly rings: ShaderMesh[];
  /** ③ 命中白闪。 */
  readonly flash: ShaderMesh;
  /** ④ 拳路残影。 */
  readonly ghosts: ShaderMesh[];
  /** ⑧ 沙袋虚影容器（摆角施加在它上面）与本体。 */
  readonly bagPivot: THREE.Group;
  readonly bag: ShaderMesh;
  /** 起手位与命中面的屏幕 x（像素）。 */
  readonly startX: number;
  readonly impactX: number;
  /** 屏心到最远角的距离：压缩环全屏覆盖的尺度。 */
  readonly reach: number;
  readonly short: number;
  /** 拳套尺寸（像素）。 */
  readonly gloveR: number;
};

/** 起手位在屏幕左侧的占比（负向偏离屏心）。 */
const START_FRAC = -0.34;
/** 命中面在屏幕的占比：略偏右于屏心，留出过冲空间。 */
const IMPACT_FRAC = 0.06;

/** 建 boxing-glove 场景的全部渲染件（汗滴粒子层在 ./punch-sweat）。 */
export function buildPunchParts(ctx: CgStageContext): PunchParts {
  const { width, height, color } = ctx;
  const res = createSceneResources(ctx.root, ctx.origin, 'punch-scene');
  const short = Math.min(width, height);
  const reach = Math.hypot(width, height) * 0.5;
  const gloveR = short * 0.19;
  const startX = width * START_FRAC;
  const impactX = width * IMPACT_FRAC;

  // 皮革红：素材色往拳套红推；缝线与白闪偏亮。
  const leather = color.clone().lerp(new THREE.Color('#D8281E'), 0.66);
  const seamColor = color.clone().lerp(new THREE.Color('#FFF0E2'), 0.72);
  const airColor = new THREE.Color('#CFE4FF');
  const bagColor = color.clone().lerp(new THREE.Color('#4A4238'), 0.7);

  // 震屏容器：命中后整场画面位移都加在这一层，各元素自身位置不受污染。
  const shakeRig = new THREE.Group();
  shakeRig.name = 'shake-rig';
  res.group.add(shakeRig);

  // ⑧ 沙袋虚影：远端垫底，绕顶端吊点摆动。吊点在袋体上方，
  // 所以摆角作用在 pivot 上而非袋体自身——袋子是吊着的，不是原地转。
  const bagPivot = new THREE.Group();
  bagPivot.name = 'bag-pivot';
  bagPivot.position.set(width * 0.33, height * 0.3, -20);
  shakeRig.add(bagPivot);
  const bagH = short * 0.46;
  const bag = res.mesh(
    'sandbag-phantom',
    new THREE.PlaneGeometry(short * 0.17, bagH),
    createBlendedPlaneMaterial({
      fragmentShader: SANDBAG_FRAGMENT,
      uniforms: { uColor: { value: bagColor }, uAlpha: { value: 0.5 } },
    }),
  );
  // 袋心挂在吊点下方半个袋长处，pivot 转动即整袋摆动。
  bag.position.set(0, -bagH * 0.5, 0);
  bagPivot.add(bag);

  // ② 压缩环：全屏尺度贴片，半径由 uniform 驱动（几何体不缩放，
  // 避免缩放几何体时环带宽度跟着变形）。
  const rings: ShaderMesh[] = [];
  for (let i = 0; i < RING_COUNT; i += 1) {
    const mesh = res.mesh(
      `ringlayer-${i}`,
      new THREE.PlaneGeometry(reach * 2.2, reach * 2.2),
      createAdditivePlaneMaterial({
        fragmentShader: COMPRESSION_RING_FRAGMENT,
        uniforms: {
          uColor: { value: airColor },
          uAlpha: { value: 0 },
          uRadius: { value: 0 },
          // 后生的环更薄：介质越稀，压出的层越单薄。
          uThickness: { value: 0.062 - i * 0.009 },
        },
      }),
    );
    mesh.position.set(impactX, 0, -12 + i);
    shakeRig.add(mesh);
    rings.push(mesh);
  }

  // ④ 拳路残影：与拳套同尺寸同 shader，靠 uAlpha 与位置区分。
  const ghosts: ShaderMesh[] = [];
  for (let i = 0; i < GHOST_COUNT; i += 1) {
    const mesh = res.mesh(
      `ghostlayer-${i}`,
      new THREE.PlaneGeometry(gloveR * 2, gloveR * 2),
      createAdditivePlaneMaterial({
        fragmentShader: GLOVE_FRAGMENT,
        uniforms: {
          uColor: { value: leather },
          uRimColor: { value: seamColor },
          uAlpha: { value: 0 },
          uSquash: { value: 1 },
          uFlash: { value: 0 },
        },
      }),
    );
    mesh.position.set(startX, 0, -8 + i * 0.1);
    shakeRig.add(mesh);
    ghosts.push(mesh);
  }

  // ① 拳套 mesh：压在残影之上。
  const glove = res.mesh(
    'glove-body',
    new THREE.PlaneGeometry(gloveR * 2, gloveR * 2),
    createBlendedPlaneMaterial({
      fragmentShader: GLOVE_FRAGMENT,
      uniforms: {
        uColor: { value: leather },
        uRimColor: { value: seamColor },
        uAlpha: { value: 1 },
        uSquash: { value: 1 },
        uFlash: { value: 0 },
      },
    }),
  );
  glove.position.set(startX, 0, -2);
  shakeRig.add(glove);

  // ③ 命中白闪：叠在最前，位置随拳面走。
  const flash = res.mesh(
    'hit-flash',
    new THREE.PlaneGeometry(gloveR * 3.4, gloveR * 3.4),
    createAdditivePlaneMaterial({
      fragmentShader: HIT_FLASH_FRAGMENT,
      uniforms: { uColor: { value: seamColor }, uLevel: { value: 0 } },
    }),
  );
  flash.position.set(impactX, 0, -1);
  shakeRig.add(flash);

  return {
    res, shakeRig, glove, rings, flash, ghosts, bagPivot, bag,
    startX, impactX, reach, short, gloveR,
  };
}
