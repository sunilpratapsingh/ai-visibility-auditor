from PIL import Image, ImageDraw, ImageFont
import os

BG_DARK = (15, 17, 23)
BG_CARD = (22, 24, 32)
PURPLE = (124, 108, 255)
GREEN = (34, 197, 94)
YELLOW = (234, 179, 8)
RED = (239, 68, 68)
WHITE = (255, 255, 255)
GRAY = (136, 136, 136)
LIGHT = (200, 204, 212)
BORDER = (35, 38, 48)

wf = os.path.join(os.environ.get('WINDIR', 'C:\\Windows'), 'Fonts')

def f(s):
    for n in ['segoeui.ttf', 'arial.ttf']:
        try:
            return ImageFont.truetype(os.path.join(wf, n), s)
        except:
            pass
    return ImageFont.load_default()

def b(s):
    for n in ['segoeuib.ttf', 'arialbd.ttf']:
        try:
            return ImageFont.truetype(os.path.join(wf, n), s)
        except:
            pass
    return f(s)

def ring(d, cx, cy, r, sc, col):
    d.ellipse([cx-r, cy-r, cx+r, cy+r], fill=BORDER)
    ir = int(r * 0.72)
    d.ellipse([cx-ir, cy-ir, cx+ir, cy+ir], fill=BG_CARD)
    a = int(sc / 100 * 360)
    if a > 0:
        d.arc([cx-r+2, cy-r+2, cx+r-2, cy+r-2], start=-90, end=-90+a, fill=col, width=max(6, r-ir))

def scolor(s):
    if s >= 80:
        return GREEN
    if s >= 50:
        return YELLOW
    return RED

cats = [
    ('Robots & Crawler Access', 95, GREEN),
    ('LLMs.txt', 100, GREEN),
    ('Schema & Structured Data', 85, GREEN),
    ('Content Structure', 78, YELLOW),
    ('Entity & Authority', 75, YELLOW),
    ('E-E-A-T Signals', 68, YELLOW),
    ('Content Citeability', 72, YELLOW),
    ('Technical AI-Readiness', 80, GREEN),
    ('Page Performance', 85, GREEN),
]

# ── SCREENSHOT 1: Popup overview (1280x800) ──
img = Image.new('RGB', (1280, 800), (20, 22, 30))
d = ImageDraw.Draw(img)
d.text((60, 40), 'AI Visibility Auditor', fill=WHITE, font=b(34))
d.text((60, 86), 'Audit any webpage for AI/LLM readiness in one click', fill=GRAY, font=f(17))

# Popup frame
px, py, pw = 60, 140, 400
d.rounded_rectangle([px, py, px+pw, py+600], radius=12, fill=BG_DARK, outline=BORDER, width=2)
d.rounded_rectangle([px, py, px+pw, py+40], radius=12, fill=BG_CARD)
d.rectangle([px, py+28, px+pw, py+40], fill=BG_CARD)
d.ellipse([px+14, py+14, px+24, py+24], fill=PURPLE)
d.text((px+32, py+10), 'AI Visibility Auditor', fill=WHITE, font=b(13))
d.text((px+14, py+48), 'sunilpratapsingh.com/guides/geo/what-is-geo', fill=(80, 80, 80), font=f(10))

# Score area
sy = py + 68
d.rounded_rectangle([px+1, sy, px+pw-1, sy+95], radius=0, fill=BG_CARD)
ring(d, px+52, sy+48, 30, 82, GREEN)
d.text((px+38, sy+38), '82', fill=GREEN, font=b(20))
d.text((px+96, sy+16), 'AI-Ready', fill=GREEN, font=b(16))
d.text((px+96, sy+38), 'Well optimized for AI systems', fill=GRAY, font=f(11))

# Buttons
by = sy + 62
for i, (label, bg) in enumerate([('Copy', BORDER), ('JSON', BORDER), ('Full Report', PURPLE)]):
    bx = px + 96 + i * 78
    d.rounded_rectangle([bx, by, bx+70, by+22], radius=4, fill=bg)
    d.text((bx+10, by+5), label, fill=WHITE, font=f(10))

