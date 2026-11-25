#!/usr/bin/env python3
"""Build the writing section of elliotroth.com.

    python3 scripts/build_writing.py

Run it from the repository root after adding or editing anything in
writing/_src/. It reads

    writing/_src/*.md            one file per piece hosted on this site
    writing/_src/elsewhere.json  pieces that live elsewhere: the older Medium
                                 posts and the Substack dispatches
    writing/_src/desk.json       optional: works in progress, shown as
                                 progress bars (see CLAUDE.md)

and writes plain HTML that is committed like every other page:

    writing/index.html           the zine: counter, start here, the full index
    writing/<slug>/index.html    one page per hosted piece
    writing/feed.xml             RSS, full text
    sitemap.xml                  its /writing/ entries are replaced
    index.html                   the strip between the writing:latest markers

Standard library only. No build step runs on Netlify; the output is the site.
"""
import datetime as dt
import html
import json
import os
import re
import struct
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'writing', '_src')
OUT = os.path.join(ROOT, 'writing')
SITE = 'https://elliotroth.com'
SUBSTACK = 'https://elliotroth.substack.com'
WPM = 230

SHELVES = {  # key: (label, one line for the index)
    'essays': ('Essays', 'Arguments, mostly with myself.'),
    'fiction': ('Fiction', 'Short stories, usually from a one-line prompt.'),
    'field-notes': ('Field notes', 'Experiments, builds and the occasional useful list.'),
    'personal': ('Personal', 'Things that happened to me.'),
    'archive': ('Medium archive', 'Older pieces, still on Medium.'),
    'dispatches': ('Dispatches', 'The weekly letter, on Substack.'),
}
REQUIRED = ('no', 'slug', 'title', 'date', 'shelf')
MONTHS = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split()


def fail(msg):
    sys.exit('build_writing: ' + msg)


# ------------------------------------------------------------------ sources

def read_piece(path):
    raw = open(path, encoding='utf-8').read()
    m = re.match(r'---\n(.*?)\n---\n', raw, re.S)
    if not m:
        fail(f'{path}: no front matter (a block between two --- lines)')
    meta = {}
    for line in m.group(1).splitlines():
        if line.strip():
            k, _, v = line.partition(':')
            meta[k.strip()] = v.strip()
    meta['body'] = raw[m.end():]
    meta['path'] = path
    meta.setdefault('slug', os.path.splitext(os.path.basename(path))[0])
    return meta


def load():
    pieces = [read_piece(os.path.join(SRC, f)) for f in sorted(os.listdir(SRC))
              if f.endswith('.md') and not f.startswith('_')]  # _template.md and friends are skipped
    pieces = [p for p in pieces if p.get('draft', '').lower() not in ('true', 'yes', '1')]
    elsewhere = json.load(open(os.path.join(SRC, 'elsewhere.json'), encoding='utf-8'))
    taken = {int(p['no']) for p in pieces if p.get('no')} | {e['no'] for e in elsewhere if 'no' in e}
    for p in pieces:  # a new piece without a number gets the next one, written back to its file
        if not p.get('no'):
            p['no'] = str(max(taken) + 1 if taken else 0)
            taken.add(int(p['no']))
            raw = open(p['path'], encoding='utf-8').read()
            open(p['path'], 'w', encoding='utf-8').write(raw.replace('---\n', f'---\nno: {p["no"]}\n', 1))
            print(f'  numbered {os.path.basename(p["path"])} as No. {p["no"]}')
    for p in pieces:
        for k in REQUIRED:
            if not p.get(k):
                fail(f'{p["path"]}: missing "{k}" in front matter')
        if p['shelf'] not in SHELVES or p['shelf'] in ('archive', 'dispatches'):
            fail(f'{p["path"]}: shelf must be one of essays, fiction, field-notes, personal')
        p['no'] = int(p['no'])
        p['html'] = render(p['body'], p['slug'])
        p['words'] = count_words(p['body'])
    nos = [p['no'] for p in pieces] + [e['no'] for e in elsewhere if 'no' in e]
    dupes = sorted({n for n in nos if nos.count(n) > 1})
    if dupes:
        fail(f'two pieces share a number: {dupes}')
    slugs = [p['slug'] for p in pieces]
    if len(set(slugs)) != len(slugs):
        fail('two pieces share a slug')
    desk_path = os.path.join(SRC, 'desk.json')
    desk = json.load(open(desk_path, encoding='utf-8')) if os.path.exists(desk_path) else []
    return pieces, elsewhere, desk


