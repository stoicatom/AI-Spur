/**
 * 场景 08 skull 实现验收（设计规格 §4.2 场景 08）。
 *
 * 断言按规格逐条对应：8 个元素齐备、三幕时间轴、全屏覆盖、
 * 两条多元素互动、独立签名（恐怖叙事 + 眼窝双光源）、骨屑刚体物理、资源释放。
 * 结构照标杆用例 cg-scene-bomb.test.ts。
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { resolveScene } from '../overlay/cg-scene-registry';
import '../overlay/cg-scenes';
import type { CgStage, CgStageContext } from '../overlay/cg-scene';
import { makeSceneCtx, names, node, opacity, box, visualSnapshot } from './cg-scene-harness';
import { debrisSettleY } from '../overlay/cg-scenes/skull-debris';
import { SKULL_RADIUS_RATIO } from '../overlay/cg-scenes/skull-parts';
import { WRAITH_LAG_FRAMES, WRAITH_LAYERS } from '../overlay/cg-scenes/skull-wraith';

/** 规格时长，三幕边界 250 / 750ms 都以它为分母。 */
const DURATION = 1200;
/** 三幕边界（归一化），与实现共用同一份规格数值。 */
const ACT1_END = 250 / DURATION;

function makeCtx(overrides: Partial<CgStageContext> = {}): CgStageContext {
  return makeSceneCtx({ color: new THREE.Color('#7FFFC4'), ...overrides });
}

function step(stage: CgStage, t: number): void {
  stage.update(t, t * DURATION, 'cinematic');
}

/** 以固定小步长推进到 t，让刚体积分出真实轨迹。 */
function runTo(stage: CgStage, t: number, frames = 72): void {
  for (let i = 1; i <= frames; i += 1) step(stage, (t * i) / frames);
}

/** 组内子节点的最大不透明度，用于判断「这一层是否活跃」。 */
function layerOpacity(o: THREE.Object3D): number {
  let peak = opacity(o);
  o.traverse((child) => { peak = Math.max(peak, opacity(child)); });
  return peak;
}

/** 按前缀收集节点；前缀必须能精确区分（骨屑刚体只认 bonebit-）。 */
function withPrefix(root: THREE.Object3D, prefix: string): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  root.traverse((o) => { if (o.name.startsWith(prefix)) out.push(o); });
  return out;
}

const scene = resolveScene('skull');

/** 规格 §4.2 场景 08 的八元素，实现里以 name 标注便于验收。 */
const SPEC_ELEMENTS = [
  'skull-cranium',        // ① 头骨 mesh
  'socket-wisp-l',        // ② 眼窝鬼火（双 emitter 之左）
  'socket-wisp-r',        // ② 眼窝鬼火（双 emitter 之右）
  'wraith-trail',         // ③ 幽魂拖影
  'bone-debris',          // ④ 骨屑
  'phosphor-drift',       // ⑤ 磷火飘浮
  'ash-ring',             // ⑥ 地面灰烬环
  'moonlight-chill',      // ⑦ 月光冷场
  'tombstone-silhouette', // ⑧ 墓碑剪影
];