# Category rows
ry = sy + 104
for nm, s, c in cats:
    d.ellipse([px+16, ry+4, px+24, ry+12], fill=c)
    d.text((px+32, ry-1), nm, fill=LIGHT, font=f(12))
    d.text((px+pw-60, ry-1), str(s)+'/100', fill=c, font=b(12))
    d.line([(px+12, ry+20), (px+pw-12, ry+20)], fill=(25, 27, 35))
    ry += 24

# Top Fixes in popup
ry += 8
d.text((px+14, ry), 'Top Fixes', fill=WHITE, font=b(12))
ry += 20
for title, impact in [('Add author byline with credentials', '+5 pts'), ('Add publication & updated dates', '+4 pts'), ('Add question-style headings', '+4 pts')]:
    d.ellipse([px+16, ry+4, px+22, ry+10], fill=RED)
    d.text((px+28, ry-1), title, fill=(170, 170, 170), font=f(10))
    d.text((px+28, ry+13), impact + ' | Quick', fill=(90, 90, 90), font=f(9))
    ry += 30

# Right side feature cards
rx = 520
feats = [
    ('9 Audit Categories', 'Robots, LLMs.txt, Schema, Content,\nEntity, E-E-A-T, Citeability, Technical', PURPLE),
    ('17 AI Crawlers Tracked', 'GPTBot, ClaudeBot, PerplexityBot,\nGoogle-Extended and 13 more', GREEN),
    ('Actionable Fix Recommendations', 'Top fixes sorted by score impact.\nEach shows point gain and effort', YELLOW),
    ('Export & Share Reports', 'Copy Markdown. Download JSON.\nFull printable report in new tab', PURPLE),
]
cy = 140
for t, desc, ac in feats:
    d.rounded_rectangle([rx, cy, rx+700, cy+130], radius=10, fill=BG_CARD, outline=BORDER)
    d.rounded_rectangle([rx, cy, rx+4, cy+130], radius=2, fill=ac)
    d.text((rx+20, cy+18), t, fill=WHITE, font=b(19))
    for i, ln in enumerate(desc.split('\n')):
        d.text((rx+20, cy+50+i*22), ln, fill=GRAY, font=f(14))
    cy += 148
d.text((rx, 740), 'Free | No account | No data collected | 100% client-side', fill=(60, 60, 60), font=f(13))
img.save('screenshot-1-overview.png')
print('screenshot-1-overview.png OK')

# ── SCREENSHOT 2: Crawler table (1280x800) ──
img = Image.new('RGB', (1280, 800), (20, 22, 30))
d = ImageDraw.Draw(img)
d.text((60, 35), 'AI Crawler Access Audit', fill=WHITE, font=b(30))
d.text((60, 75), 'See which AI systems can access any website', fill=GRAY, font=f(16))

tx, ty = 60, 115
for i, (h, w) in enumerate(zip(['Crawler', 'Owner', 'Type', 'Status'], [200, 150, 110, 100])):
    d.text((tx + sum([200, 150, 110, 100][:i]), ty), h, fill=GRAY, font=b(13))
d.line([(tx, ty+22), (tx+1080, ty+22)], fill=BORDER, width=2)

