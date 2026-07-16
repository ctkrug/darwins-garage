// A genome describes one vehicle: a polygonal chassis plus a set of wheels,
// each attached at a vertex index with its own radius. The evolution engine
// (selection/crossover/mutation) and the physics builder both consume this
// shape, so it's kept as plain data rather than a class.

const MIN_CHASSIS_VERTICES = 5;
const MAX_CHASSIS_VERTICES = 8;
const MIN_WHEELS = 2;
const MAX_WHEELS = 4;
const MIN_WHEEL_RADIUS = 10;
const MAX_WHEEL_RADIUS = 35;
const CHASSIS_RADIUS = 60;

function randomInt(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

export function createRandomGenome(rng = Math.random) {
  const vertexCount = randomInt(rng, MIN_CHASSIS_VERTICES, MAX_CHASSIS_VERTICES);
  const chassis = Array.from({ length: vertexCount }, (_, i) => {
    const angle = (i / vertexCount) * Math.PI * 2;
    const jitter = 0.5 + rng();
    return {
      x: Math.cos(angle) * CHASSIS_RADIUS * jitter,
      y: Math.sin(angle) * CHASSIS_RADIUS * jitter,
    };
  });

  const wheelCount = randomInt(rng, MIN_WHEELS, MAX_WHEELS);
  const wheels = Array.from({ length: wheelCount }, () => ({
    vertexIndex: randomInt(rng, 0, vertexCount - 1),
    radius: MIN_WHEEL_RADIUS + rng() * (MAX_WHEEL_RADIUS - MIN_WHEEL_RADIUS),
  }));

  return { chassis, wheels };
}
