# ishankr.com — portfolio

Personal site for **Ishan Buyyanapragada** — software engineer, systems &
performance. Quiet by design: one column, two typefaces (Geist / Geist Mono),
one accent color, no build step.

## Run it

Any static server works:

```sh
npm run serve        # python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## What's deliberate about it

- **Two-column home** — identity rail on the left, everything else on the
  right; nearly the whole site fits in one viewport. Nav is three links that
  behave identically from every page (`ib`, `writing`, `email`) — no in-page
  anchors, no inconsistent scrolling.
- **Writing reader** (`writing.html`) — posts are tabs, not a stack: titles in
  the rail, one post visible at a time with a quiet crossfade. Hash deep-links
  (`#on-ai`) open the right tab, arrow keys and touch swipes flip through,
  and the highlight pill rests on the selected post.
- **Sliding hover highlight** on lists — a single pill chases the hovered row
  through damped GSAP tweens, so erratic pointer movement still produces calm,
  continuous motion. If the pill is invisible it appears in place rather than
  flying in. Keyboard focus drives it exactly like hover.
- **Background simulation** (`js/lattice.js`) — Conway's Game of Life
  (B3/S23, toroidal) rendered as a dot grid in the page margins, cited in the
  bottom-right corner; clicking the note pauses it. Generations crossfade
  instead of popping, the pointer's influence runs through a critically
  damped spring, frames render only when something changed, and none of it
  loads on touch devices, narrow viewports, or for reduced-motion users.
- Copy-email button with inline feedback, local Urbana time pinned
  bottom-left, cross-document view-transition fade, `prefers-reduced-motion`
  honored end to end, all posts readable without JavaScript.

## Stack

- Static HTML + vanilla ES modules, no bundler
- GSAP 3.15 (load-in stagger, hover pill, reader crossfade) — vendored in `js/vendor/`
- Three.js 0.184 (background simulation, lazy-imported only where it can be seen)
- Fonts self-hosted via Fontsource (Geist, Geist Mono)

## Verification

```sh
npm run verify   # headless-Chrome harness: console errors, overflow,
                 # content visibility, erratic-hover test, screenshots
npm run og       # regenerate assets/og.png
```