# ----------------------------------------------------------------- markdown

def esc(s):
    return html.escape(s, quote=True)


def inline(text):
    codes = []

    def keep_code(m):
        codes.append(m.group(1))
        return f'\x00{len(codes) - 1}\x00'

    text = re.sub(r'`([^`]+)`', keep_code, text)
    text = text.replace('\\*', '\x01')
    text = esc(text)

    def link(m):
        label, url = m.group(1), m.group(2)
        external = url.startswith('http') and not url.startswith(SITE)
        rel = ' rel="noopener" target="_blank"' if external else ''
        return f'<a href="{url}"{rel}>{label}</a>'

    text = re.sub(r'\[([^\]]+)\]\(([^)\s]+)\)', link, text)
    text = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', text)
    text = re.sub(r'(?<![\w/])_(?!\s)(.+?)(?<!\s)_(?![\w])', r'<em>\1</em>', text)
    text = re.sub(r'(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])', r'<em>\1</em>', text)
    text = text.replace('  \n', '<br/>\n').replace('\x01', '*')
    return re.sub(r'\x00(\d+)\x00', lambda m: f'<code>{esc(codes[int(m.group(1))])}</code>', text)


def image_size(path):
    """(width, height) of a PNG, GIF or JPEG on disk, or None."""
    try:
        with open(path, 'rb') as f:
            head = f.read(26)
            if head[:8] == b'\x89PNG\r\n\x1a\n':
                return struct.unpack('>II', head[16:24])
            if head[:6] in (b'GIF87a', b'GIF89a'):
                return struct.unpack('<HH', head[6:10])
            if head[:2] == b'\xff\xd8':
                f.seek(2)
                while True:
                    marker, = struct.unpack('>H', f.read(2))
                    size, = struct.unpack('>H', f.read(2))
                    if 0xFFC0 <= marker <= 0xFFCF and marker not in (0xFFC4, 0xFFC8, 0xFFCC):
                        h, w = struct.unpack('>xHH', f.read(5))
                        return w, h
                    f.seek(size - 2, 1)
    except (OSError, struct.error):
        return None
    return None


def figure(alt, src, cap):
    capt = f'<figcaption>{inline(cap)}</figcaption>' if cap else ''
    if src.endswith('.mp4'):
        poster = src[:-4] + '.jpg'
        has_poster = os.path.exists(os.path.join(ROOT, poster.lstrip('/')))
        return (f'<figure class="er-fig er-fig--clip"><video autoplay="" loop="" muted="" playsinline="" preload="metadata"'
                + (f' poster="{poster}"' if has_poster else '')
                + f' src="{src}"' + (f' aria-label="{esc(alt)}"' if alt else '') + f'></video>{capt}</figure>')
    size = image_size(os.path.join(ROOT, src.lstrip('/'))) if src.startswith('/') else None
    dims = f' width="{size[0]}" height="{size[1]}"' if size else ''
    return f'<figure class="er-fig"><img alt="{esc(alt)}" decoding="async" loading="lazy" src="{src}"{dims}/>{capt}</figure>'


