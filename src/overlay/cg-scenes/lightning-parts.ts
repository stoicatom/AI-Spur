/**
 * 场景 03 lightning 的元素搭建（规格 §4.2 场景 03 的八元素）。
 *
 * 与编排分离：本文件只负责「把元素立起来」，三幕动作在 cg-lightning.ts。
 * 拆分理由是 CLAUDE.md 的 250 行上限，也让元素清单能一眼对照规格。
 */
import * as THREE from 'three';
import type { CgStageContext } from '../cg-scene';
import {
  VOLUME_CLOUD_FRAGMENT,
  createAdditivePlaneMaterial,
  createBlendedPlaneMaterial,
} from '../cg-shaders';
import { POOL_FRAGMENT, RAIN_FRAGMENT } from './lightning-shaders';
import { additiveMaterial, createSceneResources, type SceneResources } from '../cg-scene-kit';
import { scaledCount } from '../cg-particle-kit';

/** 三相落雷的水平落点（屏宽比例），三相分散不重叠。 */
export const STRIKE_XS = [-0.22, 0.31, -0.04] as const;

export type RainBand = {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  /** 条带中心的 x（世界坐标），用于判断是否正对落雷点。 */
  x: number;
};

export type Bolt = {
  /** 主弧，测试按 bolt-main-<phase> 点名。 */
  main: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  /** 双分叉。 */
  forks: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[];
  /** 落雷光池。 */
  pool: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  /**
   * 落点溅起的雨滴环（规格互动③的后半句）。
   *
   * 与光池分开一个节点：涟漪是地面光扩散，雨滴是被砸起的水花，
   * 合到一个材质上就没法让水花比光池晚一点起、早一点落。
   */
  splash: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  /** 该相的落点 x（世界坐标）。 */
  strikeX: number;
};

export type LightningParts = {
  res: SceneResources;
  /** ① 雷暴乌云（全屏顶部 2/3）。 */
  cloud: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  /** ③ 云内暗闪。 */
  darkFlash: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  /** ② + ④ 三相电弧与各自的落雷光池。 */
  bolts: Bolt[];
  /** 供测试点名的电弧组容器（leader-bolt）。 */
  boltGroup: THREE.Group;
  /** ⑤ 雨幕。 */
  rain: RainBand[];
  /** ⑥ 余电游蛇。 */
  serpents: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[];
  /** ⑦ 雷声光暴（整屏脉冲）。 */
  blast: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  /** ⑧ 云缘电荷游灯。 */
  lamps: THREE.InstancedMesh;
};

/** 折线电弧几何：自云底向地面逐段抖动下行。 */
function boltGeometry(
  height: number,
  segments: number,
  jitter: number,
  seed: number,
): THREE.BufferGeometry {
  const points: THREE.Vector3[] = [];
  let x = 0;
  for (let i = 0; i <= segments; i += 1) {
    const k = i / segments;
    // 越靠地面偏移越大：先导在云底附近还算直，落地前甩开。
    x += (Math.sin(seed * 12.9 + i * 2.7) + Math.cos(seed * 7.3 + i * 1.3)) * jitter * (0.3 + k);
    points.push(new THREE.Vector3(x, height * (0.5 - k), 0));
  }
  const curve = new THREE.CatmullRomCurve3(points);
  return new THREE.TubeGeometry(curve, segments * 2, Math.max(1.6, height * 0.004), 6, false);
}

