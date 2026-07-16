# Darwin's Garage

Watch a population of randomly-shaped vehicles evolve — real genetic algorithm, real 2D
physics — into fast, weird, working cars over generations. Then grab your favorite mutant's
replay and send it to a friend.

## What it is

Every car starts life as a random skeleton: a polygon chassis with wheels bolted on at random
points, random sizes, random suspension. Generation 1 is a pile of junk — vehicles that flop,
flip, and go nowhere on a bumpy test track. Darwin's Garage runs a real genetic algorithm
(fitness-proportionate selection, crossover between two parent chassis, mutation of wheel
position/size/chassis geometry) on that population, generation after generation, inside a live
Matter.js physics simulation. Scrub the generation slider forward and you watch evolution
actually work: by generation 40 something that resembles a four-wheeled car — a shape nobody
designed — is climbing a hill it has never seen, then nosing over at the one terrain feature it
never evolved to handle.

## Why it's interesting

Physics-based car evolution has been built before. What's hard — and what this project is
actually about — is the *tuning*: a fitness function, mutation rate, and selection pressure that
make evolution visibly converge instead of stalling on generation 3 or exploding into physics
garbage by generation 10. The genetic algorithm and the physics engine are both well-understood
building blocks; making them cooperate so progress is legible on a slider is the real skill on
display.

## Planned features

- **Evolution engine** — selection, crossover, and mutation over a chassis+wheel genome, run
  against Matter.js physics, generation after generation, with a fitness function tuned for
  visible, steady progress.
- **Generation scrubber** — a slider to jump to any past generation and replay its best (or any)
  individual, watching the population's shape change over time.
- **Shareable replay links** — any specific evolved car (its full genome + the generation it
  came from) can be exported to a URL and replayed by anyone who opens it, no server required.
- **Track editor** — a simple tool to draw custom terrain, so evolution can be pointed at hills,
  gaps, and obstacles you choose instead of only the built-in course.
- **Mobile-first touch controls** — the generation slider, playback controls, and track editor
  all work with touch, not just mouse/keyboard.

## Stack

- **JavaScript** (vanilla, ES modules) — no framework; this is a simulation + canvas app, not a
  component-heavy UI.
- **[Matter.js](https://brm.io/matter-js/)** for 2D rigid-body physics (chassis, wheels,
  constraints, terrain collision).
- **Canvas 2D** for rendering (population overview, single-car replay, track editor).
- Static site, zero backend — builds to a single directory, deployable to any static host.

## Status

Early scaffold. See [`docs/VISION.md`](docs/VISION.md) for the full design and
[`docs/BACKLOG.md`](docs/BACKLOG.md) for the build plan.

## Development

```bash
npm install
npm test        # run the test suite
npm run dev     # local dev server
```

## License

MIT — see [LICENSE](LICENSE).
