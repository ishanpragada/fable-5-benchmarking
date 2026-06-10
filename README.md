# ishan.kr — portfolio landing page

A single-page portfolio for **Ishan Buyyanapragada** — CS @ UIUC, systems &
performance engineering. Dark, instrument-panel editorial design: Anton display
type, JetBrains Mono microtype, a signal-lime accent, and a pointer-reactive
Three.js particle terrain.

## Stack

- **No build step** — static `index.html` + vanilla ES modules
- **GSAP 3.15** (ScrollTrigger, SplitText, ScrambleText) — vendored in `js/vendor/`
- **Three.js 0.184** — custom point-shader terrain in the hero
- **Lenis** — smooth scrolling
- Fonts self-hosted via Fontsource (Anton, Archivo Variable, JetBrains Mono Variable)

## Run it

Any static server works:

```sh
npx serve .          # or
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Notable details

- Boot-log preloader with a latency-flavored counter
- Width-fitted poster typography (`data-fit`) at every viewport
- Work index rows with hover-following preview cards (pure CSS artwork)
- Scramble-text nav, magnetic buttons, custom cursor (fine pointers only)
- Velocity-reactive marquee
- `prefers-reduced-motion` honored throughout; cursor and previews are
  disabled on touch devices; WebGL failure degrades gracefully
