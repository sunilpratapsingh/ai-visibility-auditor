"""
Chrome Web Store promotional screenshots for AI Visibility Auditor v2.1
Format: Feature headline + UI mockup overlay on light background with accent shapes
Brand: Navy #1a2340, Coral #e8453c, Light #f7f8fc
CWS size: 1280x800
"""
from PIL import Image, ImageDraw, ImageFont
import os, math

# ── Brand Colors ──
NAVY = (26, 35, 64)
CORAL = (232, 69, 60)
LIGHT_BG = (247, 248, 252)
WHITE = (255, 255, 255)
CARD_BG = (255, 255, 255)
GRAY = (120, 128, 145)
LIGHT_GRAY = (229, 231, 237)
GREEN = (34, 197, 94)
YELLOW = (234, 179, 8)
RED = (239, 68, 68)
ACCENT_BLOB = (232, 69, 60, 18)  # coral at ~7% opacity
NAVY_BLOB = (26, 35, 64, 15)

W, H = 1280, 800

wf = os.path.join(os.environ.get('WINDIR', 'C:\\Windows'), 'Fonts')

def font(size):
    for n in ['segoeui.ttf', 'arial.ttf']:
        try: return ImageFont.truetype(os.path.join(wf, n), size)
        except: pass
    return ImageFont.load_default()

def bold(size):
    for n in ['segoeuib.ttf', 'arialbd.ttf']:
        try: return ImageFont.truetype(os.path.join(wf, n), size)
        except: pass
    return font(size)

def semibold(size):
    for n in ['seguisb.ttf', 'segoeuib.ttf']:
        try: return ImageFont.truetype(os.path.join(wf, n), size)
        except: pass
    return bold(size)

def scolor(s):
    if s >= 80: return GREEN
    if s >= 50: return YELLOW
    return RED

def draw_blob(img, cx, cy, rx, ry, color):
    """Draw a soft elliptical blob on an RGBA layer and composite."""
    overlay = Image.new('RGBA', img.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    od.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=color)
    img.paste(Image.alpha_composite(img, overlay))
    return img

def draw_shadow_rect(d, bbox, radius, shadow_offset=4):
    """Draw a card with subtle shadow."""
    sx, sy, ex, ey = bbox
    # Shadow
    d.rounded_rectangle([sx + shadow_offset, sy + shadow_offset, ex + shadow_offset, ey + shadow_offset],
                        radius=radius, fill=(200, 200, 210, 60))
    # Card
    d.rounded_rectangle(bbox, radius=radius, fill=WHITE, outline=LIGHT_GRAY)

def draw_ring(d, cx, cy, r, score, color):
    """Draw a score ring gauge."""
    # Background circle
    d.ellipse([cx-r, cy-r, cx+r, cy+r], fill=LIGHT_GRAY)
    ir = int(r * 0.72)
    d.ellipse([cx-ir, cy-ir, cx+ir, cy+ir], fill=WHITE)
    # Score arc
    angle = int(score / 100 * 360)
    if angle > 0:
        d.arc([cx-r+2, cy-r+2, cx+r-2, cy+r-2], start=-90, end=-90+angle,
              fill=color, width=max(6, r - ir))

def base_image():
    """Create base light image with accent blobs."""
    img = Image.new('RGBA', (W, H), LIGHT_BG + (255,))
    return img

def ci(status, text, d, x, y, w=420):
    """Draw a check item row."""
    colors = {'pass': GREEN, 'warn': YELLOW, 'fail': RED, 'info': (160, 168, 180)}
    dot_color = colors.get(status, GRAY)
    d.ellipse([x, y + 4, x + 10, y + 14], fill=dot_color)
    d.text((x + 16, y), text, fill=NAVY, font=font(12))
    return y + 22

# ═══════════════════════════════════════════════════════════════
# SCREENSHOT 1: Overview — "Audit Any Page for AI Visibility"
# ═══════════════════════════════════════════════════════════════
img = base_image()
img = draw_blob(img, 200, 600, 350, 300, ACCENT_BLOB)
img = draw_blob(img, 1050, 200, 400, 350, NAVY_BLOB)
d = ImageDraw.Draw(img)

# Left side — headline
d.text((80, 180), 'Audit', fill=NAVY, font=bold(72))
d.text((80, 270), 'Any Page for', fill=NAVY, font=bold(48))
d.text((80, 330), 'AI Visibility', fill=CORAL, font=bold(48))

