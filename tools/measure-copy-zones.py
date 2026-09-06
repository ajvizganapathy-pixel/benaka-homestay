#!/usr/bin/env python3
"""Score where a block of copy can stand on a scrubbed clip.

Legibility on this site comes from placement alone — there is no scrim and no
text-shadow (see the kill-rules at the top of web/css/site.css), so each beat
has to put its copy where the picture behind it is darkest FOR THE WHOLE LEG.

Two rules learned the hard way and encoded here:

  * measure the RENDERED CLIP, not the still canvas. A spot that is dark on the
    poster can be a white wall four seconds in.
  * score each zone by its WORST (brightest) sampled moment, not its average.
    Optimising a midpoint is what once left a beat sitting on a white house.

Zones are given in viewport fractions and are converted through the same
`object-fit: cover` maths the browser uses, so a zone means the same thing here
as it does on the glass.

  python3 tools/measure-copy-zones.py <clip> <vw> <vh> [--rows N] [--cols N]

Prints a grid of worst-case luminance (0-255); lower is safer for light type.
"""
import subprocess, sys, json

def probe(path):
    out = subprocess.run(['ffprobe','-v','error','-select_streams','v:0',
        '-show_entries','stream=width,height,duration','-of','json',path],
        capture_output=True, text=True).stdout
    s = json.loads(out)['streams'][0]
    return int(s['width']), int(s['height']), float(s['duration'])

def frame_gray(path, t, w, h):
    raw = subprocess.run(['ffmpeg','-v','error','-ss',str(t),'-i',path,
        '-frames:v','1','-f','rawvideo','-pix_fmt','gray','-'],
        capture_output=True).stdout
    return raw if len(raw) >= w*h else None

def main():
    clip, vw, vh = sys.argv[1], float(sys.argv[2]), float(sys.argv[3])
    rows = int(sys.argv[sys.argv.index('--rows')+1]) if '--rows' in sys.argv else 5
    cols = int(sys.argv[sys.argv.index('--cols')+1]) if '--cols' in sys.argv else 3
    W, H, D = probe(clip)

    # object-fit: cover — the part of the frame the viewport actually shows.
    scale = max(vw/W, vh/H)
    visW, visH = vw/scale, vh/scale                      # in source pixels
    ox, oy = (W-visW)/2, (H-visH)/2

    times = [D*f for f in (0.25, 0.44, 0.63, 0.81)]      # ~2.0/3.5/5.0/6.5s of 8s
    frames = [f for f in (frame_gray(clip, t, W, H) for t in times) if f]
    if not frames:
        sys.exit('could not decode %s' % clip)

    print('%s  %dx%d  %.1fs   visible %.0fx%.0f of frame (%.0f%% of width)'
          % (clip, W, H, D, visW, visH, 100*visW/W))
    band_h = visH/rows
    band_w = visW/cols
    print('     ' + ''.join('%10s' % ('col%d' % c) for c in range(cols)))
    for r in range(rows):
        cells = []
        for c in range(cols):
            x0, x1 = int(ox + c*band_w), int(ox + (c+1)*band_w)
            y0, y1 = int(oy + r*band_h), int(oy + (r+1)*band_h)
            worst = 0
            for f in frames:
                tot = n = 0
                for y in range(y0, y1, 3):
                    row = f[y*W + x0: y*W + x1]
                    tot += sum(row); n += len(row)
                worst = max(worst, tot/max(n,1))
            cells.append(worst)
        print('row%d ' % r + ''.join('%10.0f' % v for v in cells))

if __name__ == '__main__':
    main()
