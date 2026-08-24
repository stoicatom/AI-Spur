# 素材本体动画放大与延时设计

## 目标

让每次特效都能清楚看到当前素材本体的动画身份：素材精灵在 WebGL 与 Canvas 路径都可见，动画轨迹覆盖范围扩大 3 倍，精灵可视面积扩大约 3 倍，素材动画生命周期延长 1.5 倍。

## 方案

- 新增 `material-animation-constants.ts`，集中定义轨迹面积倍率、精灵线性倍率、时长倍率和纯 `SpriteFrame` 缩放 helper，避免 WebGL 与 Canvas 各自写魔数或派生不同轨迹。
- 渲染契约把 `sourceSprite` 作为所有预设的素材身份层；专属物理场景仍保留，`genericParticles` 不变，因此不会把不同素材退化为同一种粒子爆炸。
- WebGL 与 Canvas 每帧都调用当前预设的 `effect.sprite(t, vel, params)`，再通过共享 helper 将位移乘 3、线性尺寸乘 `sqrt(3)`，并保持旋转与透明度不变。Three 映射层只负责将 Canvas 的向下正轴和顺时针旋转转换为 Three 的向上正轴和逆时针旋转，不再维护独立的家族轨迹。
- `effectDurationFor` 和旧版默认生命周期统一乘 1.5。专属场景、Canvas 回退和 `ImageMaterial` 继续共享同一个返回值；暴雨等时间驱动场景不再硬编码旧时长。Canvas 发射粒子的 `decay` 除以 1.5、`delay` 乘以 1.5，WebGL 种子粒子的 `decay` 除以 1.5，同时固定 60 Hz 物理积分保持不变。

## 验收

- 所有预设的渲染契约均启用 `sourceSprite`，但既有专属阶段仍拥有独立几何和物理逻辑。
- 共享 `SpriteFrame` 的位移倍率为 3、精灵面积倍率为 3、时长倍率为 1.5，旋转和透明度保持原值。
- 同一素材在 Canvas 和 WebGL 中消费同一个预设帧，视觉位移方向和旋转方向一致。
- Canvas 与 WebGL 均在延长后的生命周期内保持动画，结束边界仍由同一时间线决定。
- 现有全量 TypeScript、Vitest、Rust 测试、Clippy 和生产构建继续通过。