d.text((80, 420), '130+ checks across 15 categories.', fill=GRAY, font=font(20))
d.text((80, 450), '20 AI crawlers. Adaptive E-E-A-T.', fill=GRAY, font=font(20))
d.text((80, 480), 'Zero data collection. 100% free.', fill=GRAY, font=font(20))

# Feature pills
px = 80
for label in ['Schema', 'E-E-A-T', 'Citeability', 'Crawlers', 'Readability']:
    tw = len(label) * 10 + 24
    d.rounded_rectangle([px, 540, px + tw, 570], radius=15, fill=NAVY)
    d.text((px + 12, 546), label, fill=WHITE, font=semibold(13))
    px += tw + 10

# Right side — popup mockup card
cx, cy = 780, 80
cw, ch = 420, 640
draw_shadow_rect(d, [cx, cy, cx + cw, cy + ch], 16)

# Popup header bar
d.rounded_rectangle([cx, cy, cx + cw, cy + 44], radius=16, fill=NAVY)
d.rectangle([cx, cy + 28, cx + cw, cy + 44], fill=NAVY)
d.ellipse([cx + 14, cy + 13, cx + 28, cy + 27], fill=CORAL)
d.text((cx + 34, cy + 12), 'AI Visibility Auditor', fill=WHITE, font=bold(14))
d.text((cx + 300, cy + 12), 'v2.1', fill=(180, 180, 200), font=font(10))

# Score section
sy = cy + 54
d.rounded_rectangle([cx + 10, sy, cx + cw - 10, sy + 80], radius=10, fill=(247, 248, 252, 255), outline=LIGHT_GRAY)
draw_ring(d, cx + 55, sy + 40, 28, 82, GREEN)
d.text((cx + 42, sy + 30), '82', fill=GREEN, font=bold(18))
d.text((cx + 96, sy + 16), 'AI-Ready', fill=GREEN, font=bold(18))
d.text((cx + 96, sy + 40), 'Well optimized for AI systems', fill=GRAY, font=font(12))

# Category rows
cats = [
    ('Robots & Crawler Access', 95, GREEN),
    ('AI Discovery Files', 100, GREEN),
    ('Sitemap & Indexing', 90, GREEN),
    ('Schema & Structured Data', 85, GREEN),
    ('Content Structure', 78, YELLOW),
    ('Content Readability', 72, YELLOW),
    ('Entity & Authority', 75, YELLOW),
    ('E-E-A-T Signals', 68, YELLOW),
    ('Content Citeability', 72, YELLOW),
    ('Promotional Tone', 88, GREEN),
    ('Technical AI-Readiness', 80, GREEN),
    ('Source Authority', 65, YELLOW),
    ('Content Freshness', 70, YELLOW),
]
ry = sy + 92
for name, score, color in cats:
    d.ellipse([cx + 18, ry + 4, cx + 26, ry + 12], fill=color)
    d.text((cx + 32, ry - 1), name, fill=NAVY, font=font(12))
    d.text((cx + cw - 60, ry - 1), str(score), fill=color, font=bold(12))
    # Progress bar
    bx = cx + cw - 120
    d.rounded_rectangle([bx, ry + 3, bx + 50, ry + 9], radius=3, fill=LIGHT_GRAY)
    fw = int(50 * score / 100)
    if fw > 0:
        d.rounded_rectangle([bx, ry + 3, bx + fw, ry + 9], radius=3, fill=color)
    ry += 22

# Top fixes preview
ry += 8
d.text((cx + 14, ry), 'Top Fixes', fill=NAVY, font=bold(13))
ry += 20
for title in ['Add author byline with credentials', 'Add publication & updated dates', 'Add question-style headings']:
    d.ellipse([cx + 18, ry + 3, cx + 26, ry + 11], fill=RED)
    d.text((cx + 32, ry - 1), title, fill=GRAY, font=font(11))
    ry += 20

img = img.convert('RGB')
img.save(os.path.join(os.path.dirname(__file__), 'screenshot-1-overview.png'))
print('screenshot-1-overview.png OK')