describe('场景 08 skull', () => {
  it('已注册且签名声明恐怖叙事与眼窝双光源', () => {
    expect(scene).not.toBeNull();
    expect(scene!.config.preset).toBe('burst');
    expect(scene!.config.signature).toContain('恐怖叙事');
    expect(scene!.config.signature).toContain('双光源');
  });

  it('8 个规格元素全部落地为具名节点', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const tree = names(ctx.root);
    for (const element of SPEC_ELEMENTS) {
      expect(tree, `缺元素 ${element}`).toContain(element);
    }
    // ③ 幽魂拖影必须是 3 层（规格「半透明 ghost 层×3」）。
    expect(withPrefix(ctx.root, 'wraith-veil-')).toHaveLength(WRAITH_LAYERS);
    stage.dispose();
  });

  it('三幕推进：裂纹发光 / 爆裂 / 骨屑落地三段状态互不相同', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const snapshot = (t: number) => { step(stage, t); return visualSnapshot(ctx.root); };
    const act1 = snapshot(0.12);
    const act2 = snapshot(0.5);
    const act3 = snapshot(0.92);
    expect(act1).not.toBe(act2);
    expect(act2).not.toBe(act3);
    stage.dispose();
  });

  it('第一幕只有裂纹发光：头骨完整、鬼火与幽魂未起', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    step(stage, ACT1_END * 0.6);

    // 头骨完整可见，裂纹在发光。
    const cranium = node(ctx.root, 'skull-cranium');
    expect(opacity(cranium)).toBeGreaterThan(0.5);
    const crack = node(ctx.root, 'skull-crack') as THREE.Mesh;
    const crackGlow = (crack.material as THREE.ShaderMaterial).uniforms.uGlow.value as number;
    expect(crackGlow).toBeGreaterThan(0);

    // 爆裂尚未发生：鬼火、幽魂、骨屑都还没活跃。
    expect(opacity(node(ctx.root, 'socket-wisp-l'))).toBeLessThan(0.02);
    expect(opacity(node(ctx.root, 'socket-wisp-r'))).toBeLessThan(0.02);
    expect(layerOpacity(node(ctx.root, 'wraith-trail'))).toBeLessThan(0.02);
    expect(layerOpacity(node(ctx.root, 'bone-debris'))).toBeLessThan(0.02);
    stage.dispose();
  });

  it('第一幕蓄势：裂纹发光与扩散随时间单调推进，而非一上来就满值', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const crack = node(ctx.root, 'skull-crack') as THREE.Mesh;
    const uniforms = (crack.material as THREE.ShaderMaterial).uniforms;

    // 第一幕内多点取样：裂纹是「逐渐亮起来」的蓄势，不能是常量。
    const glows: number[] = [];
    const spreads: number[] = [];
    for (const frac of [0.15, 0.4, 0.7, 1]) {
      step(stage, ACT1_END * frac);
      glows.push(uniforms.uGlow.value as number);
      spreads.push(uniforms.uSpread.value as number);
    }
    for (let i = 1; i < glows.length; i += 1) {
      expect(glows[i], '裂纹发光应随第一幕推进变强').toBeGreaterThan(glows[i - 1]);
      expect(spreads[i], '裂纹扩散应随第一幕推进变宽').toBeGreaterThan(spreads[i - 1]);
    }
    stage.dispose();
  });

  it('第二幕爆裂：头骨碎去、鬼火与幽魂同时活跃', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    runTo(stage, 0.5, 30);
    expect(opacity(node(ctx.root, 'skull-cranium'))).toBeLessThan(0.3);
    for (const layer of ['socket-wisp-l', 'socket-wisp-r', 'wraith-trail', 'bone-debris']) {
      expect(layerOpacity(node(ctx.root, layer)), `${layer} 未参与爆裂`).toBeGreaterThan(0);
    }
    stage.dispose();
  });
});