def render(md, slug=''):
    out = []
    for block in re.split(r'\n\s*\n', md.strip()):
        b = block.strip('\n')
        if not b.strip():
            continue
        m = re.fullmatch(r'!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)', b.strip())
        if m:
            out.append(figure(m.group(1), m.group(2), m.group(3)))
            continue
        m = re.fullmatch(r'\[Video\]\((https://www\.youtube-nocookie\.com/embed/[^)\s]+)\)', b.strip())
        if m:
            out.append(f'<figure class="er-fig"><div class="er-video"><iframe allow="encrypted-media; picture-in-picture" '
                       f'allowfullscreen="" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" '
                       f'src="{esc(m.group(1))}" title="Video"></iframe></div></figure>')
            continue
        if b.lstrip().startswith('<'):
            out.append(b)
            continue
        if re.fullmatch(r'\s*(-{3,}|\*{3,})\s*', b):
            out.append('<hr/>')
            continue
        m = re.match(r'(#{2,4}) (.*)', b)
        if m and '\n' not in b:
            n = min(len(m.group(1)), 3)
            out.append(f'<h{n}>{inline(m.group(2).strip())}</h{n}>')
            continue
        lines = b.split('\n')
        if all(l.startswith('>') for l in lines):
            inner = '\n'.join(re.sub(r'^> ?', '', l) for l in lines)
            out.append(f'<blockquote>{render(inner, slug)}</blockquote>')
            continue
        if all(re.match(r'[-*] ', l) for l in lines):
            out.append('<ul>' + ''.join(f'<li>{inline(l[2:])}</li>' for l in lines) + '</ul>')
            continue
        if all(re.match(r'\d+\. ', l) for l in lines):
            items = [re.sub(r'^\d+\. ', '', l) for l in lines]
            out.append('<ol>' + ''.join(f'<li>{inline(i)}</li>' for i in items) + '</ol>')
            continue
        out.append(f'<p>{inline(b)}</p>')
    return '\n'.join(out)


def count_words(md):
    t = re.sub(r'!\[[^\]]*\]\([^)]*\)|\[Video\]\([^)]*\)', ' ', md)
    t = re.sub(r'\[([^\]]+)\]\([^)]*\)', r'\1', t)
    return len(re.findall(r"[\w’'-]+", t))


# -------------------------------------------------------------------- dates

def parse_date(s):
    parts = [int(x) for x in s.split('-')]
    return dt.date(parts[0], parts[1] if len(parts) > 1 else 1, parts[2] if len(parts) > 2 else 1)


def long_date(s):
    parts = s.split('-')
    if len(parts) == 1:
        return parts[0]
    if len(parts) == 2:
        return f'{MONTHS[int(parts[1]) - 1]} {parts[0]}'
    return f'{int(parts[2])} {MONTHS[int(parts[1]) - 1]} {parts[0]}'


def short_date(s):
    parts = s.split('-')
    return parts[0] if len(parts) == 1 else f'{MONTHS[int(parts[1]) - 1]} {parts[0]}'


def minutes(words):
    return max(1, round(words / WPM))


# -------------------------------------------------------------------- shell

def shell():
    """Head and foot of the site, taken from 404.html so the header, nav,
    footer, theme CSS and the flyer layer match every other page."""
    page = open(os.path.join(ROOT, '404.html'), encoding='utf-8').read()
    i, j = page.index('<main '), page.index('</main>') + len('</main>')
    return page[:i], page[j:]


HEAD, FOOT = shell()


def page(title, desc, path, body, kind='website', extra_head='', script=''):
    url = SITE + path
    full = f'{title} — Elliot Roth' if title else 'Elliot Roth'
    h = HEAD
    h = re.sub(r'<title>.*?</title>', f'<title>{esc(full)}</title>', h, count=1)
    for attr in ('property="og:title"', 'itemprop="name"', 'name="twitter:title"'):
        h = re.sub(r'<meta content="[^"]*" ' + re.escape(attr) + '/>', f'<meta content="{esc(full)}" {attr}/>', h)
    for attr in ('property="og:url"', 'itemprop="url"', 'name="twitter:url"'):
        h = re.sub(r'<meta content="[^"]*" ' + re.escape(attr) + '/>', f'<meta content="{url}" {attr}/>', h)
    h = re.sub(r'<meta content="[^"]*" property="og:type"/>', f'<meta content="{kind}" property="og:type"/>', h)
    h = re.sub(r'<meta content="[^"]*" name="description"/>', f'<meta content="{esc(desc)}" name="description"/>', h)
    h = h.replace('<link href="/assets/er-custom.css" rel="stylesheet"/>',
                  '<link href="/assets/er-custom.css" rel="stylesheet"/>\n'
                  f'<link href="{url}" rel="canonical"/>\n'
                  f'<link href="{SITE}/writing/feed.xml" rel="alternate" title="Elliot Roth: writing" type="application/rss+xml"/>'
                  + extra_head, 1)
    main = (f'<main class="container" id="page" role="main">\n<article class="sections er-zine" id="sections">\n'
            f'{body}\n</article>\n</main>')
    return h + main + (f'\n<script>{script}</script>' if script else '') + FOOT