# ═══════════════════════════════════════════════════════════════
# SCREENSHOT 2: "20 AI Crawlers Tracked"
# ═══════════════════════════════════════════════════════════════
img = base_image()
img = draw_blob(img, 300, 400, 350, 400, NAVY_BLOB)
img = draw_blob(img, 1000, 600, 300, 250, ACCENT_BLOB)
d = ImageDraw.Draw(img)

d.text((80, 180), 'Track', fill=NAVY, font=bold(72))
d.text((80, 270), '20 AI Crawlers', fill=CORAL, font=bold(48))
d.text((80, 340), 'Instantly', fill=NAVY, font=bold(48))

d.text((80, 430), 'GPTBot, ClaudeBot, PerplexityBot,', fill=GRAY, font=font(20))
d.text((80, 460), 'DeepSeekBot, GrokBot & 15 more.', fill=GRAY, font=font(20))
d.text((80, 500), 'See which AI systems can crawl', fill=GRAY, font=font(18))
d.text((80, 530), 'any website — training vs search.', fill=GRAY, font=font(18))

# Crawler table card
tx, ty = 580, 80
tw, th = 620, 640
draw_shadow_rect(d, [tx, ty, tx + tw, ty + th], 16)

# Table header
d.rounded_rectangle([tx, ty, tx + tw, ty + 38], radius=16, fill=NAVY)
d.rectangle([tx, ty + 24, tx + tw, ty + 38], fill=NAVY)
d.text((tx + 20, ty + 10), 'Crawler', fill=WHITE, font=bold(13))
d.text((tx + 220, ty + 10), 'Owner', fill=WHITE, font=bold(13))
d.text((tx + 380, ty + 10), 'Type', fill=WHITE, font=bold(13))
d.text((tx + 500, ty + 10), 'Status', fill=WHITE, font=bold(13))

bots = [
    ('GPTBot', 'OpenAI', 'Training', 'Blocked', RED),
    ('OAI-SearchBot', 'OpenAI', 'Search', 'Allowed', GREEN),
    ('ChatGPT-User', 'OpenAI', 'Search', 'Allowed', GREEN),
    ('ClaudeBot', 'Anthropic', 'Training', 'Blocked', RED),
    ('anthropic-ai', 'Anthropic', 'Training', 'Allowed', GREEN),
    ('PerplexityBot', 'Perplexity', 'Search', 'Allowed', GREEN),
    ('Google-Extended', 'Google AI', 'Training', 'Blocked', RED),
    ('Amazonbot', 'Amazon', 'Training', 'Allowed', GREEN),
    ('Applebot-Extended', 'Apple AI', 'Training', 'Partial', YELLOW),
    ('DeepSeekBot', 'DeepSeek', 'Training', 'Allowed', GREEN),
    ('GrokBot', 'xAI', 'Search', 'Allowed', GREEN),
    ('Meta-ExternalAgent', 'Meta', 'Training', 'Blocked', RED),
    ('Bytespider', 'ByteDance', 'Training', 'Blocked', RED),
    ('CCBot', 'Common Crawl', 'Training', 'Blocked', RED),
    ('cohere-ai', 'Cohere', 'Training', 'Allowed', GREEN),
    ('DuckAssistBot', 'DuckDuckGo', 'Search', 'Allowed', GREEN),
    ('YouBot', 'You.com', 'Search', 'Allowed', GREEN),
    ('FacebookBot', 'Meta', 'Training', 'Blocked', RED),
]

ry = ty + 48
for name, owner, ctype, status, color in bots[:16]:
    bg = (250, 250, 252, 255) if bots.index((name, owner, ctype, status, color)) % 2 == 0 else WHITE + (255,)
    d.rectangle([tx + 1, ry - 2, tx + tw - 1, ry + 22], fill=bg)
    d.text((tx + 20, ry), name, fill=NAVY, font=semibold(12))
    d.text((tx + 220, ry), owner, fill=GRAY, font=font(12))
    # Type pill
    tc = GREEN if ctype == 'Search' else (180, 140, 50)
    d.rounded_rectangle([tx + 370, ry - 1, tx + 370 + 72, ry + 17], radius=9, fill=(240, 242, 246, 255))
    d.text((tx + 382, ry + 1), ctype, fill=tc, font=font(10))
    # Status
    d.text((tx + 500, ry), status, fill=color, font=bold(12))
    ry += 26

