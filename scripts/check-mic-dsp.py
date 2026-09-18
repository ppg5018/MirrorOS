#!/usr/bin/env python3
"""
MirrorOS — offline check of the wakeword.py mic DSP (MicDSP) against a raw
capture. No mic, model or backend needed.

Record a raw capture on the Pi (stop the voice loop first — the card is exclusive):
  pm2 stop mirroros-voice
  arecord -D mirror_raw -f S32_LE -r 48000 -c 2 -d 8 /tmp/speech.wav
  (stay quiet ~2 s, then speak from where you stand at the mirror)

Then:
  python3 scripts/check-mic-dsp.py [/tmp/speech.wav]

Checks:
  - every block comes out int16, 1280 samples (16 kHz, 80 ms)
  - speech blocks land within TOLERANCE_DB of MIC_AGC_TARGET_DBFS after AGC
  - filter state is continuous: block-by-block == one contiguous pass
Exit code 0 = all checks passed, 1 = a check failed.
"""

import os
import sys
import types
import wave

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'server', 'voice'))

# wakeword.py imports openwakeword at module level; only MicDSP is needed here,
# so let the check run on a dev machine without it.
try:
    import openwakeword  # noqa: F401
except ImportError:
    _oww = types.ModuleType('openwakeword')
    _oww_model = types.ModuleType('openwakeword.model')
    _oww_model.Model = object
    _oww.model = _oww_model
    sys.modules['openwakeword'] = _oww
    sys.modules['openwakeword.model'] = _oww_model

import wakeword as ww  # noqa: E402

TOLERANCE_DB = 4.0      # "within a few dB" of the AGC target
SPEECH_WINDOW_DB = 8.0  # blocks within this of the loudest pre-gain block = speech


def dbfs_int16(frame):
    x = frame.astype(np.float64) / 32768.0
    return ww._dbfs(x)


def load_raw(path):
    with wave.open(path, 'rb') as w:
        rate, ch, width = w.getframerate(), w.getnchannels(), w.getsampwidth()
        data = w.readframes(w.getnframes())
    if rate != ww.HW_RATE or width != 4:
        sys.exit(f'{path}: need a raw {ww.HW_RATE} Hz S32 capture, got {rate} Hz '
                 f'{width * 8}-bit x{ch} (record with arecord -D mirror_raw, see above)')
    pcm = np.frombuffer(data, dtype='<i4').reshape(-1, ch)
    return pcm[:, 0].astype(np.float64) / 2147483648.0     # channel 0, like MicCapture


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else '/tmp/speech.wav'
    x = load_raw(path)
    n_blocks = len(x) // ww.HW_BLOCK
    x = x[:n_blocks * ww.HW_BLOCK]
    if n_blocks < 10:
        sys.exit(f'{path}: too short ({n_blocks} blocks) — record a few seconds')
    failures = []

    # 1. Full pipeline, block by block, exactly as MicCapture.read() runs it.
    dsp = ww.MicDSP()
    outs, in_db, gains = [], [], []
    for i in range(n_blocks):
        out = dsp.process(x[i * ww.HW_BLOCK:(i + 1) * ww.HW_BLOCK])
        outs.append(out)
        in_db.append(dsp.in_dbfs)
        gains.append(dsp.gain_db)
    bad = [i for i, o in enumerate(outs)
           if o.dtype != np.int16 or o.shape != (ww.FRAME_LENGTH,)]
    if bad:
        failures.append(f'{len(bad)} blocks not int16 x {ww.FRAME_LENGTH} (first: {bad[0]})')
    print(f'blocks: {n_blocks} x {ww.FRAME_LENGTH} int16 @ {ww.SAMPLE_RATE} Hz '
          f'({n_blocks * ww.FRAME_LENGTH / ww.SAMPLE_RATE:.2f} s)')

    # 2. AGC level over the speech section.
    in_db = np.array(in_db)
    out_db = np.array([dbfs_int16(o) for o in outs])
    speech = in_db >= in_db.max() - SPEECH_WINDOW_DB
    quiet = ~speech
    sp_med = float(np.median(out_db[speech]))
    print(f'pre-gain:  loudest block {in_db.max():6.1f} dBFS, '
          f'quiet median {np.median(in_db[quiet]) if quiet.any() else float("nan"):6.1f} dBFS '
          f'(AGC frozen below {ww.AGC_FLOOR_DBFS:g})')
    print(f'post-AGC:  speech median {sp_med:6.1f} dBFS over {int(speech.sum())} blocks '
          f'(target {ww.AGC_TARGET_DBFS:g} ± {TOLERANCE_DB:g})')
    if quiet.any():
        q_rms = [float(np.sqrt(np.mean(outs[i].astype(np.float64) ** 2)))
                 for i in np.flatnonzero(quiet)]
        thr = int(os.environ.get('SILENCE_THRESHOLD', '1400'))
        print(f'post-AGC:  quiet median {np.median(out_db[quiet]):6.1f} dBFS, '
              f'max int16 RMS {max(q_rms):.0f} (SILENCE_THRESHOLD {thr}), '
              f'final gain {gains[-1]:+.1f} dB')
    if abs(sp_med - ww.AGC_TARGET_DBFS) > TOLERANCE_DB:
        failures.append(f'speech median {sp_med:.1f} dBFS is outside '
                        f'{ww.AGC_TARGET_DBFS:g} ± {TOLERANCE_DB:g}')

    # 3. Filter-state continuity: 3840-sample blocks vs one contiguous array.
    blocked = ww.MicDSP()
    y_blocks = np.concatenate([blocked.filter_decimate(x[i * ww.HW_BLOCK:(i + 1) * ww.HW_BLOCK])
                               for i in range(n_blocks)])
    y_whole = ww.MicDSP().filter_decimate(x)
    diff = float(np.max(np.abs(y_blocks - y_whole)))
    scale = float(np.max(np.abs(y_whole))) or 1.0
    print(f'continuity: max |blocked - contiguous| = {diff:.2e} ({diff / scale:.2e} of peak)')
    if diff / scale > 1e-9:
        failures.append(f'filter state is not continuous across blocks ({diff:.2e})')

    if failures:
        print('\nFAIL:\n  ' + '\n  '.join(failures))
        sys.exit(1)
    print('\nOK — all checks passed')


if __name__ == '__main__':
    main()
