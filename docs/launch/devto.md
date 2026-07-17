---
title: I rebuilt BoxCar2D in JavaScript, and the hard part was not the genetic algorithm
published: false
tags: javascript, showdev, gamedev, algorithms
---

BoxCar2D was a Flash toy where random two-dimensional cars evolved to drive over hills. I lost an
afternoon to it years ago. Flash went away at the end of 2020 and took it with it, so I rebuilt the
idea in plain JavaScript with Matter.js doing the physics: [Darwin's Garage](https://apps.charliekrug.com/darwins-garage/).

Twenty-four vehicles get built out of random numbers. Each drives a hill course. The ones that get
furthest breed. Forty generations later something nobody designed is climbing the whole thing.
[The source is on GitHub](https://github.com/ctkrug/darwins-garage). Here is what I expected to be
hard, and what actually was.

## The genetic algorithm is the easy part

Selection, crossover, and mutation are about 170 lines between them. A genome is a polygon chassis
of five to eight vertices plus wheels bolted to random vertices with a radius and a torque:

```js
{
  chassis: [{ x: 30, y: 0 }, { x: 24, y: 73 }, { x: -62, y: 45 }, ...],
  wheels: [{ vertexIndex: 0, radius: 16, torque: 0.006 }, ...]
}
```

Crossover splices two parent chassis, mutation jitters the numbers, and tournament selection picks
parents in small brackets so a mediocre car still gets an occasional shot. None of it is clever,
and none of it is where the time went.

## The tuning is the whole project

The first version converged by generation 3 and then sat there. The second exploded into physics
garbage by generation 10, because a big enough mutation on wheel radius produces a car whose
wheels intersect its own chassis and Matter.js resolves that by launching it into orbit.

What fixed it was not the algorithm, it was the track. The course is now shaped as a story: a flat
run-up where generation 0 cannot get moving, then a rubble field, then a long climb. The rubble
field is the important bit. It filters out the shapes that only topple forward, which is the local
optimum that every naive version of this finds and never leaves. The rubble amplitude and the climb
height are tuned against the real evolution loop rather than drawn by eye:

> flatten the rubble and generation 4 already finishes, sharpen it and nothing ever does

That comment is in `track.js` because I needed to write it down after the fourth retune.

## Determinism buys you a share button with no backend

Physics with a fixed timestep is deterministic. Same genome plus same track equals the same run,
every time, on any machine. That means a car does not need to be stored anywhere: the genome *is*
the save file, and it fits in a URL.

```js
// version | generation | trackId | chassis | wheels | checksum
'1|15|default-hill|30,0;24,73;-62,45|0,16,0.006;1,33,0.038|1hkc1gg'
```

Base64url that and you have a share link with no server, no database row, and nothing to run.

That checksum exists because of a bug I found late. I truncated a link to check the error handling,
and it worked: it decoded fine and gave me a car. A different car. Chopping characters off the end
usually still parses, because the last wheel falls off the list and a four-wheel chassis quietly
arrives as a three-wheel one. Of 24 truncation lengths I tried, 18 decoded into a valid but wrong
vehicle, which is the worst possible failure for a feature that promises to replay the exact same
car. An FNV-1a hash of the body now rides on the end, and a link that lost its tail is refused
rather than silently lying.

## The camera bug I stared straight through

For a long time the phone layout looked empty and I could not say why. The car was correct, the
terrain was correct, everything was just small and adrift near the bottom of a lot of nothing.

The renderer scaled world-to-pixels off the canvas *width*:

```js
const scale = () => width / WORLD_WIDTH;
```

Which means the visible world *height* is whatever the aspect ratio says it is. On a wide desktop
bay that is fine. On a tall phone viewport it silently opens up to over a thousand world units of
vertical space for a car about a hundred units tall. The fix is to cap both axes and take whichever
one binds:

```js
export function viewScale(width, height) {
  return Math.max(width / MAX_WORLD_WIDTH, height / MAX_WORLD_HEIGHT);
}
```

Now a car is the same fraction of the frame at 390px as at 1440px. There is a test that asserts
exactly that, because it is the kind of thing that reads fine and looks wrong.

## What I would do differently

I would build the fitness curve first. It is a small chart of best-and-average per generation, and
it is the only thing that tells you whether a tuning change helped. I spent the early days judging
runs by watching them, which is slow and a great way to fool yourself, since one lucky car looks
like progress. Once the average line sat next to the best line, tuning stopped being guesswork.

I would also have written the camera maths as pure functions from the start. They were buried in a
closure that needed a real canvas, so they went untested, which is exactly why the aspect-ratio bug
lived as long as it did.

[Try it](https://apps.charliekrug.com/darwins-garage/) · [Source](https://github.com/ctkrug/darwins-garage)