# Summary bar
ry += 10
d.rounded_rectangle([tx + 10, ry, tx + tw - 10, ry + 36], radius=8, fill=(247, 248, 252, 255), outline=LIGHT_GRAY)
d.text((tx + 24, ry + 8), 'Summary:', fill=NAVY, font=bold(13))
d.text((tx + 120, ry + 8), '10 Allowed', fill=GREEN, font=bold(13))
d.text((tx + 240, ry + 8), '7 Blocked', fill=RED, font=bold(13))
d.text((tx + 350, ry + 8), '1 Partial', fill=YELLOW, font=bold(13))

img = img.convert('RGB')
img.save(os.path.join(os.path.dirname(__file__), 'screenshot-2-crawlers.png'))
print('screenshot-2-crawlers.png OK')


# ═══════════════════════════════════════════════════════════════
# SCREENSHOT 3: "Adaptive E-E-A-T Scoring"
# ═══════════════════════════════════════════════════════════════
img = base_image()
img = draw_blob(img, 250, 500, 300, 350, ACCENT_BLOB)
img = draw_blob(img, 1050, 300, 350, 300, NAVY_BLOB)
d = ImageDraw.Draw(img)

d.text((80, 160), 'Adaptive', fill=NAVY, font=bold(72))
d.text((80, 250), 'E-E-A-T', fill=CORAL, font=bold(72))
d.text((80, 340), 'Scoring', fill=NAVY, font=bold(48))

d.text((80, 420), 'Different page types need different', fill=GRAY, font=font(20))
d.text((80, 450), 'trust signals. Blog posts weight author', fill=GRAY, font=font(20))
d.text((80, 480), 'credentials. Products weight reviews.', fill=GRAY, font=font(20))

# Page type cards
pty = 540
for i, (ptype, desc, pts) in enumerate([
    ('Blog', 'Author, date, citations', '18 / 14 / 15'),
    ('Product', 'Reviews, trust badges', '19 / 18 / 12'),
    ('Service', 'Credentials, policies', '16 / 15 / 12'),
    ('Homepage', 'Org trust, policies', '18 / 15 / 12'),
]):
    bx = 80 + i * 130
    d.rounded_rectangle([bx, pty, bx + 120, pty + 70], radius=10, fill=WHITE, outline=LIGHT_GRAY)
    d.text((bx + 10, pty + 8), ptype, fill=CORAL, font=bold(15))
    d.text((bx + 10, pty + 30), desc, fill=GRAY, font=font(10))
    d.text((bx + 10, pty + 46), pts, fill=NAVY, font=font(9))

# E-E-A-T detail card
cx, cy = 640, 80
cw, ch = 560, 640
draw_shadow_rect(d, [cx, cy, cx + cw, cy + ch], 16)

# Card header
d.rounded_rectangle([cx, cy, cx + cw, cy + 44], radius=16, fill=NAVY)
d.rectangle([cx, cy + 28, cx + cw, cy + 44], fill=NAVY)
d.text((cx + 20, cy + 12), 'E-E-A-T Signals — Blog Post', fill=WHITE, font=bold(16))
d.text((cx + 380, cy + 14), '68/100', fill=YELLOW, font=bold(14))

# Context banner
by = cy + 54
d.rounded_rectangle([cx + 12, by, cx + cw - 12, by + 32], radius=6, fill=(247, 248, 252, 255))
d.rounded_rectangle([cx + 12, by, cx + 15, by + 32], radius=2, fill=CORAL)
d.text((cx + 24, by + 8), 'Blog — author, date, and citations weighted heavily', fill=NAVY, font=semibold(12))

# Author section
sy = by + 44
d.text((cx + 16, sy), 'Author Signals', fill=NAVY, font=bold(14))
sy += 24
sy = ci('pass', 'Author byline detected (+18 pts)', d, cx + 20, sy)
sy = ci('pass', 'Author bio found (+12 pts)', d, cx + 20, sy)
sy = ci('warn', 'No credentials detected (+0 / 10 pts)', d, cx + 20, sy)
sy = ci('pass', 'Publication date visible (+14 pts)', d, cx + 20, sy)

