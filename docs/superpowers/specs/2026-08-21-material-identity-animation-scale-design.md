# 素材本体动画放大与延时设计

## 目标

让每次特效都能清楚看到当前素材本体的动画身份：素材精灵在 WebGL 与 Canvas 路径都可见，动画轨迹覆盖范围扩大 3 倍，精灵可视面积扩大约 3 倍，素材动画生命周期延长 1.5 倍。

## 方案

- 新增 `material-animation-constants.ts`，集中定义轨迹面积倍率、精灵线性倍率和时长倍率，避免 WebGL、Canvas 与时间线各自写魔数。
- 渲染契约把 `sourceSprite` 作为所有预设的素材身份层；专属物理场景仍保留，`genericParticles` 不变，因此不会把不同素材退化为同一种粒子爆炸。
- WebGL 在上传素材纹理时按 `sqrt(3)` 放大精灵几何，在 `placeFamilySprite` 的最终位置上按 3 倍放大轨迹。Canvas 回退使用同一倍率放大 `effect.sprite` 和旧版 `style.sprite` 的位置与尺寸。
- `effectDurationFor` 和旧版默认生命周期统一乘 1.5。专属场景、Canvas 回退和 `ImageMaterial` 继续共享同一个返回值；暴雨等时间驱动场景不再硬编码旧时长。

## 验收

- 所有预设的渲染契约均启用 `sourceSprite`，但既有专属阶段仍拥有独立几何和物理逻辑。
- 精灵轨迹样本的位移倍率为 3，精灵面积倍率为 3，时长倍率为 1.5。
- Canvas 与 WebGL 均在延长后的生命周期内保持动画，结束边界仍由同一时间线决定。
- 现有全量 TypeScript、Vitest、Rust 测试、Clippy 和生产构建继续通过。
