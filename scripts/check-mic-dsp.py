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

Prints pre- and post-gain RMS / peak for the noise and speech sections, and
the int16 RMS the endpointer in record() will see, so SILENCE_THRESHOLD can be
checked against a real recording rather than inferred.

Checks:
  - every block comes out int16, 1280 samples (16 kHz, 80 ms)
  - SILENCE_THRESHOLD sits above the noise blocks and below typical speech
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

# Section split on pre-gain block level: speech = within SPEECH_WINDOW_DB of the
# loudest block; noise = within NOISE_WINDOW_DB of the quietest 10%. Blocks in
# between (word onsets/tails) are left out of both.
SPEECH_WINDOW_DB = 8.0
NOISE_WINDOW_DB = 3.0


def db(v):
    return 20.0 * np.log10(v) if v > 1e-10 else -200.0


def load_raw(path):
    with wave.open(path, 'rb') as w:
        rate, ch, width = w.getframerate(), w.getnchannels(), w.getsampwidth()
        data = w.readframes(w.getnframes())
    if rate != ww.HW_RATE or width != 4:
        sys.exit(f'{path}: need a raw {ww.HW_RATE} Hz S32 capture, got {rate} Hz '
                 f'{width * 8}-bit x{ch} (record with arecord -D mirror_raw, see above)')
    pcm = np.frombuffer(data, dtype='<i4').reshape(-1, ch)
    return pcm[:, 0].astype(np.float64) / 2147483648.0     # channel 0, like MicCapture


def section_report(name, pre, post):
    """pre: filtered float blocks (before gain); post: int16 output blocks."""
    pre_all = np.concatenate(pre)
    post_all = np.concatenate(post).astype(np.float64)
    pre_rms = float(np.sqrt(np.mean(pre_all ** 2)))
    pre_pk = float(np.max(np.abs(pre_all)))
    post_rms = float(np.sqrt(np.mean(post_all ** 2)))
    post_pk = float(np.max(np.abs(post_all)))
    blk_rms = np.array([np.sqrt(np.mean(b.astype(np.float64) ** 2)) for b in post])
    print(f'  {name:<6} {len(post):3d} blocks | pre-gain  RMS {db(pre_rms):6.1f} dBFS  '
          f'peak {db(pre_pk):6.1f} dBFS ({pre_pk:.4f})')
    print(f'  {"":<6}            | post-gain RMS {db(post_rms / 32768):6.1f} dBFS  '
          f'peak {db(post_pk / 32768):6.1f} dBFS ({post_pk:.0f})')
    print(f'  {"":<6}            | int16 block RMS: min {blk_rms.min():.0f}  '
          f'median {np.median(blk_rms):.0f}  p95 {np.percentile(blk_rms, 95):.0f}  '
          f'max {blk_rms.max():.0f}')
    return blk_rms


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
    pre, post = [], []
    for i in range(n_blocks):
        y = dsp.filter_decimate(x[i * ww.HW_BLOCK:(i + 1) * ww.HW_BLOCK])
        pre.append(y)
        post.append(dsp.apply_gain(y))
    bad = [i for i, o in enumerate(post)
           if o.dtype != np.int16 or o.shape != (ww.FRAME_LENGTH,)]
    if bad:
        failures.append(f'{len(bad)} blocks not int16 x {ww.FRAME_LENGTH} (first: {bad[0]})')
    print(f'blocks: {n_blocks} x {ww.FRAME_LENGTH} int16 @ {ww.SAMPLE_RATE} Hz '
          f'({n_blocks * ww.FRAME_LENGTH / ww.SAMPLE_RATE:.2f} s), '
          f'fixed gain {ww.MIC_DSP_GAIN_DB:+g} dB')

    # 2. Noise vs speech levels, before and after the fixed gain.
    lvl = np.array([ww._dbfs(y) for y in pre])
    speech = lvl >= lvl.max() - SPEECH_WINDOW_DB
    noise = (lvl <= np.percentile(lvl, 10) + NOISE_WINDOW_DB) & ~speech
    if not noise.any() or not speech.any():
        sys.exit('could not separate noise from speech — record ~2 s of silence, then speak')
    print(f'sections (pre-gain block level; speech >= {lvl.max() - SPEECH_WINDOW_DB:.1f} dBFS):')
    n_rms = section_report('noise', [pre[i] for i in np.flatnonzero(noise)],
                           [post[i] for i in np.flatnonzero(noise)])
    s_rms = section_report('speech', [pre[i] for i in np.flatnonzero(speech)],
                           [post[i] for i in np.flatnonzero(speech)])

    thr = int(os.environ.get('SILENCE_THRESHOLD', '1200'))
    n_hi, s_mid = float(np.percentile(n_rms, 95)), float(np.median(s_rms))
    print(f'SILENCE_THRESHOLD {thr}: noise p95 {n_hi:.0f} → margin {thr - n_hi:+.0f}; '
          f'speech median {s_mid:.0f} → margin {s_mid - thr:+.0f}')
    if not n_hi < thr < s_mid:
        failures.append(f'SILENCE_THRESHOLD {thr} is not between noise p95 ({n_hi:.0f}) '
                        f'and speech median ({s_mid:.0f})')

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
