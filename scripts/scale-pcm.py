#!/usr/bin/env python3
"""Apply a conservative linear gain to a little-endian PCM WAV file."""

import struct
import sys
import wave


source, destination, gain_text = sys.argv[1:]
gain = float(gain_text)
with wave.open(source, "rb") as input_file:
    params = input_file.getparams()
    raw = input_file.readframes(input_file.getnframes())

samples = struct.unpack("<" + "h" * (len(raw) // 2), raw)
scaled = [max(-32768, min(32767, int(round(sample * gain)))) for sample in samples]
with wave.open(destination, "wb") as output_file:
    output_file.setparams(params)
    output_file.writeframes(struct.pack("<" + "h" * len(scaled), *scaled))