bots = [
    ('GPTBot', 'OpenAI', 'Training', 'Blocked', RED),
    ('OAI-SearchBot', 'OpenAI', 'Search', 'Allowed', GREEN),
    ('ChatGPT-User', 'OpenAI', 'Search', 'Allowed', GREEN),
    ('ClaudeBot', 'Anthropic', 'Training', 'Blocked', RED),
    ('anthropic-ai', 'Anthropic', 'Training', 'Allowed', GREEN),
    ('PerplexityBot', 'Perplexity', 'Search', 'Allowed', GREEN),
    ('Google-Extended', 'Google AI', 'Training', 'Blocked', RED),
    ('Googlebot', 'Google', 'Search', 'Allowed', GREEN),
    ('Amazonbot', 'Amazon', 'Training', 'Allowed', GREEN),
    ('Applebot-Extended', 'Apple AI', 'Training', 'Partial', YELLOW),
    ('Bingbot', 'Microsoft', 'Search', 'Allowed', GREEN),
    ('YouBot', 'You.com', 'Search', 'Allowed', GREEN),
    ('DuckAssistBot', 'DuckDuckGo', 'Search', 'Allowed', GREEN),
    ('FacebookBot', 'Meta', 'Training', 'Blocked', RED),
    ('cohere-ai', 'Cohere', 'Training', 'Allowed', GREEN),
    ('Bytespider', 'ByteDance', 'Training', 'Blocked', RED),
    ('CCBot', 'Common Crawl', 'Training', 'Blocked', RED),
]
ry = ty + 32
colx = [0, 200, 350, 460]
for nm, ow, tp, st, co in bots:
    d.text((tx+colx[0], ry), nm, fill=WHITE, font=b(12))
    d.text((tx+colx[1], ry), ow, fill=GRAY, font=f(12))
    tc = GREEN if tp == 'Search' else (180, 140, 50)
    d.rounded_rectangle([tx+colx[2], ry-2, tx+colx[2]+75, ry+16], radius=8, fill=(30, 32, 42))
    d.text((tx+colx[2]+10, ry), tp, fill=tc, font=f(10))
    d.text((tx+colx[3], ry), st, fill=co, font=b(12))
    d.line([(tx, ry+22), (tx+1080, ry+22)], fill=(22, 24, 30))
    ry += 26

sy = ry + 14
d.rounded_rectangle([tx, sy, tx+1080, sy+44], radius=8, fill=BG_CARD, outline=BORDER)
d.text((tx+20, sy+12), 'Summary:', fill=WHITE, font=b(14))
d.text((tx+110, sy+12), '10 Allowed', fill=GREEN, font=b(14))
d.text((tx+230, sy+12), '6 Blocked', fill=RED, font=b(14))
d.text((tx+340, sy+12), '1 Partial', fill=YELLOW, font=b(14))
img.save('screenshot-2-crawlers.png')
print('screenshot-2-crawlers.png OK')

# ── SCREENSHOT 3: Full report (1280x800) ──
img = Image.new('RGB', (1280, 800), (248, 249, 251))
d = ImageDraw.Draw(img)
d.rectangle([0, 0, 1280, 95], fill=WHITE)
d.line([(0, 95), (1280, 95)], fill=(229, 231, 235))
d.text((60, 28), 'AI Visibility Audit Report', fill=(17, 17, 17), font=b(26))
d.text((60, 62), 'sunilpratapsingh.com | 22 March 2026', fill=(120, 120, 120), font=f(13))

cy = 115
d.rounded_rectangle([60, cy, 230, cy+145], radius=12, fill=WHITE, outline=(229, 231, 235))
d.text((102, cy+18), '82', fill=(22, 163, 74), font=b(50))
d.text((95, cy+80), 'AI-Ready', fill=(22, 163, 74), font=b(17))
d.text((88, cy+108), 'Overall Score', fill=(120, 120, 120), font=f(12))

mcats = [('Robots', 95), ('LLMs.txt', 100), ('Schema', 85), ('Content', 78), ('Entity', 75), ('E-E-A-T', 68), ('Cite', 72), ('Technical', 80), ('Perf.', 85)]
for i, (nm, s) in enumerate(mcats):
    col = i % 3
    row = i // 3
    x = 260 + col * 330
    y = cy + row * 52
    c = scolor(s)
    d.rounded_rectangle([x, y, x+310, y+44], radius=8, fill=WHITE, outline=(229, 231, 235))
    d.text((x+12, y+6), nm, fill=(100, 100, 100), font=f(11))
    d.text((x+250, y+4), str(s), fill=c, font=b(22))
    fw = int(220 * s / 100)
    d.rounded_rectangle([x+12, y+30, x+232, y+36], radius=3, fill=(243, 244, 246))
    if fw > 0:
        d.rounded_rectangle([x+12, y+30, x+12+fw, y+36], radius=3, fill=c)

