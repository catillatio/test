"""Combine actual HTTP screenshots for review; never edits production artwork."""
from pathlib import Path
from PIL import Image, ImageDraw
root = Path('docs/level100-beta/screenshots')
for category in ('weapon', 'armor', 'spell'):
    before = Image.open(root / f'390-before-{category}.jpg').convert('RGB')
    after = Image.open(root / f'390-after-{category}.jpg').convert('RGB')
    assert before.size == after.size == (390, 844)
    sheet = Image.new('RGB', (780, 872), '#181817')
    draw = ImageDraw.Draw(sheet)
    draw.text((12, 8), 'BEFORE / unchanged legacy presentation', fill='#ead9ab')
    draw.text((402, 8), 'AFTER CUTOVER / same numerical item slots', fill='#ead9ab')
    sheet.paste(before, (0, 28)); sheet.paste(after, (390, 28))
    sheet.save(root / f'compare-390-{category}.webp', lossless=True)
print('REVIEW_COMPARISONS: PASS; actual captures, no illustrations modified.')