sy += 12
d.text((cx + 16, sy), 'Trust Signals', fill=NAVY, font=bold(14))
sy += 24
sy = ci('warn', '2 external citations (+8 / 15 pts)', d, cx + 20, sy)
sy = ci('info', 'No editorial policy (+0 / 8 pts)', d, cx + 20, sy)
sy = ci('info', 'No review signals (+0 / 10 pts)', d, cx + 20, sy)
sy = ci('info', 'No trust badges (+0 / 7 pts)', d, cx + 20, sy)
sy = ci('pass', 'Privacy policy found (+4 pts)', d, cx + 20, sy)
sy = ci('info', 'No terms link (+0 / 2 pts)', d, cx + 20, sy)

# YMYL section
sy += 16
d.rounded_rectangle([cx + 12, sy, cx + cw - 12, sy + 60], radius=8, fill=(255, 251, 235, 255), outline=(253, 230, 138))
d.text((cx + 24, sy + 8), 'YMYL Detection', fill=(161, 98, 7), font=bold(13))
d.text((cx + 24, sy + 28), 'Medical/financial terms found → extra scrutiny applied.', fill=(161, 98, 7), font=font(12))
d.text((cx + 24, sy + 44), 'Missing credentials & citations penalized -10 pts.', fill=(161, 98, 7), font=font(12))

# Comparison at bottom
sy += 76
d.text((cx + 16, sy), 'Same page, different profile:', fill=GRAY, font=font(12))
sy += 20
for label, score, col in [('As Blog: 68', 68, YELLOW), ('As Product: 81', 81, GREEN), ('As Homepage: 74', 74, YELLOW)]:
    d.text((cx + 20, sy), label, fill=NAVY, font=semibold(12))
    bx = cx + 160
    d.rounded_rectangle([bx, sy + 2, bx + 120, sy + 12], radius=4, fill=LIGHT_GRAY)
    fw = int(120 * int(score) / 100)
    d.rounded_rectangle([bx, sy + 2, bx + fw, sy + 12], radius=4, fill=col)
    sy += 22

img = img.convert('RGB')
img.save(os.path.join(os.path.dirname(__file__), 'screenshot-3-eeat.png'))
print('screenshot-3-eeat.png OK')


# ═══════════════════════════════════════════════════════════════
# SCREENSHOT 4: "Actionable Fixes Sorted by Impact"
# ═══════════════════════════════════════════════════════════════
img = base_image()
img = draw_blob(img, 280, 350, 350, 380, NAVY_BLOB)
img = draw_blob(img, 950, 550, 300, 250, ACCENT_BLOB)
d = ImageDraw.Draw(img)

d.text((80, 180), 'Get', fill=NAVY, font=bold(72))
d.text((80, 270), 'Actionable', fill=CORAL, font=bold(58))
d.text((80, 340), 'Fixes', fill=NAVY, font=bold(72))

d.text((80, 440), 'Every issue sorted by score impact.', fill=GRAY, font=font(20))
d.text((80, 470), 'See exactly how many points each', fill=GRAY, font=font(20))
d.text((80, 500), 'fix adds and how hard it is.', fill=GRAY, font=font(20))

# Effort legend
for i, (label, col) in enumerate([('Quick', GREEN), ('Medium', YELLOW), ('Hard', RED)]):
    bx = 80 + i * 110
    d.rounded_rectangle([bx, 550, bx + 95, 578], radius=14, fill=col + (40,))
    d.text((bx + 14, 555), label, fill=col, font=bold(13))

# Fixes card
cx, cy = 600, 60
cw, ch = 600, 680
draw_shadow_rect(d, [cx, cy, cx + cw, cy + ch], 16)

d.rounded_rectangle([cx, cy, cx + cw, cy + 44], radius=16, fill=NAVY)
d.rectangle([cx, cy + 28, cx + cw, cy + 44], fill=NAVY)
d.text((cx + 20, cy + 12), 'Top Fixes — Sorted by Impact', fill=WHITE, font=bold(16))

fixes = [
    ('Add author byline with credentials', '+5 pts', 'Quick', 'E-E-A-T', 'high'),
    ('Add publication & last-updated dates', '+4 pts', 'Quick', 'E-E-A-T', 'high'),
    ('Add question-style H2 headings', '+4 pts', 'Quick', 'Content', 'high'),
    ('Add 3+ external citations to sources', '+4 pts', 'Medium', 'E-E-A-T', 'medium'),
    ('Add TL;DR or Key Takeaways section', '+3 pts', 'Quick', 'Citeability', 'medium'),
    ('Add clear definitions for key terms', '+3 pts', 'Quick', 'Citeability', 'medium'),
    ('Add Speakable schema markup', '+4 pts', 'Quick', 'Schema', 'medium'),
    ('Reduce passive voice below 10%', '+2 pts', 'Medium', 'Readability', 'low'),
    ('Add FAQ schema for Q&A content', '+3 pts', 'Quick', 'Schema', 'low'),
    ('Add trust badges or certifications', '+2 pts', 'Medium', 'E-E-A-T', 'low'),
]

