# Design

## 1. Aesthetic direction

**Scrapyard workshop.** Darwin's Garage is a Saturday-morning garage bay, not a lab: a
sun-bleached concrete floor, rust-orange and safety-yellow paint pulled straight off shop
signage, grease-dark steel panels, and a chalk-scrawled logbook tone for stats and readouts.
The population overview looks like cars scattered across a workshop floor; the fitness graph
looks stenciled onto a steel panel. It's tactile and a little grimy — evolution as junkyard
tinkering, not a sterile chart.

Recent ships have leaned heavily on cool dark blueprint/schematic themes and manuscript
editorial tones; this direction is deliberately warm, daylight, and industrial-tactile instead,
with a stenciled/spray-paint personality rather than a technical-drawing one.

## 2. Tokens

**Colors**
| Token | Value | Use |
|---|---|---|
| `--bg` | `#e8e0d0` | page background — bleached concrete |
| `--surface-1` | `#d9cdb4` | panel background — worn floor/cardstock |
| `--surface-2` | `#2b2620` | dark steel panel (HUD readouts, header bar) |
| `--surface-2-lift` | `#3a332b` | a raised step on `--surface-2` (stat rows, chips) |
| `--text` | `#241f19` | primary text on light surfaces |
| `--text-on-dark` | `#f2ead8` | primary text on `--surface-2` |
| `--text-muted` | `#544c40` | secondary/caption text |
| `--accent` | `#d5541a` | rust-orange — primary actions, active states, fills |
| `--accent-ink` | `#93380e` | the same rust for accent-coloured **text** (see below) |
| `--accent-bright` | `#e2673a` | the lit top edge of an `--accent` plate gradient |
| `--accent-support` | `#e8b400` | safety-yellow — highlights, best-of-generation marker |
| `--success` | `#4f7942` | goal reached / car finishes track |
| `--danger` | `#b3261e` | car flips / chassis breaks |

Two of these carry a contrast rule worth stating, because both were broken once:

- `--text-muted` started at `#6b6152`, which read 4.63:1 on `--bg` but only
  3.86:1 on `--surface-1`. Muted text lands on panels too, so it was darkened
  until it clears 4.5:1 on both.
- **`--accent` is a paint, not an ink.** At 2.61:1 on `--surface-1` and 3.13:1 on
  `--bg` it can fill a shape, draw a border, or set the wordmark (large display
  text needs only 3:1), but it fails AA at any word size. Anything text-sized and
  rust uses `--accent-ink`, which is the same hue at 70%: 4.74:1 and 5.69:1.

**Type**
- Display: **"Bungee"** (Google Fonts) — stenciled, industrial-poster weight, for the wordmark,
  page headings, and the generation counter. Fallback: `"Arial Black", sans-serif`.
- UI: **"IBM Plex Sans"** (Google Fonts) — clean and mechanical enough to feel workshop-native
  without competing with Bungee. Fallback: `system-ui, sans-serif`. Monospace variant
  (`"IBM Plex Mono"`) for numeric readouts (fitness score, generation index, wheel radius).

**Spacing / shape**
- 8px base spacing unit (8/16/24/32/48).
- Corner radius: 4px on panels (slightly rounded steel plate), 999px (pill) on buttons/badges.
- Shadow: a single hard-offset shadow (`4px 4px 0 rgba(36,31,25,0.25)`) on cards and buttons —
  reads as a stamped/stenciled plate, not a soft modern glow.
- Motion: UI transitions 150ms ease-out; game/physics feedback (impact flash, wheel spark) 80ms
  ease-out for snappiness.

## 3. Layout intent

The hero is **the simulation viewport** — the physics scene where the current generation's cars
run the track. At 1440×900 it fills ~65% of the viewport width with the generation slider and
playback controls docked directly beneath it (full width) and a slim stats rail (best fitness,
generation #, population size) docked to the right as a dark steel HUD panel. At 390×844 the
viewport stacks to full width at the top (≥55vh), controls and stats collapse beneath it in a
single column, and the HUD rail becomes a horizontal strip of three stat chips above the slider.
No dead space: the concrete-floor background carries a subtle tire-track/scratch texture so
empty regions never read as blank.

## 4. Signature detail

The wordmark **"Darwin's Garage"** is set in Bungee with the "G" in "Garage" replaced by a
simple drawn gear glyph that slowly rotates (CSS animation, pauses under
`prefers-reduced-motion`). It's the one flourish that says "this page was designed," and it
doubles as a loading indicator while generation 0 spins up.

## 5. The juice plan

- **Movement tween:** camera pans/zooms to follow the leading car with a 120ms ease-out lerp,
  never a hard cut.
- **Impact feedback:** a car's chassis flashes rust-orange and the HUD stat panel does a 2px
  shake for 80ms when a chassis piece detaches or the car flips.
- **Goal/success pop:** crossing the finish line pops a safety-yellow burst at the finish flag
  and increments the HUD "finishers" counter with a quick scale-bounce.
- **Win celebration:** when a generation produces a new best-ever fitness, the stats rail flashes
  gold, a small confetti burst (CSS/canvas particles, no library) fires from the HUD, and the
  car's silhouette is pinned to a "Hall of Fame" strip with a share-link button.
- **Synth SFX (WebAudio, generated in code, no audio files):**
  - `tick` — short triangle-wave blip, generation slider moves.
  - `clatter` — short noise burst, chassis piece detaches.
  - `thud` — low sine thump, car flips.
  - `chime` — ascending two-note sine, car crosses finish.
  - `fanfare` — short arpeggio, new best-ever fitness.
  - All routed through a shared gain node; a mute toggle (steel toggle switch widget) persists
    to `localStorage`; `AudioContext` is created lazily on first user gesture.