export function buildLightningParts(ctx: CgStageContext): LightningParts {
  const res = createSceneResources(ctx.root, new THREE.Vector3(), 'cg-lightning');
  const { width, height, color, quality } = ctx;
  const flashColor = new THREE.Color('#EAF0FF');

  // ① 乌云：顶部 2/3，横向超出屏宽保证边缘不露空。
  const cloudHeight = height * 0.72;
  const cloud = res.mesh(
    'storm-cloud',
    new THREE.PlaneGeometry(width * 1.25, cloudHeight),
    createBlendedPlaneMaterial({
      uniforms: {
        uColor: { value: new THREE.Color('#1B2036') },
        uFlashColor: { value: flashColor },
        uTime: { value: 0 },
        uDensity: { value: 0 },
        uFlash: { value: 0 },
      },
      fragmentShader: VOLUME_CLOUD_FRAGMENT,
    }),
  );
  // 云底落在屏幕中线略下，云顶抵到屏外：视觉上「压顶」。
  cloud.position.y = height * 0.5 - cloudHeight * 0.42;
  res.group.add(cloud);

  // ③ 云内暗闪：贴在云域的整片频闪。
  const darkFlash = res.mesh(
    'cloud-dark-flash',
    new THREE.PlaneGeometry(width * 1.25, cloudHeight * 0.8),
    additiveMaterial(flashColor, 0),
  );
  darkFlash.position.y = cloud.position.y;
  res.group.add(darkFlash);

  // ② + ④ 三相电弧：每相一根主弧 + 两条分叉 + 一个落雷光池。
  const boltGroup = new THREE.Group();
  boltGroup.name = 'leader-bolt';
  res.group.add(boltGroup);

  const boltSpan = height * 0.96;
  const bolts: Bolt[] = STRIKE_XS.map((ratio, phase) => {
    const strikeX = width * ratio;
    const main = res.mesh(
      `bolt-main-${phase}`,
      boltGeometry(boltSpan, 14, width * 0.012, phase + 1),
      additiveMaterial('#EEF3FF', 0),
    );
    main.position.x = strikeX;
    boltGroup.add(main);

    const forks = [0, 1].map((f) => {
      const fork = res.mesh(
        `bolt-fork-${phase}-${f}`,
        boltGeometry(boltSpan * 0.42, 8, width * 0.016, phase * 3 + f + 5),
        additiveMaterial(color, 0),
      );
      fork.position.set(strikeX + (f ? 1 : -1) * width * 0.03, -height * 0.12, 0);
      boltGroup.add(fork);
      return fork;
    });

    // 光池直径覆盖全屏半径（测试要求 > min(width,height)）。
    const poolSize = Math.min(width, height) * 1.45;
    const pool = res.mesh(
      `strike-pool-${phase}`,
      new THREE.PlaneGeometry(poolSize, poolSize * 0.32),
      createAdditivePlaneMaterial({
        uniforms: {
          uColor: { value: flashColor.clone() },
          uAlpha: { value: 0 },
          uRipple: { value: 0 },
        },
        fragmentShader: POOL_FRAGMENT,
      }),
    );
    pool.position.set(strikeX, -height * 0.46, 0);
    res.group.add(pool);

    // 溅起的雨滴：贴地一圈水花环，运行期靠缩放外推、透明度收尾。
    const splashR = Math.min(width, height) * 0.16;
    const splash = res.mesh(
      `rain-splash-${phase}`,
      new THREE.RingGeometry(splashR * 0.35, splashR, 24, 1),
      additiveMaterial('#BFD4FF', 0),
    );
    splash.position.set(strikeX, -height * 0.44, 0);
    splash.scale.setScalar(0.4);
    res.group.add(splash);

    return { main, forks, pool, splash, strikeX };
  });

  // ⑤ 雨幕：斜向条带，档位控制条数。整幕是一个元素，
  // 所以条带挂在自己的容器下，与 leader-bolt 同一模式。
  const rainCurtain = new THREE.Group();
  rainCurtain.name = 'rain-curtain';
  res.group.add(rainCurtain);

  const rainCount = scaledCount(22, quality);
  const rain: RainBand[] = [];
  for (let i = 0; i < rainCount; i += 1) {
    const x = (i / Math.max(1, rainCount - 1) - 0.5) * width * 1.1;
    const band = res.mesh(
      `rain-band-${i}`,
      new THREE.PlaneGeometry(width * 0.035, height * 1.2),
      createAdditivePlaneMaterial({
        uniforms: {
          uColor: { value: new THREE.Color('#8FA8D8') },
          uBright: { value: 0 },
          uAlpha: { value: 0 },
        },
        fragmentShader: RAIN_FRAGMENT,
      }),
    );
    band.position.x = x;
    band.rotation.z = 0.14;
    rainCurtain.add(band);
    rain.push({ mesh: band, x });
  }

  // ⑥ 余电游蛇：贴屏缘游走的细弧，同样归入自己的元素容器。
  const serpentGroup = new THREE.Group();
  serpentGroup.name = 'residual-serpent';
  res.group.add(serpentGroup);

  const serpents = [0, 1, 2].map((i) => {
    const serpent = res.mesh(
      `serpent-${i}`,
      boltGeometry(height * 0.5, 10, width * 0.02, i + 21),
      additiveMaterial(color, 0),
    );
    serpent.rotation.z = Math.PI * (0.5 + i * 0.11);
    serpentGroup.add(serpent);
    return serpent;
  });

  // ⑦ 雷声光暴：整屏白光。
  const blast = res.mesh(
    'thunder-blast',
    new THREE.PlaneGeometry(width * 1.4, height * 1.4),
    additiveMaterial('#FFFFFF', 0),
  );
  res.group.add(blast);

  // ⑧ 云缘电荷游灯：instanced 小球沿云底排布。
  const lampCount = scaledCount(34, quality);
  const lamps = new THREE.InstancedMesh(
    res.track(new THREE.SphereGeometry(Math.max(1.5, width * 0.0022), 6, 6)),
    res.track(additiveMaterial(flashColor, 0.9)),
    lampCount,
  );
  lamps.name = 'charge-lamps';
  res.group.add(lamps);

  return { res, cloud, darkFlash, bolts, boltGroup, rain, serpents, blast, lamps };
}
