#!/usr/bin/env python3
"""Inventory original images and build a local-only gallery, using the standard library."""
import hashlib
import html
import json
import struct
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]


def image_size(data):
    if data.startswith(b'\x89PNG\r\n\x1a\n'):
        width, height = struct.unpack_from('>II', data, 16)
        mode = {0: 'L', 2: 'RGB', 3: 'P', 4: 'LA', 6: 'RGBA'}[data[25]]
        return width, height, mode
    assert data.startswith(b'\xff\xd8'), 'Only PNG and JPEG expected'
    pos = 2
    while pos < len(data):
        assert data[pos] == 0xff, ('Invalid JPEG marker', pos)
        while data[pos] == 0xff:
            pos += 1
        marker = data[pos]
        pos += 1
        if marker in [0x01, *range(0xd0, 0xda)]:
            continue
        size = struct.unpack_from('>H', data, pos)[0]
        if marker in [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]:
            height, width = struct.unpack_from('>HH', data, pos + 3)
            channels = data[pos + 7]
            return width, height, {1: 'L', 3: 'RGB', 4: 'CMYK'}.get(channels, str(channels))
        pos += size
    raise ValueError('JPEG dimensions not found')


def main():
    source = ROOT / 'extracted'
    out = ROOT / 'analysis'
    rows = []
    for path in sorted((source / 'res').rglob('*')):
        if path.suffix not in ['.png', '.jpg']:
            continue
        data = path.read_bytes()
        width, height, mode = image_size(data)
        rows.append({'path': str(path.relative_to(source)), 'width': width,
                     'height': height, 'mode': mode, 'bytes': len(data),
                     'sha256': hashlib.sha256(data).hexdigest()})
    (out / 'image-inventory.json').write_text(json.dumps(rows, indent=2) + '\n')
    cards = []
    for row in rows:
        path = row['path']
        url = '../extracted/' + quote(path)
        display = 'backdrop' if row['height'] > 300 else 'icon'
        cards.append(f'<figure class="{display}"><img src="{url}" alt="{html.escape(path)}" '
                     f'width="{row["width"]}" height="{row["height"]}">'
                     f'<figcaption><a href="{url}">{html.escape(path)}</a>'
                     f'<span>{row["width"]} × {row["height"]} · {row["bytes"]:,} bytes</span>'
                     '</figcaption></figure>')
    audio = []
    for path in sorted((source / 'res/raw').glob('*')):
        url = '../extracted/' + quote(str(path.relative_to(source)))
        audio.append(f'<li><a href="{url}">{html.escape(path.name)}</a> '
                     f'({path.stat().st_size:,} bytes)</li>')
    document = '''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' file:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>Kingdoms Live 1.6.3 — original asset reference</title>
<style>
body{background:#191b1f;color:#eee;font:16px system-ui,sans-serif;margin:0;padding:24px;line-height:1.5}
main{max-width:1200px;margin:auto}h1{font-size:1.8rem}a{color:#9bcbff}p{max-width:80ch}
.gallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:16px}
figure{margin:0;padding:16px;background:#262930;border:1px solid #454951;border-radius:8px;overflow-wrap:anywhere}
figure img{max-width:100%;height:auto;display:block;margin:0 auto 16px}.icon img{object-fit:contain}
figcaption{font-size:.8rem}figcaption span{display:block;color:#bbb}li{margin:.5rem 0}
</style></head><body><main>
<h1>Kingdoms Live 1.6.3: original assets</h1>
<p>Local reference gallery of all 30 unchanged raster images extracted from the supplied APK.
These are original resources, not captured game screens. Backgrounds do not contain the missing server interface.
No scripts, remote links, or remote assets are loaded.</p>
<p>See <a href="../../ORIGINAL_GAME_SPEC.md">ORIGINAL_GAME_SPEC.md</a> for verified placement and unknowns.</p>
<div class="gallery">''' + '\n'.join(cards) + '''</div>
<h2>Bundled audio</h2><p>These links open the original files. Their historical event mapping and browser playback compatibility remain unverified.</p>
<ul>''' + '\n'.join(audio) + '''</ul></main></body></html>\n'''
    (out / 'asset-gallery.html').write_text(document)
    print(f'Inventoried {len(rows)} images; linked {len(audio)} original audio files; wrote local-only gallery.')


if __name__ == '__main__':
    main()