def write(path, text):
    full = os.path.join(ROOT, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, 'w', encoding='utf-8') as f:
        f.write(text)


SUBSCRIBE = f'''<section class="er-section er-zine-sub" id="subscribe">
<div class="er-wrap er-wrap--read">
<p class="er-eyebrow">Get the next one</p>
<p class="er-zine-sub-line">New pieces go up here first. The weekly letter goes out on Substack.</p>
<div class="er-actions">
<a class="er-btn" href="{SUBSTACK}" rel="noopener" target="_blank">Subscribe on Substack</a>
<a class="er-btn er-btn--ghost" href="/writing/feed.xml">RSS</a>
<a class="er-btn er-btn--ghost" href="/writing/">Back to the zine</a>
</div>
</div>
</section>'''

# under reduced motion the looping clips stop where they are
PAUSE_SCRIPT = ("(function(){var m=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)');"
                "function f(){document.querySelectorAll('.er-fig video').forEach(function(v){"
                "if(m&&m.matches){v.pause();v.removeAttribute('autoplay');v.controls=true;}});}"
                "f();if(m&&m.addEventListener)m.addEventListener('change',f);})();")


# -------------------------------------------------------------------- pages

def piece_page(p, total, prev, nxt):
    shelf = SHELVES[p['shelf']][0]
    mins = minutes(p['words'])
    dek = f'<p class="er-lede er-zine-dek">{inline(p["dek"])}</p>' if p.get('dek') else ''
    prompt = (f'<aside class="er-prompt"><span class="er-prompt-k">Prompt</span>'
              f'<p>{inline(p["prompt"])}</p></aside>') if p.get('prompt') else ''
    origin = ''
    if p.get('origin_url'):
        origin = (f'<aside class="er-origin">First published on <a href="{esc(p["origin_url"])}" rel="noopener" '
                  f'target="_blank">{esc(p.get("origin", "the web"))}</a>, {long_date(p["date"])}.</aside>')
    tags = ''
    if p.get('tags'):
        tags = '<ul class="er-zine-tags">' + ''.join(
            f'<li>{esc(t.strip())}</li>' for t in p['tags'].split(',') if t.strip()) + '</ul>'

    def step(q, rel):
        if not q:
            return '<span></span>'
        arrow = '&larr;' if rel == 'prev' else '&rarr;'
        label = 'Before' if rel == 'prev' else 'Next'
        return (f'<a class="er-zine-step er-zine-step--{rel}" href="/writing/{q["slug"]}/" rel="{rel}">'
                f'<span class="er-zine-step-k">{arrow} {label} &middot; No. {q["no"]}</span>'
                f'<span class="er-zine-step-t">{esc(q["title"])}</span></a>')

    body = f'''<section class="er-section er-section--first er-zine-head" id="top">
<div class="er-wrap er-wrap--read">
<p class="er-zine-crumb"><a href="/writing/">The zine</a> <span aria-hidden="true">/</span> <a href="/writing/#{p['shelf']}">{shelf}</a></p>
<p class="er-eyebrow">No. {p['no']} <span class="er-zine-of">/ {total}</span></p>
<h1 class="er-h2 er-zine-title">{esc(p['title'])}</h1>
{dek}
<p class="er-zine-meta"><span>{long_date(p['date'])}</span><span>{mins} min read</span><span>{p['words']:,} words</span></p>
</div>
</section>
<section class="er-section er-section--light er-zine-page">
<div class="er-wrap er-wrap--read">
{prompt}
<div class="er-prose">
{p['html']}
</div>
{origin}
{tags}
<nav aria-label="More writing" class="er-zine-steps">{step(prev, 'prev')}{step(nxt, 'next')}</nav>
</div>
</section>
{SUBSCRIBE}'''
    desc = p.get('dek') or re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', p['html'])).strip()[:155]
    return page(p['title'], desc, f'/writing/{p["slug"]}/', body, kind='article', script=PAUSE_SCRIPT)