ry = cy + 58
for title, impact, effort, cat, priority in fixes:
    # Priority indicator
    pcol = RED if priority == 'high' else YELLOW if priority == 'medium' else (160, 168, 180)
    d.rounded_rectangle([cx + 12, ry - 4, cx + cw - 12, ry + 52], radius=8, fill=WHITE, outline=(240, 242, 246))
    d.rounded_rectangle([cx + 12, ry - 4, cx + 16, ry + 52], radius=4, fill=pcol)

    d.text((cx + 24, ry + 2), title, fill=NAVY, font=semibold(13))

    # Impact badge
    d.rounded_rectangle([cx + 24, ry + 24, cx + 90, ry + 42], radius=6, fill=GREEN + (30,))
    d.text((cx + 30, ry + 26), impact, fill=GREEN, font=bold(11))

    # Effort badge
    ecol = GREEN if effort == 'Quick' else YELLOW
    d.rounded_rectangle([cx + 98, ry + 24, cx + 158, ry + 42], radius=6, fill=ecol + (30,))
    d.text((cx + 106, ry + 26), effort, fill=ecol, font=font(11))

    # Category
    d.text((cx + 170, ry + 27), cat, fill=GRAY, font=font(10))

    ry += 62

img = img.convert('RGB')
img.save(os.path.join(os.path.dirname(__file__), 'screenshot-4-fixes.png'))
print('screenshot-4-fixes.png OK')


# ═══════════════════════════════════════════════════════════════
# SCREENSHOT 5: "Full Report in One Click"
# ═══════════════════════════════════════════════════════════════
img = base_image()
img = draw_blob(img, 250, 400, 300, 350, ACCENT_BLOB)
img = draw_blob(img, 1000, 250, 350, 300, NAVY_BLOB)
d = ImageDraw.Draw(img)

d.text((80, 180), 'Full Report', fill=NAVY, font=bold(60))
d.text((80, 260), 'in One Click', fill=CORAL, font=bold(52))

d.text((80, 350), 'Detailed audit report opens in a new tab.', fill=GRAY, font=font(20))
d.text((80, 380), 'Copy as Markdown. Export as JSON.', fill=GRAY, font=font(20))
d.text((80, 410), 'Print-friendly. Share with your team.', fill=GRAY, font=font(20))

# Export buttons
for i, (label, bg) in enumerate([('Copy MD', NAVY), ('JSON', NAVY), ('Full Report', CORAL)]):
    bx = 80 + i * 150
    d.rounded_rectangle([bx, 470, bx + 135, 505], radius=8, fill=bg)
    d.text((bx + 20, 478), label, fill=WHITE, font=bold(15))

# Privacy note
d.text((80, 540), 'No account needed. No data collected.', fill=GRAY, font=font(16))
d.text((80, 565), '100% client-side. Works offline.', fill=GRAY, font=font(16))

# Report preview card
cx, cy = 620, 60
cw, ch = 600, 680
draw_shadow_rect(d, [cx, cy, cx + cw, cy + ch], 16)

# Report header
d.rounded_rectangle([cx, cy, cx + cw, cy + 70], radius=16, fill=WHITE, outline=LIGHT_GRAY)
d.rectangle([cx, cy + 50, cx + cw, cy + 70], fill=WHITE)
d.line([(cx, cy + 70), (cx + cw, cy + 70)], fill=LIGHT_GRAY)
d.text((cx + 20, cy + 14), 'AI Visibility Audit Report', fill=NAVY, font=bold(20))
d.text((cx + 20, cy + 42), 'example.com | April 2026', fill=GRAY, font=font(12))