ry = cy + 180
d.rounded_rectangle([60, ry, 1220, ry+280], radius=12, fill=WHITE, outline=(229, 231, 235))
d.text((84, ry+16), 'Top Fixes (sorted by impact)', fill=(17, 17, 17), font=b(16))
d.line([(84, ry+42), (1196, ry+42)], fill=(243, 244, 246))
fixes = [(1, 'Add author byline with credentials', '+5', RED), (2, 'Add publication dates', '+4', RED), (3, 'Add question-style headings', '+4', YELLOW), (4, 'Add external citations', '+4', YELLOW), (5, 'Add TL;DR section', '+3', YELLOW)]
fy = ry + 54
for n, t, im, pc in fixes:
    d.ellipse([96, fy+2, 118, fy+24], fill=pc)
    d.text((104, fy+4), str(n), fill=WHITE, font=b(12))
    d.text((128, fy+2), t, fill=(17, 17, 17), font=f(14))
    d.text((128, fy+22), im + ' pts | Quick', fill=(120, 120, 120), font=f(11))
    fy += 48
d.text((500, 760), 'Generated by AI Visibility Auditor v2.0', fill=(180, 180, 180), font=f(12))
img.save('screenshot-3-report.png')
print('screenshot-3-report.png OK')

# ── SMALL PROMO (440x280) ──
img = Image.new('RGB', (440, 280), BG_DARK)
d = ImageDraw.Draw(img)
ring(d, 220, 90, 48, 82, GREEN)
d.text((204, 78), '82', fill=GREEN, font=b(26))
d.text((100, 160), 'AI Visibility Auditor', fill=WHITE, font=b(20))
d.text((82, 195), 'Audit any page for AI/LLM readiness', fill=GRAY, font=f(14))
for i, c in enumerate([GREEN, GREEN, GREEN, YELLOW, YELLOW, YELLOW, YELLOW, GREEN, GREEN]):
    d.ellipse([120+i*22, 235, 130+i*22, 245], fill=c)
img.save('promo-small-440x280.png')
print('promo-small-440x280.png OK')

# ── MARQUEE PROMO (1400x560) ──
img = Image.new('RGB', (1400, 560), BG_DARK)
d = ImageDraw.Draw(img)
d.text((80, 80), 'AI Visibility', fill=WHITE, font=b(48))
d.text((80, 140), 'Auditor', fill=PURPLE, font=b(48))
d.text((80, 220), 'Audit any webpage for AI/LLM readiness.', fill=GRAY, font=f(18))
d.text((80, 250), '9 categories. 17 crawlers. Actionable fixes.', fill=GRAY, font=f(18))

px = 80
for lbl in ['Schema', 'E-E-A-T', 'Citeability', 'Robots.txt', 'LLMs.txt']:
    tw = len(lbl) * 9 + 20
    d.rounded_rectangle([px, 300, px+tw, 326], radius=13, fill=BORDER, outline=PURPLE)
    d.text((px+10, 304), lbl, fill=PURPLE, font=b(12))
    px += tw + 8

d.rounded_rectangle([80, 350, 185, 378], radius=6, fill=GREEN)
d.text((94, 356), '100% Free', fill=WHITE, font=b(13))
d.text((80, 400), 'No account. No data collected. Client-side only.', fill=(70, 70, 70), font=f(13))

rpx = 780
d.rounded_rectangle([rpx, 40, rpx+540, 520], radius=14, fill=BG_CARD, outline=BORDER, width=2)
ring(d, rpx+70, 115, 36, 82, GREEN)
d.text((rpx+56, 103), '82', fill=GREEN, font=b(22))
d.text((rpx+125, 92), 'AI-Ready', fill=GREEN, font=b(18))
d.text((rpx+125, 118), 'Well optimized for AI systems', fill=GRAY, font=f(12))

ry = 160
for nm, s, c in cats[:8]:
    d.ellipse([rpx+22, ry+4, rpx+30, ry+12], fill=c)
    d.text((rpx+38, ry-1), nm, fill=LIGHT, font=f(13))
    d.text((rpx+460, ry-1), str(s)+'/100', fill=c, font=b(12))
    d.line([(rpx+18, ry+20), (rpx+520, ry+20)], fill=(18, 20, 28))
    ry += 26
img.save('promo-marquee-1400x560.png')
print('promo-marquee-1400x560.png OK')

print('\nALL 5 IMAGES GENERATED')