describe('场景 08 skull — 独立签名', () => {
  it('眼窝双光源：两个独立 THREE.Light，位置由构造保证左右对称', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);

    const lights: THREE.Light[] = [];
    ctx.root.traverse((o) => { if ((o as THREE.Light).isLight) lights.push(o as THREE.Light); });
    // 「双光源」＝两个真实光源对象，不是一个光源加一片贴图。
    expect(lights).toHaveLength(2);
    const left = lights.find((l) => l.name === 'socket-light-l');
    const right = lights.find((l) => l.name === 'socket-light-r');
    expect(left, '缺左眼窝光源').toBeDefined();
    expect(right, '缺右眼窝光源').toBeDefined();
    expect(left).not.toBe(right);

    // 对称由构造保证：两者 x 互为相反数、y/z 相同，且间距非零。
    expect(left!.position.x).toBeCloseTo(-right!.position.x, 10);
    expect(left!.position.y).toBeCloseTo(right!.position.y, 10);
    expect(left!.position.z).toBeCloseTo(right!.position.z, 10);
    expect(Math.abs(left!.position.x)).toBeGreaterThan(0);

    // 两盏灯在爆裂幕真的亮起来（不是摆着不发光的占位）。
    runTo(stage, 0.5, 30);
    expect((left as THREE.PointLight).intensity).toBeGreaterThan(0);
    expect((right as THREE.PointLight).intensity).toBeGreaterThan(0);
    stage.dispose();
  });

  it('恐怖叙事：月光冷场与墓碑剪影全程在位，冷场为青灰而非素材色', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    step(stage, 0.05);
    // 冷场是叙事底色，第一幕就该铺开（"荒冢之上"的环境先于事件）。
    // ShaderMaterial.opacity 不参与自定义着色，断言真实强度 uniform 才有意义。
    const chill = node(ctx.root, 'moonlight-chill') as THREE.Mesh;
    const chillMaterial = chill.material as THREE.ShaderMaterial;
    expect(chillMaterial.uniforms.uChill.value).toBeGreaterThan(0);
    // 青灰冷场：主色不得跟随素材色（本例青绿），否则"月光"就不成立。
    const tint = chillMaterial.uniforms.uTint.value as THREE.Color;
    expect(tint.equals(ctx.color)).toBe(false);
    expect(layerOpacity(node(ctx.root, 'tombstone-silhouette'))).toBeGreaterThan(0);
    stage.dispose();
  });
});

