"""
Generate bold, visible toolbar icons for AI Visibility Auditor.
Design: Score gauge arc (coral) + "AI" text on navy circle — pops on dark & light toolbars.
Sizes: 16x16, 48x48, 128x128 (+ store icon)
"""
from PIL import Image, ImageDraw, ImageFont
import os, math

NAVY = (26, 35, 64)
CORAL = (232, 69, 60)
WHITE = (255, 255, 255)
GREEN = (34, 197, 94)
LIGHT = (247, 248, 252)

wf = os.path.join(os.environ.get('WINDIR', 'C:\\Windows'), 'Fonts')

def bold(size):
    for n in ['segoeuib.ttf', 'arialbd.ttf']:
        try: return ImageFont.truetype(os.path.join(wf, n), size)
        except: pass
    return ImageFont.load_default()

def font(size):
    for n in ['segoeui.ttf', 'arial.ttf']:
        try: return ImageFont.truetype(os.path.join(wf, n), size)
        except: pass
    return ImageFont.load_default()


def draw_icon(size):
    """
    Icon concept: Navy filled circle with coral score arc (270°) and white "AI" text.
    The arc represents auditing/scoring, coral pops on any toolbar.
    """
    # Use 4x supersampling for crisp edges
    ss = 4
    s = size * ss
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    pad = 0
    cx, cy = s // 2, s // 2

    # Navy filled circle — full bleed, no padding
    d.ellipse([pad, pad, s - 1, s - 1], fill=NAVY)

    # Coral score arc — thick, edge-to-edge
    arc_width = max(int(s * 0.12), 3)
    arc_pad = int(s * 0.02)
    arc_box = [arc_pad, arc_pad, s - arc_pad, s - arc_pad]
    # Dark background ring
    d.arc(arc_box, start=0, end=360, fill=(40, 50, 80), width=arc_width)
    # Coral arc — 270°
    d.arc(arc_box, start=-225, end=45, fill=CORAL, width=arc_width)
    # Green tip
    d.arc(arc_box, start=40, end=55, fill=GREEN, width=arc_width)

    # "AI" text — large, fills the circle
    ai_font = bold(int(s * 0.48))
    text = 'AI'
    bbox = d.textbbox((0, 0), text, font=ai_font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    tx = (s - tw) // 2
    ty = (s - th) // 2 - int(s * 0.02)
    d.text((tx, ty), text, fill=WHITE, font=ai_font)

    # Downsample with antialiasing
    img = img.resize((size, size), Image.LANCZOS)
    return img


# Generate all sizes
src_dir = os.path.join(os.path.dirname(__file__), '..', 'src', 'icons')
store_dir = os.path.dirname(__file__)

for size in [16, 48, 128]:
    icon = draw_icon(size)
    path = os.path.join(src_dir, f'icon-{size}.png')
    icon.save(path)
    print(f'icon-{size}.png OK ({path})')

# Store icon (128x128 copy)
store_icon = draw_icon(128)
store_icon.save(os.path.join(store_dir, 'store-icon-128x128.png'))
print('store-icon-128x128.png OK')

print('\nALL ICONS GENERATED')