def row(e, total):
    """One line of the index, for a hosted piece or a linked one."""
    if e.get('shelf') == 'dispatches':
        no, no_key = f'D{e["dispatch"]:02d}', 1000 + e['dispatch']
    else:
        no, no_key = f'No. {e["no"]}', e['no']
    hosted = 'slug' in e
    href = f'/writing/{e["slug"]}/' if hosted else e['url']
    attrs = '' if hosted else ' rel="noopener" target="_blank"'
    words = e.get('words') or 0
    length = f'{minutes(words)} min' if words else ''
    where = '' if hosted else f'<span class="er-zine-away">{esc(e["origin"])} &#8599;</span>'
    year = e['date'][:4]
    return (f'<li class="er-zine-row" data-shelf="{e["shelf"]}" data-date="{e["date"]}" data-words="{words}" '
            f'data-no="{no_key}" data-year="{year}">'
            f'<span class="er-zine-no">{no}</span>'
            f'<a class="er-zine-t" href="{esc(href)}"{attrs}>{esc(e["title"])}</a>'
            f'<span class="er-zine-shelf">{SHELVES[e["shelf"]][0]}</span>'
            f'<span class="er-zine-when">{short_date(e["date"])}</span>'
            f'<span class="er-zine-len">{length}{where}</span></li>')


INDEX_SCRIPT = r"""(function(){
var list=document.querySelector('.er-zine-list');if(!list)return;
var rows=[].slice.call(list.querySelectorAll('.er-zine-row'));
var shelf='pieces',sort='new';
function key(r){return r.dataset.date+'~'+(+r.dataset.no+10000);}
function draw(){
 var show=rows.filter(function(r){var s=r.dataset.shelf;return shelf==='all'||(shelf==='pieces'?s!=='dispatches':s===shelf);});
 show.sort(function(a,b){
  if(sort==='long')return b.dataset.words-a.dataset.words;
  if(sort==='short')return (+a.dataset.words||1e9)-(+b.dataset.words||1e9);
  var x=key(a),y=key(b);return sort==='old'?(x<y?-1:x>y?1:0):(x<y?1:x>y?-1:0);});
 list.innerHTML='';var yr='';
 show.forEach(function(r){
  if(sort==='new'||sort==='old'){if(r.dataset.year!==yr){yr=r.dataset.year;var h=document.createElement('li');h.className='er-zine-year';h.textContent=yr;h.setAttribute('aria-hidden','true');list.appendChild(h);}}
  list.appendChild(r);});
 var c=document.querySelector('.er-zine-shown');if(c)c.textContent=show.length;}
document.querySelectorAll('[data-zine-shelf]').forEach(function(b){b.addEventListener('click',function(){
 shelf=b.dataset.zineShelf;document.querySelectorAll('[data-zine-shelf]').forEach(function(x){x.setAttribute('aria-pressed',String(x===b));});draw();});});
document.querySelectorAll('[data-zine-sort]').forEach(function(b){b.addEventListener('click',function(){
 sort=b.dataset.zineSort;document.querySelectorAll('[data-zine-sort]').forEach(function(x){x.setAttribute('aria-pressed',String(x===b));});draw();});});
var h=(location.hash||'').slice(1);var pre=document.querySelector('[data-zine-shelf="'+h+'"]');if(pre)shelf=h,pre.click();else draw();
document.documentElement.classList.add('er-zine-live');})();"""


def desk_section(desk):
    if not desk:
        return ''
    bars = []
    for d in desk:
        pct = max(0, min(100, int(d.get('percent', 0))))
        note = f'<span class="er-desk-note">{esc(d["note"])}</span>' if d.get('note') else ''
        bars.append(f'<li class="er-desk-item"><span class="er-desk-t">{esc(d["title"])}</span>{note}'
                    f'<span class="er-desk-bar" role="progressbar" aria-label="{esc(d["title"])}" aria-valuemin="0" '
                    f'aria-valuemax="100" aria-valuenow="{pct}"><span style="width:{pct}%"></span></span>'
                    f'<span class="er-desk-pct">{pct}%</span></li>')
    return f'''<section class="er-section er-section--tint" id="desk">
<div class="er-wrap">
<p class="er-eyebrow">On the desk</p>
<h2 class="er-h2">What I&rsquo;m writing now.</h2>
<ul class="er-desk">{''.join(bars)}</ul>
</div>
</section>'''


