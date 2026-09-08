#!/usr/bin/env python3
"""Print an MP4's top-level atom types in file order, one per line.

Used by tools/test.sh to prove the property film is faststart: ffmpeg writes
`moov` after `mdat` unless -movflags +faststart is passed, and a browser cannot
paint a frame until it has read `moov`. The failure is invisible — the video
still plays, it just will not start until the whole file has arrived.

    python3 tools/atom-order.py assets/video/benaka-tour.mp4
"""
import os
import struct
import sys


def atoms(path):
    size = os.path.getsize(path)
    out, pos = [], 0
    with open(path, 'rb') as f:
        while pos < size:
            f.seek(pos)
            head = f.read(8)
            if len(head) < 8:
                break
            box = struct.unpack('>I', head[:4])[0]
            out.append(head[4:8].decode('latin1'))
            if box == 1:                     # 64-bit extended size
                box = struct.unpack('>Q', f.read(8))[0]
            if box == 0:                     # runs to end of file
                break
            pos += box
    return out


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit('usage: atom-order.py <file.mp4>')
    print('\n'.join(atoms(sys.argv[1])))
