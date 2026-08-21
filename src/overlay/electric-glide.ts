export type ElectricGlideSample = Readonly<{
  offset: number;
  velocity: number;
  travelDistance: number;
  flightSeconds: number;
}>;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/**
 * Integrates a charged leader with the same fixed-60Hz drag semantics used by
 * the WebGL stage. The returned offset is expressed along the strike direction.
 */
export function electricGlideAt(
  progress: number,
  durationMs: number,
  width: number,
  height: number,
  impulse = 1.45,
  stiffness = 1,
  drag = 0.962,
): ElectricGlideSample {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const safeImpulse = clamp(impulse, 0.32, 4.8);
  const safeStiffness = clamp(stiffness, 0.1, 4);
  const safeDrag = clamp(drag, 0.95, 0.999);
  const travelDistance = Math.hypot(safeWidth, safeHeight) * (1.02 + safeImpulse * 0.035);
  const flightSeconds = Math.max(0.7, durationMs / 1000 * 0.86);
  const launchVelocity = travelDistance / flightSeconds * (0.82 + safeImpulse * 0.04);
  const acceleration = launchVelocity / flightSeconds * (0.16 + safeStiffness * 0.02);
  const seconds = clamp(progress, 0, 1) * Math.max(0, durationMs) / 1000;
  const flight = Math.min(seconds, flightSeconds);
  const rate = -Math.log(safeDrag) * 60;
  const invRate = 1 / Math.max(0.0001, rate);
  const decay = Math.exp(-rate * flight);
  const dragDistance = (1 - decay) * invRate;
  const accelerationDistance = flight * invRate - (1 - decay) * invRate * invRate;
  const rawDistance = launchVelocity * dragDistance + acceleration * accelerationDistance;
  const endDecay = Math.exp(-rate * flightSeconds);
  const endDragDistance = (1 - endDecay) * invRate;
  const endAccelerationDistance = flightSeconds * invRate - (1 - endDecay) * invRate * invRate;
  const totalDistance = Math.max(0.001, launchVelocity * endDragDistance + acceleration * endAccelerationDistance);
  const glideProgress = clamp(rawDistance / totalDistance, 0, 1);
  const rawVelocity = launchVelocity * decay + acceleration * (1 - decay) * invRate;
  return {
    offset: -travelDistance * 0.62 + glideProgress * travelDistance * 1.24,
    velocity: rawVelocity / totalDistance * travelDistance * 1.24,
    travelDistance,
    flightSeconds,
  };
}
