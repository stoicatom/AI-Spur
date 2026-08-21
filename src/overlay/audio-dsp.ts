/** Reusable bounded soft-clipping curve for material-specific voice models. */
export function distortionCurve(amount: number, samples = 256): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(new ArrayBuffer(samples * Float32Array.BYTES_PER_ELEMENT));
  const drive = Math.max(0, Math.min(1, amount));
  if (drive < .001) {
    for (let index = 0; index < samples; index++) curve[index] = (index * 2) / (samples - 1) - 1;
    return curve;
  }
  const coefficient = 1 + drive * 40;
  const normalizer = Math.atan(coefficient);
  for (let index = 0; index < samples; index++) {
    const input = (index * 2) / (samples - 1) - 1;
    curve[index] = Math.atan(coefficient * input) / normalizer;
  }
  return curve;
}
