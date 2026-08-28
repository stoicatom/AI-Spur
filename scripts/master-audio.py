#!/usr/bin/env python3
"""Master a decoded 16-bit PCM WAV for consistent, ringtone-grade playback.

The source recordings remain untouched semantically: this pass only applies a
transparent loudness/peak master so a quiet bell and a dense impact sit on the
same playback bus.  It intentionally uses the standard library so the result
is reproducible on a clean macOS checkout.
"""

from __future__ import annotations

import argparse
import math
import struct
import wave


def db_to_linear(db: float) -> float:
    return 10.0 ** (db / 20.0)


def linear_to_db(value: float) -> float:
    return 20.0 * math.log10(max(value, 1e-12))


def active_rms(samples: list[float], threshold: float) -> float:
    active = [sample for sample in samples if abs(sample) >= threshold]
    if not active:
        return math.sqrt(sum(sample * sample for sample in samples) / max(1, len(samples)))
    return math.sqrt(sum(sample * sample for sample in active) / len(active))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source")
    parser.add_argument("destination")
    parser.add_argument("--target-rms", type=float, default=-17.0)
    # AAC reconstruction can overshoot a PCM peak by several dB; leave
    # sufficient inter-sample headroom for the final codec.
    parser.add_argument("--max-peak", type=float, default=-5.0)
    parser.add_argument("--max-gain", type=float, default=18.0)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    with wave.open(args.source, "rb") as input_file:
        params = input_file.getparams()
        if params.sampwidth != 2:
            raise SystemExit("master-audio.py requires 16-bit PCM input")
        raw = input_file.readframes(input_file.getnframes())

    values = struct.unpack("<" + "h" * (len(raw) // 2), raw)
    samples = [value / 32768.0 for value in values]
    rms = active_rms(samples, db_to_linear(-55.0))
    desired_gain = db_to_linear(args.target_rms - linear_to_db(rms))
    gain = min(desired_gain, db_to_linear(args.max_gain))
    mastered = [sample * gain for sample in samples]

    # A soft knee catches transient overs without flattening the whole sample.
    knee = db_to_linear(-3.0)
    for index, sample in enumerate(mastered):
        magnitude = abs(sample)
        if magnitude > knee:
            excess = (magnitude - knee) / max(1e-9, 1.0 - knee)
            compressed = knee + (1.0 - knee) * math.tanh(excess * 2.4) / math.tanh(2.4)
            mastered[index] = math.copysign(compressed, sample)

    peak_limit = db_to_linear(args.max_peak)
    peak = max((abs(sample) for sample in mastered), default=0.0)
    if peak > peak_limit:
        limiter_gain = peak_limit / peak
        mastered = [sample * limiter_gain for sample in mastered]

    encoded = [max(-32768, min(32767, int(round(sample * 32767.0)))) for sample in mastered]
    with wave.open(args.destination, "wb") as output_file:
        output_file.setparams(params)
        output_file.writeframes(struct.pack("<" + "h" * len(encoded), *encoded))

    output_peak = max((abs(sample) for sample in mastered), default=0.0)
    output_rms = active_rms(mastered, db_to_linear(-55.0))
    print(
        f"inputRms={linear_to_db(rms):.2f}dBFS "
        f"gain={linear_to_db(gain):.2f}dB "
        f"outputRms={linear_to_db(output_rms):.2f}dBFS "
        f"outputPeak={linear_to_db(output_peak):.2f}dBFS"
    )


if __name__ == "__main__":
    main()