describe('场景 08 skull — 多元素互动', () => {
  it('互动①：鬼火从眼窝喷出后拖出幽魂，幽魂位置由鬼火实测状态驱动', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const wisp = node(ctx.root, 'socket-wisp-l');
    const veils = withPrefix(ctx.root, 'wraith-veil-');
    expect(veils.length).toBe(WRAITH_LAYERS);

    // 鬼火未喷出时幽魂不应存在——耦合的方向是「火先、魂后」。
    step(stage, ACT1_END * 0.5);
    expect(layerOpacity(node(ctx.root, 'wraith-trail'))).toBeLessThan(0.02);

    runTo(stage, 0.52, 40);
    const wispPos = wisp.getWorldPosition(new THREE.Vector3());
    const headVeil = veils[0].getWorldPosition(new THREE.Vector3());
    // 头层幽魂紧跟鬼火：耦合成立则两者位置在同一邻域。
    expect(wispPos.distanceTo(headVeil)).toBeLessThan(
      Math.hypot(ctx.width, ctx.height) * 0.12,
    );

    // 真耦合的判据：幽魂各层必须**逐帧精确等于**鬼火中点的历史帧。
    // 逐帧记录鬼火实测中点，再按各层延迟回查——独立时间曲线不可能
    // 帧帧命中同一串真值，所以这条等式只有在真读鬼火状态时才成立。
    const wispR = node(ctx.root, 'socket-wisp-r');
    const midHistory: THREE.Vector3[] = [];
    for (let i = 0; i < 24; i += 1) {
      step(stage, 0.52 + i * 0.004);
      midHistory.push(
        wisp.position.clone().add(wispR.position).multiplyScalar(0.5),
      );
      for (let layer = 0; layer < WRAITH_LAYERS; layer += 1) {
        const lag = layer * WRAITH_LAG_FRAMES;
        if (lag > i) continue;
        const expected = midHistory[midHistory.length - 1 - lag];
        expect(
          veils[layer].position.distanceTo(expected),
          `第 ${layer} 层未命中鬼火 ${lag} 帧前的实测位置`,
        ).toBeLessThan(1e-6);
      }
    }

    // 拖影落后于火头：尾层比头层更靠近鬼火的历史位置。
    const tail = veils[WRAITH_LAYERS - 1].getWorldPosition(new THREE.Vector3());
    const head = veils[0].getWorldPosition(new THREE.Vector3());
    const wispNow = wisp.getWorldPosition(new THREE.Vector3());
    expect(head.distanceTo(wispNow)).toBeLessThan(tail.distanceTo(wispNow));
    expect(WRAITH_LAG_FRAMES).toBeGreaterThan(0);
    stage.dispose();
  });

  it('互动②：灰烬环强度由骨屑实际落地数驱动，而非时间曲线', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const ring = node(ctx.root, 'ash-ring') as THREE.Mesh;
    const ringMaterial = ring.material as THREE.ShaderMaterial;
    expect(ringMaterial.uniforms.uLandings, '灰烬环缺落地计数 uniform').toBeDefined();

    // 骨屑还没落地时灰烬环不该腾起。
    for (let i = 1; i <= 24; i += 1) step(stage, i / 96);
    expect(ringMaterial.uniforms.uLandings.value).toBe(0);
    expect(ringMaterial.uniforms.uIntensity.value).toBe(0);

    // 沿第三幕多点取样，每一点都把 uniform 与**独立复算的落地数**逐一对齐。
    // 只在 t=1 比一次是不够的：终帧全部落地时，任何在末尾撞上满值的
    // 时间曲线都能蒙对（实测 act3*30 即可蒙过单点断言）。中段落地数是
    // 部分值，时间曲线不可能帧帧命中，这才真正锁住"由落地事件驱动"。
    const groundY = node(ctx.root, 'ash-ring').position.y;
    const settleY = debrisSettleY(groundY, Math.min(ctx.width, ctx.height) * SKULL_RADIUS_RATIO);
    const recount = (): number => withPrefix(ctx.root, 'bonebit-').filter(
      (o) => o.getWorldPosition(new THREE.Vector3()).y <= settleY,
    ).length;

    // 连续推进一次并沿途取样（runTo 每次都从 t=0 重放，会把整段飞行
    // 重新积分完，到 0.66 时早已全部落地，就取不到部分值了）。
    const samples: number[] = [];
    const total = 96;
    for (let i = 25; i <= total; i += 1) {
      step(stage, i / total);
      const landings = ringMaterial.uniforms.uLandings.value as number;
      expect(landings, `t=${(i / total).toFixed(2)} 灰烬环落地数与实测不符`).toBe(recount());
      samples.push(landings);
    }
    // 落地数必须真的从少到多推进过，否则上面的等式可能只是"恒为满值"。
    expect(samples[0], '第二幕中段不应已全部落地').toBeLessThan(samples[samples.length - 1]);
    expect(samples[samples.length - 1], '第三幕末应有骨屑落地').toBeGreaterThan(0);
    // 有骨屑落地则环必须真的腾起来（uIntensity 是着色器实际消费的强度）。
    expect(ringMaterial.uniforms.uIntensity.value).toBeGreaterThan(0);
    stage.dispose();
  });
});