# Score section
sy = cy + 84
draw_ring(d, cx + 60, sy + 40, 32, 82, GREEN)
d.text((cx + 46, sy + 30), '82', fill=GREEN, font=bold(20))
d.text((cx + 110, sy + 14), 'AI-Ready', fill=GREEN, font=bold(20))
d.text((cx + 110, sy + 40), 'Well optimized for AI systems', fill=GRAY, font=font(13))

# Category score grid
sy += 90
report_cats = [
    ('Robots & Crawlers', 95), ('AI Discovery', 100), ('Sitemap', 90),
    ('Schema', 85), ('Content', 78), ('Readability', 72),
    ('Entity', 75), ('E-E-A-T', 68), ('Citeability', 72),
    ('Promo Tone', 88), ('Technical', 80), ('Authority', 65),
]
for i, (name, score) in enumerate(report_cats):
    col = i % 3
    row = i // 3
    x = cx + 12 + col * 192
    y = sy + row * 44
    c = scolor(score)
    d.rounded_rectangle([x, y, x + 184, y + 38], radius=6, fill=(247, 248, 252, 255), outline=LIGHT_GRAY)
    d.text((x + 8, y + 4), name, fill=GRAY, font=font(10))
    d.text((x + 140, y + 2), str(score), fill=c, font=bold(18))
    # Mini bar
    d.rounded_rectangle([x + 8, y + 26, x + 176, y + 31], radius=2, fill=LIGHT_GRAY)
    fw = int(168 * score / 100)
    if fw > 0:
        d.rounded_rectangle([x + 8, y + 26, x + 8 + fw, y + 31], radius=2, fill=c)

# Top fixes in report
sy += 190
d.line([(cx + 12, sy), (cx + cw - 12, sy)], fill=LIGHT_GRAY)
sy += 12
d.text((cx + 16, sy), 'Top Fixes', fill=NAVY, font=bold(15))
sy += 28
for n, (title, imp) in enumerate([
    ('Add author byline with credentials', '+5'),
    ('Add publication & updated dates', '+4'),
    ('Add question-style headings', '+4'),
    ('Add external citations', '+4'),
    ('Add TL;DR section', '+3'),
], 1):
    d.ellipse([cx + 20, sy + 2, cx + 36, sy + 18], fill=RED if n <= 2 else YELLOW)
    d.text((cx + 24, sy + 2), str(n), fill=WHITE, font=bold(10))
    d.text((cx + 42, sy), title, fill=NAVY, font=font(12))
    d.text((cx + 42, sy + 16), imp + ' pts | Quick', fill=GRAY, font=font(10))
    sy += 36

# Footer
d.text((cx + 120, cy + ch - 28), 'Generated by AI Visibility Auditor v2.1', fill=(180, 186, 200), font=font(11))

img = img.convert('RGB')
img.save(os.path.join(os.path.dirname(__file__), 'screenshot-5-report.png'))
print('screenshot-5-report.png OK')


# ═══════════════════════════════════════════════════════════════
# SMALL PROMO (440x280)
# ═══════════════════════════════════════════════════════════════
img = Image.new('RGBA', (440, 280), WHITE + (255,))
img = draw_blob(img, 80, 200, 120, 120, ACCENT_BLOB)
img = draw_blob(img, 380, 80, 100, 100, NAVY_BLOB)
d = ImageDraw.Draw(img)

draw_ring(d, 220, 80, 40, 82, GREEN)
d.text((206, 68), '82', fill=GREEN, font=bold(22))

