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

- **Sliding hover highlight** on the work/writing lists — a single pill chases
  the hovered row through damped GSAP tweens, so erratic pointer movement still
  produces calm, continuous motion. If the pill is invisible it appears in
  place rather than flying in. Keyboard focus drives it exactly like hover.
- **Margin lattice** (`js/lattice.js`) — the one WebGL element. A dot grid
  masked to the page margins; the pointer's influence runs through a
  critically damped spring, and the render loop sleeps (zero CPU) once the
  spring settles. It never loads on touch devices, narrow viewports, or for
  users who prefer reduced motion.
- **On-site writing** (`writing.html`) — posts live here, not on an external
  service. Arriving via an index link highlights the post date (`:target`).
- Copy-email button with inline feedback, local Urbana time in the footer,
  cross-document view-transition fade, `prefers-reduced-motion` honored
  end to end.

## Stack

- Static HTML + vanilla ES modules, no bundler
- GSAP 3.15 (load-in stagger + hover pill) — vendored in `js/vendor/`
- Three.js 0.184 (margin lattice, lazy-imported only where it can be seen)
- Fonts self-hosted via Fontsource (Geist, Geist Mono)

## Verification

```sh
npm run verify   # headless-Chrome harness: console errors, overflow,
                 # content visibility, erratic-hover test, screenshots
npm run og       # regenerate assets/og.png
```