describe('场景 08 skull — 物理与覆盖', () => {
  it('骨屑受重力下落并在灰烬环所在地面反弹，不穿透', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    const groundY = node(ctx.root, 'ash-ring').position.y;
    // 前缀必须只命中刚体：wraith-veil / ash-* 等不得混进来。
    const bits = withPrefix(ctx.root, 'bonebit-');
    expect(bits.length).toBeGreaterThan(0);

    const history = bits.map(() => [] as number[]);
    for (let i = 1; i <= 96; i += 1) {
      step(stage, i / 96);
      bits.forEach((b, idx) => history[idx].push(b.position.y));
    }

    // 重力：多数骨屑末态低于爆心。
    expect(bits.filter((b) => b.position.y < 0).length).toBeGreaterThan(bits.length * 0.5);
    // 不穿透地面。
    for (const ys of history) {
      expect(Math.min(...ys)).toBeGreaterThan(groundY - 2);
    }
    // 反弹：至少一片先降后升（bone restitution .34 应可见回跳）。
    const bounced = history.some((ys) => {
      let low = Infinity;
      let fell = false;
      for (const y of ys) {
        if (y < low) { low = y; fell = true; }
        else if (fell && y > low + 3) return true;
      }
      return false;
    });
    expect(bounced, '骨屑应有触地反弹').toBe(true);
    stage.dispose();
  });

  it('全屏覆盖：骨屑四散全屏、磷火飘满半屏、冷场铺满全屏', () => {
    const ctx = makeCtx({ width: 1920, height: 1080 });
    const stage = scene!.create(ctx);
    runTo(stage, 0.95, 90);

    const debris = box(node(ctx.root, 'bone-debris')).getSize(new THREE.Vector3());
    expect(debris.x, '骨屑未四散全屏').toBeGreaterThan(ctx.width * 0.6);

    const phosphor = box(node(ctx.root, 'phosphor-drift')).getSize(new THREE.Vector3());
    expect(phosphor.x).toBeGreaterThan(ctx.width * 0.6);
    // 「飘满半屏」：纵向至少占半屏。
    expect(phosphor.y).toBeGreaterThan(ctx.height * 0.45);

    const chill = box(node(ctx.root, 'moonlight-chill')).getSize(new THREE.Vector3());
    expect(chill.x).toBeGreaterThanOrEqual(ctx.width);
    expect(chill.y).toBeGreaterThanOrEqual(ctx.height);
    stage.dispose();
  });

  it('第三幕：骨屑落地且磷火飘散，鬼火退去', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    runTo(stage, 0.5, 30);
    const wispPeak = opacity(node(ctx.root, 'socket-wisp-l'));

    runTo(stage, 1, 60);
    // 磷火在第三幕接棒。
    expect(layerOpacity(node(ctx.root, 'phosphor-drift'))).toBeGreaterThan(0);
    // 鬼火退去：第三幕末不应比爆裂幕更亮。
    expect(opacity(node(ctx.root, 'socket-wisp-l'))).toBeLessThan(wispPeak);
    stage.dispose();
  });

  it('低档位缩减密度但保留全部规格元素', () => {
    const hi = makeCtx({ quality: 'cinematic' });
    const lo = makeCtx({ quality: 'low' });
    const a = scene!.create(hi);
    const b = scene!.create(lo);
    runTo(a, 0.6, 24);
    b.update(0.6, 720, 'low');

    for (const element of SPEC_ELEMENTS) {
      expect(names(lo.root), `low 档缺 ${element}`).toContain(element);
      expect(names(hi.root), `cinematic 档缺 ${element}`).toContain(element);
    }
    // 双光源是签名，任何档位都不能砍成一盏。
    for (const root of [hi.root, lo.root]) {
      const lights: THREE.Light[] = [];
      root.traverse((o) => { if ((o as THREE.Light).isLight) lights.push(o as THREE.Light); });
      expect(lights).toHaveLength(2);
    }
    // 幽魂 3 层同样是规格定数，不随档位缩减。
    expect(withPrefix(lo.root, 'wraith-veil-')).toHaveLength(WRAITH_LAYERS);

    for (const prefix of ['bonebit-', 'phosphor-mote-']) {
      const loCount = withPrefix(lo.root, prefix).length;
      const hiCount = withPrefix(hi.root, prefix).length;
      expect(loCount, `${prefix} 低档应更稀疏`).toBeLessThan(hiCount);
      expect(loCount, `${prefix} 低档不得归零`).toBeGreaterThan(0);
    }
    a.dispose();
    b.dispose();
  });

  it('dispose 清空根节点且幂等，dispose 后 update 静默失效', () => {
    const ctx = makeCtx();
    const stage = scene!.create(ctx);
    runTo(stage, 0.6, 20);
    expect(ctx.root.children.length).toBeGreaterThan(0);
    stage.dispose();
    expect(ctx.root.children).toHaveLength(0);
    expect(() => stage.dispose()).not.toThrow();
    expect(() => step(stage, 0.8)).not.toThrow();
  });
});