# Center all text
title_font = bold(20)
sub_font = font(14)
bottom_font = font(12)
title_text = 'AI Visibility Auditor'
sub_text = 'Audit any page for AI readiness'
bottom_text = '130+ checks | 100% free'
title_bbox = d.textbbox((0, 0), title_text, font=title_font)
sub_bbox = d.textbbox((0, 0), sub_text, font=sub_font)
bottom_bbox = d.textbbox((0, 0), bottom_text, font=bottom_font)
d.text(((440 - (title_bbox[2] - title_bbox[0])) // 2, 140), title_text, fill=NAVY, font=title_font)
d.text(((440 - (sub_bbox[2] - sub_bbox[0])) // 2, 172), sub_text, fill=GRAY, font=sub_font)

# Category dots — centered
dot_count = 13
dot_w = dot_count * 16 - 6
dot_start = (440 - dot_w) // 2
for i in range(dot_count):
    c = GREEN if i in [0, 1, 2, 3, 9, 10] else YELLOW
    d.ellipse([dot_start + i * 16, 210, dot_start + 10 + i * 16, 220], fill=c)

d.text(((440 - (bottom_bbox[2] - bottom_bbox[0])) // 2, 235), bottom_text, fill=GRAY, font=bottom_font)

img = img.convert('RGB')
img.save(os.path.join(os.path.dirname(__file__), 'promo-small-440x280.png'))
print('promo-small-440x280.png OK')


# ═══════════════════════════════════════════════════════════════
# MARQUEE PROMO (1400x560)
# ═══════════════════════════════════════════════════════════════
img = Image.new('RGBA', (1400, 560), WHITE + (255,))
img = draw_blob(img, 300, 350, 350, 300, ACCENT_BLOB)
img = draw_blob(img, 1100, 200, 350, 250, NAVY_BLOB)
d = ImageDraw.Draw(img)

d.text((80, 80), 'AI Visibility', fill=NAVY, font=bold(54))
d.text((80, 148), 'Auditor', fill=CORAL, font=bold(54))
d.text((80, 230), '130+ checks. 20 crawlers. Adaptive E-E-A-T.', fill=GRAY, font=font(20))
d.text((80, 260), 'The deepest free AI visibility audit for any page.', fill=GRAY, font=font(20))

# Feature pills
px = 80
for label in ['Schema', 'E-E-A-T', 'Citeability', 'Crawlers', 'Readability', 'Tone']:
    tw = len(label) * 10 + 24
    d.rounded_rectangle([px, 310, px + tw, 340], radius=15, fill=NAVY)
    d.text((px + 12, 316), label, fill=WHITE, font=semibold(13))
    px += tw + 10

d.rounded_rectangle([80, 370, 200, 402], radius=8, fill=GREEN)
d.text((100, 378), '100% Free', fill=WHITE, font=bold(15))
d.text((80, 420), 'No account. No data collected. Client-side only.', fill=GRAY, font=font(14))

# Right side — mini popup
rpx = 780
draw_shadow_rect(d, [rpx, 40, rpx + 540, 520], 14)
d.rounded_rectangle([rpx, 40, rpx + 540, 78], radius=14, fill=NAVY)
d.rectangle([rpx, 64, rpx + 540, 78], fill=NAVY)
d.ellipse([rpx + 14, 52, rpx + 28, 66], fill=CORAL)
d.text((rpx + 34, 50), 'AI Visibility Auditor', fill=WHITE, font=bold(14))

# Score
draw_ring(d, rpx + 60, 120, 32, 82, GREEN)
d.text((rpx + 46, 110), '82', fill=GREEN, font=bold(20))
d.text((rpx + 106, 100), 'AI-Ready', fill=GREEN, font=bold(18))
d.text((rpx + 106, 124), 'Well optimized for AI systems', fill=GRAY, font=font(12))

# Categories
ry = 164
for name, score, color in [
    ('Robots & Crawler Access', 95, GREEN),
    ('AI Discovery Files', 100, GREEN),
    ('Schema & Structured Data', 85, GREEN),
    ('Content Structure', 78, YELLOW),
    ('Content Readability', 72, YELLOW),
    ('E-E-A-T Signals', 68, YELLOW),
    ('Content Citeability', 72, YELLOW),
    ('Promotional Tone', 88, GREEN),
    ('Technical AI-Readiness', 80, GREEN),
    ('Source Authority', 65, YELLOW),
    ('Content Freshness', 70, YELLOW),
]:
    d.ellipse([rpx + 18, ry + 4, rpx + 26, ry + 12], fill=color)
    d.text((rpx + 32, ry - 1), name, fill=NAVY, font=font(12))
    d.text((rpx + 450, ry - 1), str(score), fill=color, font=bold(12))
    bx = rpx + 390
    d.rounded_rectangle([bx, ry + 3, bx + 50, ry + 9], radius=3, fill=LIGHT_GRAY)
    fw = int(50 * score / 100)
    if fw > 0:
        d.rounded_rectangle([bx, ry + 3, bx + fw, ry + 9], radius=3, fill=color)
    ry += 24

img = img.convert('RGB')
img.save(os.path.join(os.path.dirname(__file__), 'promo-marquee-1400x560.png'))
print('promo-marquee-1400x560.png OK')

print('\nALL 7 IMAGES GENERATED')
