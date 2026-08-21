# 素材独立物理与声学身份设计

> 日期：2026-08-21  
> 状态：已确认（用户要求按推荐方案连续执行）  
> 范围：42 个内置素材包的物理特性、3D 运动响应与声音空间化

## 1. 目标

每个素材必须是独立实体：视觉效果、物理响应和声效都由该素材自己的身份参数驱动。允许共享底层积分器、Three.js 资源生命周期和 Web Audio 节点工厂，但禁止把“同一族的成品爆炸”仅通过颜色、缩放或随机数区分。

验收重点：

- 42 个内置素材均有唯一且可解释的物理蓝图，包含质量、弹性、阻尼、表面摩擦、重力响应和受力模型。
- 甩鞭速度和方向进入蓝图求解：冲击强度、初速度、方向、碰撞回弹和拖尾长度都受真实速度向量影响。
- 42 个素材均有独立声学蓝图，真实录音或程序化声源通过材质密度、粗糙度、共振、空气吸收和空间宽度处理。
- 禁止通过 `Math.random()` 生成身份差异；所有差异必须来自素材 ID、清单参数和输入速度。
- 自定义素材没有内置蓝图时，依据其特效预设和清单参数生成稳定回退蓝图，仍不允许出现同一播放过程内的随机身份漂移。

## 2. 方案

### 2.1 物理蓝图

新增 `src/overlay/material-identity.ts`，以素材包 ID 为键导出：

```ts
type MaterialPhysicalBlueprint = {
  surface: 'metal' | 'wood' | 'glass' | 'ice' | 'water' | 'fire' | 'air' | 'stone' | 'bone' | 'fabric';
  force: 'thrust' | 'elastic' | 'fracture' | 'fluid' | 'vortex' | 'resonance' | 'combustion' | 'gravity';
  mass: number;
  restitution: number;
  friction: number;
  drag: number;
  gravity: number;
  resonance: number;
  stiffness: number;
  phase: number;
};
```

蓝图由稳定的素材表提供，未知 ID 用 `preset + params` 的 FNV 指纹生成有界回退值。`resolveMaterialPhysics` 将蓝图与特效清单、甩动速度合并，输出求解器需要的质量、回弹、摩擦、阻尼、受力强度和相位。`seedParticleStates` 使用质量与受力模型计算出生速度，`stepParticle` 在固定 `dt = 1/60` 下加入阻力、重力、弹簧/涡旋/流体等力，并在越过屏幕边界时按恢复系数反弹，避免不同素材退化为同一种自由放射。

`FamilyContext` 携带 `packId` 和蓝图。已有素材专属阶段继续拥有自己的几何和时间轴；蓝图只改变其受力和材质响应，不复制渲染器。

### 2.2 声学蓝图

同一文件导出 `MaterialAcousticBlueprint`，包含材质密度、粗糙度、共振频率、空气吸收、空间宽度和瞬态比例。`audio-engine.ts` 将 `packId` 传入真实采样播放，`connectSampleSoundscape` 依据蓝图调整干声/主体/高频瞬态、低通/高通、立体声延迟与声像；程序化语义声音也使用同一蓝图调整事件增益、频率和空间 spread。

真实采样仍是主声源，不用合成噪声伪装素材差异。蓝图只模拟播放环境和材质响应：重金属更短的瞬态与更强低频共振，玻璃/冰更高的高频和更短衰减，布料/空气更宽的吸收与较弱反射。

### 2.3 唯一性契约

新增测试覆盖：

1. 所有 `BUILTIN_PACK_IDS` 都存在物理和声学蓝图。
2. 物理身份 tuple（表面、受力、质量、回弹、摩擦、阻尼、相位）42 项唯一。
3. 声学身份 tuple（材质、密度、粗糙度、共振、吸收、空间宽度）42 项唯一。
4. 同一素材在相同输入下求解确定；改变速度/方向会改变可观测的初速度或空间声像。
5. 现有生命周期、固定步长、素材包清单和音频释放测试继续通过。

## 3. 数据流

```text
pack.json + active pack id + whip velocity
          │
          ├── resolveMaterialIdentity
          │     ├── resolveMaterialPhysics ──> particle seed/step + family stages
          │     └── acousticBlueprintFor ────> sample bus / semantic graph
          │
          └── visual + physical motion + spatialized material sound
```

## 4. 错误处理与性能

- 未知素材使用稳定回退，不抛出渲染线程异常。
- 非有限清单参数被忽略，沿用蓝图默认值；现有 Zod/Rust 校验保持不变。
- 蓝图是只读常量；单次效果只创建一份派生物理对象，不在每帧分配。
- 固定步长仍为 60Hz；每帧物理耗时预算保持低于 2ms，粒子数量上限沿用现有 160。
- 音频节点仍由 `AudioPlaybackRegistry` 统一释放，新增蓝图只改变初始 AudioParam 值。

## 5. 不在本次范围

- 不重绘已有 SVG，不替换已经录制的 42 个 `sound.m4a`。
- 不新增第三方物理或音频依赖。
- 不删除现有专属阶段；不把所有素材拆成 42 个独立渲染器文件。