def index_page(pieces, elsewhere, desk):
    entries = [dict(p) for p in pieces] + elsewhere
    numbered = [e for e in entries if e.get('shelf') != 'dispatches']
    dispatches = [e for e in entries if e.get('shelf') == 'dispatches']
    total = max(e['no'] for e in numbered)
    words_here = sum(p['words'] for p in pieces)
    start = sorted([p for p in pieces if p.get('start_here')], key=lambda p: int(p['start_here']))
    cards = ''.join(
        f'''<a class="er-zine-card" href="/writing/{p['slug']}/">
<span class="er-zine-card-k">No. {p['no']} &middot; {SHELVES[p['shelf']][0]}</span>
<span class="er-zine-card-t">{esc(p['title'])}</span>
<span class="er-zine-card-m">{short_date(p['date'])} &middot; {minutes(p['words'])} min</span>
</a>''' for p in start)
    start_html = f'''<section class="er-section er-section--tint" id="start-here">
<div class="er-wrap">
<p class="er-eyebrow">Start here</p>
<h2 class="er-h2">If you read three.</h2>
<div class="er-zine-cards">{cards}</div>
</div>
</section>''' if start else ''

    counts = {k: sum(1 for e in entries if e['shelf'] == k) for k in SHELVES}
    chips = [('pieces', 'Everything', len(numbered))] + [(k, SHELVES[k][0], counts[k]) for k in SHELVES if counts[k]]
    chip_html = ''.join(f'<button aria-pressed="{str(k == "pieces").lower()}" class="er-filter" data-zine-shelf="{k}" '
                        f'type="button">{label} ({n})</button>' for k, label, n in chips)
    sorts = [('new', 'Newest'), ('old', 'Oldest'), ('long', 'Longest'), ('short', 'Shortest')]
    sort_html = ''.join(f'<button aria-pressed="{str(k == "new").lower()}" class="er-filter" data-zine-sort="{k}" '
                        f'type="button">{label}</button>' for k, label in sorts)

    rows, year = [], None  # the no-script list: newest first, grouped by year, everything in it
    for e in sorted(entries, key=lambda e: (e['date'], e.get('no', e.get('dispatch', -1))), reverse=True):
        if e['date'][:4] != year:
            year = e['date'][:4]
            rows.append(f'<li aria-hidden="true" class="er-zine-year">{year}</li>')
        rows.append(row(e, total))
    shelves = ''.join(f'<li id="{k}"><b>{SHELVES[k][0]}</b> <span>{SHELVES[k][1]}</span></li>'
                      for k in SHELVES if counts[k])

    body = f'''<section class="er-section er-section--first" id="zine">
<div class="er-wrap">
<p class="er-eyebrow">The zine</p>
<h1 class="er-h2">Things I wrote down.</h1>
<p class="er-lede">Essays, short fiction, field notes from experiments run on myself, and the odd confession. Every piece has a number, oldest first. The newer ones live here in full; the older ones are still on Medium, and the weekly letter is on Substack.</p>
<p class="er-zine-count"><span><b>{len(numbered)}</b> pieces</span><span><b>{len(pieces)}</b> on this site</span><span><b>{words_here:,}</b> words here</span><span><b>{len(dispatches)}</b> dispatches</span></p>
</div>
</section>
{desk_section(desk)}
{start_html}
<section class="er-section er-section--light" id="index">
<div class="er-wrap">
<p class="er-eyebrow">The index</p>
<h2 class="er-h2">Every piece, numbered.</h2>
<ul class="er-zine-shelves">{shelves}</ul>
<div aria-label="Shelf" class="er-filters er-zine-tools" role="group">{chip_html}</div>
<div aria-label="Order" class="er-filters er-zine-tools er-zine-tools--sort" role="group">{sort_html}</div>
<p aria-live="polite" class="er-zine-showing">Showing <span class="er-zine-shown">{len(entries)}</span></p>
<ol class="er-zine-list">
{chr(10).join(rows)}
</ol>
</div>
</section>
{SUBSCRIBE}'''
    desc = 'Essays, short fiction, field notes and personal pieces by Elliot Roth, numbered oldest first.'
    return page('Writing', desc, '/writing/', body, script=INDEX_SCRIPT)


