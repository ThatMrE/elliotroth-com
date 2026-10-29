# elliotroth.com

Elliot Roth's personal site: a static Squarespace 7.1 export, deployed from
`main` to Netlify. All content is inline HTML — there are no data files, no
build step and no framework.

## The design system wins over the design skills

`.claude/skills/` holds two third-party landing-page skills
(`landing-page-design`, `motionsites-web-builder`). They are here to build
**new** pages and other projects. They do **not** govern this site.

This site has its own deliberate system, layered over the theme in
`assets/er-custom.css` and prefixed `.er-`:

- **Palette:** acid yellow `#f2ff3d` and hot magenta `#ff2d6f` on black.
  Newsprint `#f5f2e8` for light bands, where the magenta darkens to `#c4004a`
  to clear 4.5:1.
- **Type:** uppercase stacked headings, `line-height: 0.92`, tight tracking.
  Sans-serif only, no italics anywhere — both are enforced and checked.
- **Devices:** rubber-stamp eyebrow labels, sticker-slab buttons with a 4px
  magenta offset shadow, torn `clip-path` section edges, a halftone dot
  overlay, a ticker that stops under `prefers-reduced-motion`.
- **Voice:** first person, short sentences, gig-flyer register. No corporate
  filler.

It is a punk flyer, deliberately unlike elliotroth.me (which is the lab
notebook). That contrast was the point, and it was chosen after an earlier
direction was rejected for being too close to the other site.

`landing-page-design` asks to be consulted for "ANY landing page, marketing
site, web UI, page section, component" and calls its typography, spacing,
radius and background rules non-negotiable. On this repo those rules lose to
the list above. Reach for the skills when starting something new, or when
Elliot asks for them by name.

## House rules

- **Never invent facts.** No award, press mention, quote, date, venue or
  project goes on a page without a URL that was actually fetched. Testimonials
  stay commented out until real quotes exist.
- **Never publish a private repo.** Elliot's GitHub listing includes private
  repositories; they do not get named, linked or described here.
- **Don't duplicate.** The site has been through several deliberate
  de-duplication passes. Before adding a fact, grep for it. The stat row,
  Receipts, the back catalog and the press pills each state things once.
- **Work on a branch, open a draft PR.** Netlify deploys `main`.

## Verifying a change

There is no test suite. Serve locally and check the rendered result:

```
python3 -m http.server 8899
```

Then, across `/index.html`, `/portfolio/`, `/portfolio/websites/`,
`/contact/` and `/404.html`:

- no horizontal page scroll at 1280, 768, 390 and 360
  (`document.documentElement.scrollWidth <= window.innerWidth`)
- zero computed `serif` font-family and zero `italic` font-style
- every `<use href="#er-i-…">` resolves against the inline SVG sprite
- no broken images, and any new link returns 200
- no contrast failure below WCAG AA — compositing translucent backgrounds,
  and skipping `clip-path: inset(50%)` visually-hidden elements, or the check
  reports false positives on every card

Playwright lives at `/opt/node22/lib/node_modules/playwright` with Chromium
preinstalled (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`) — don't run
`playwright install`. `scripts/shoot.py` in the motionsites skill does a
similar screenshot-and-QA pass if you want one off the shelf.

## Known environment limits

- `elliotroth.com` and the Netlify deploy previews are refused by the egress
  proxy, so the **rendered live site cannot be checked from a session here**.
  Every verification above is against local source. This gap has hidden two
  real bugs before — say so rather than implying the live page was seen.
- Squarespace CDN hosts are blocked too, so pages render locally without the
  theme's webfonts and remote JS. Expected, not a bug. It is why the custom
  CSS re-points all 126 theme font variables and forces reveal-animation
  elements visible: the theme's remote scripts never arrive.
- `gh` is authenticated for this repository only and GitHub GraphQL is
  blocked; use REST (`gh api repos/ThatMrE/elliotroth-com/...`).
