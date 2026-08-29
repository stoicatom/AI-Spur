/**
 * 场景 08 skull 的 ③ 幽魂拖影：由鬼火实测轨迹拖出的 3 层 ghost。
 *
 * 规格互动①要求「鬼火从眼窝喷出后拖出幽魂」。这里的耦合是真的：
 * 每帧把两簇鬼火的**实际位置**推入环形历史，幽魂各层读取不同延迟的历史帧。
 * 幽魂因此没有自己的运动曲线——鬼火不动它就不动，鬼火被挪走它下一帧就跟过去。
 * 若改成独立的时间曲线，视觉上也能"像"拖影，但互动就成了摆设。
 */
import * as THREE from 'three';
import { additiveMaterial, type SceneResources } from '../cg-scene-kit';

/** ghost 层数，规格「半透明 ghost 层×3」的定数，不随档位缩减。 */
export const WRAITH_LAYERS = 3;

/** 每层之间的历史延迟帧数：拖影靠采样过去帧而非空间偏移，才会跟着火头拐弯。 */
export const WRAITH_LAG_FRAMES = 6;

/** 历史环形缓冲长度：够覆盖最尾层的延迟。 */
const HISTORY_LEN = WRAITH_LAYERS * WRAITH_LAG_FRAMES + 2;

export interface WraithTrail {
  readonly group: THREE.Group;
  /** 由头到尾的 ghost 层（veils[0] 最贴近火头）。 */
  readonly veils: readonly THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[];
  /**
   * 推入本帧鬼火实测位置并刷新各层。
   *
   * @param wisps 两簇鬼火的当前局部位置（调用方在鬼火更新之后调用）
   * @param intensity 幽魂显影强度（0 时整层隐去）
   */
  follow(wisps: readonly THREE.Vector3[], intensity: number): void;
}

/**
 * 建立幽魂拖影。
 *
 * @param res 场景资源容器
 * @param scale 幽魂尺度参考（像素）
 */
export function createWraithTrail(res: SceneResources, scale: number): WraithTrail {
  const group = new THREE.Group();
  group.name = 'wraith-trail';
  group.position.z = 14;
  res.group.add(group);

  const geometry = res.track(new THREE.PlaneGeometry(scale * 0.9, scale * 1.9));
  const veils: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];
  for (let i = 0; i < WRAITH_LAYERS; i += 1) {
    // 每层独立材质：三层要有各自的透明度梯度，共用一份就叠不出拖影。
    const material = res.track(additiveMaterial('#8FF3D2'));
    const veil = new THREE.Mesh(geometry, material);
    veil.name = `wraith-veil-${i}`;
    group.add(veil);
    veils.push(veil);
  }

  // 历史缓冲：存两簇鬼火的中点，幽魂是「从两个眼窝一起被拖出来的一团」。
  const history: THREE.Vector3[] = [];
  for (let i = 0; i < HISTORY_LEN; i += 1) history.push(new THREE.Vector3());
  let head = 0;
  let filled = 0;

  const mid = new THREE.Vector3();

  return {
    group,
    veils,

    follow(wisps: readonly THREE.Vector3[], intensity: number): void {
      if (wisps.length === 0) return;
      mid.set(0, 0, 0);
      for (const w of wisps) mid.add(w);
      mid.divideScalar(wisps.length);

      head = (head + 1) % HISTORY_LEN;
      history[head].copy(mid);
      filled = Math.min(filled + 1, HISTORY_LEN);

      for (let i = 0; i < veils.length; i += 1) {
        const veil = veils[i];
        // 尚无足够历史时全部贴在最新帧：起步瞬间不该出现悬在原点的空壳。
        const lag = Math.min(i * WRAITH_LAG_FRAMES, filled - 1);
        const sample = history[(head - lag + HISTORY_LEN * 2) % HISTORY_LEN];
        veil.position.copy(sample);
        // 越靠后的层越淡越大：拖影的衰减梯度。
        const fade = 1 - i / veils.length;
        veil.material.opacity = intensity * fade * 0.42;
        veil.scale.setScalar(1 + i * 0.26);
      }
    },
  };
}