def feed(pieces):
    items = []
    for p in sorted(pieces, key=lambda p: p['date'], reverse=True):
        d = parse_date(p['date'])
        pub = dt.datetime(d.year, d.month, d.day, 12, tzinfo=dt.timezone.utc).strftime('%a, %d %b %Y %H:%M:%S +0000')
        body = re.sub(r'(src|poster|href)="/', rf'\1="{SITE}/', p['html'])
        items.append(f'''<item>
<title>{esc(p['title'])}</title>
<link>{SITE}/writing/{p['slug']}/</link>
<guid isPermaLink="true">{SITE}/writing/{p['slug']}/</guid>
<pubDate>{pub}</pubDate>
<category>{SHELVES[p['shelf']][0]}</category>
<description>{esc(p.get('dek') or p['title'])}</description>
<content:encoded><![CDATA[{body.replace(']]>', ']]]]><![CDATA[>')}]]></content:encoded>
</item>''')
    return f'''<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel>
<title>Elliot Roth: writing</title>
<link>{SITE}/writing/</link>
<atom:link href="{SITE}/writing/feed.xml" rel="self" type="application/rss+xml"/>
<description>Essays, short fiction, field notes and personal pieces.</description>
<language>en-us</language>
{chr(10).join(items)}
</channel>
</rss>
'''


def sitemap(pieces):
    path = os.path.join(ROOT, 'sitemap.xml')
    text = open(path, encoding='utf-8').read()
    text = re.sub(r'  <url>\s*<loc>' + re.escape(SITE) + r'/writing/[^<]*</loc>.*?</url>\n', '', text, flags=re.S)
    add = [('/writing/', '0.8')] + [(f'/writing/{p["slug"]}/', '0.6') for p in sorted(pieces, key=lambda p: p['no'])]
    block = ''.join(f'  <url>\n    <loc>{SITE}{u}</loc>\n    <changefreq>monthly</changefreq>\n'
                    f'    <priority>{pr}</priority>\n  </url>\n' for u, pr in add)
    write('sitemap.xml', text.replace('</urlset>', block + '</urlset>'))


def homepage_strip(pieces):
    path = os.path.join(ROOT, 'index.html')
    text = open(path, encoding='utf-8').read()
    start, end = '<!-- writing:latest -->', '<!-- /writing:latest -->'
    if start not in text:
        return
    latest = sorted(pieces, key=lambda p: (p['date'], p['no']), reverse=True)[:3]
    cards = ''.join(f'''<a class="er-zine-card" href="/writing/{p['slug']}/">
<span class="er-zine-card-k">No. {p['no']} &middot; {SHELVES[p['shelf']][0]}</span>
<span class="er-zine-card-t">{esc(p['title'])}</span>
<span class="er-zine-card-m">{short_date(p['date'])} &middot; {minutes(p['words'])} min</span>
</a>''' for p in latest)
    block = f'''{start}
<section class="er-section" id="zine">
<div class="er-wrap">
<div class="er-head">
<p class="er-eyebrow">The zine</p>
<h2 class="er-h2">Liner notes.</h2>
<p class="er-lede">What I&rsquo;ve been writing down. Essays, short fiction, field notes.</p>
</div>
<div class="er-zine-cards">{cards}</div>
<div class="er-actions"><a class="er-btn er-btn--ghost" href="/writing/">Every piece</a></div>
</div>
</section>
{end}'''
    i, j = text.index(start), text.index(end) + len(end)
    write('index.html', text[:i] + block + text[j:])


def main():
    pieces, elsewhere, desk = load()
    order = sorted(pieces, key=lambda p: p['no'])
    total = max([p['no'] for p in pieces] + [e['no'] for e in elsewhere if 'no' in e])
    for i, p in enumerate(order):
        prev = order[i - 1] if i else None
        nxt = order[i + 1] if i + 1 < len(order) else None
        write(f'writing/{p["slug"]}/index.html', piece_page(p, total, prev, nxt))
    write('writing/index.html', index_page(pieces, elsewhere, desk))
    write('writing/feed.xml', feed(pieces))
    sitemap(pieces)
    homepage_strip(pieces)
    known = {p['slug'] for p in pieces} | {'_src'}
    for d in sorted(os.listdir(OUT)):
        if os.path.isdir(os.path.join(OUT, d)) and d not in known:
            print(f'  note: writing/{d}/ has no source in writing/_src/ any more; delete it if that is intended')
    print(f'built {len(pieces)} pages, the index, the feed and the sitemap. Next free number: No. {total + 1}')


if __name__ == '__main__':
    main()
