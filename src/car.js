// Turns a genome (plain data) into Matter.js bodies. This is the only module
// that knows about both representations; the evolution engine never sees a
// body, and the renderer never sees a genome.

import Matter from 'matter-js';
import { normalizeGenome } from './genome.js';

const { Bodies, Body, Composite, Constraint, Vertices } = Matter;

// Car parts share one negative collision group so a chassis never collides with
// its own wheels (Matter treats matching negative groups as never-colliding).
const CAR_COLLISION_GROUP = -1;

export const CAR_PHYSICS = Object.freeze({
  chassisDensity: 0.0008,
  chassisFriction: 0.6,
  wheelDensity: 0.0012,
  wheelFriction: 0.95,
  wheelFrictionStatic: 2,
  // Matter folds torque into angular velocity as torque * inverseInertia *
  // dt^2, so this scale is what turns a genome's 0.02-0.12 torque gene into a
  // wheel speed that actually climbs the default track. Tuned, not derived.
  motorScale: 18,
});

/**
 * Build the Matter bodies for one genome.
 * @param {object} genome - normalized on the way in; invalid genomes throw.
 * @param {{x?: number, y?: number}} [origin] - world position of the chassis centroid.
 * @returns {{composite: object, chassis: object, wheels: object[], genome: object}}
 */
export function buildCar(genome, origin = {}) {
  const safe = normalizeGenome(genome);
  const x = Number.isFinite(origin.x) ? origin.x : 0;
  const y = Number.isFinite(origin.y) ? origin.y : 0;

  // Hull the polygon ourselves rather than letting Bodies.fromVertices fall
  // back to its own hulling: it keeps the shape convex (so Matter never needs
  // poly-decomp) and gives us the exact vertex set the offsets are measured
  // against below.
  const hull = Vertices.hull(safe.chassis.map((p) => ({ x: p.x, y: p.y })));
  const centre = Vertices.centre(hull);

  const chassis = Bodies.fromVertices(x, y, [hull], {
    label: 'chassis',
    density: CAR_PHYSICS.chassisDensity,
    friction: CAR_PHYSICS.chassisFriction,
    collisionFilter: { group: CAR_COLLISION_GROUP },
  });

  const parts = [chassis];
  const wheels = safe.wheels.map((wheel, i) => {
    const vertex = safe.chassis[wheel.vertexIndex];
    // Matter places a hull vertex v at body.position + (v - centre(hull)), so
    // the same offset expresses the attachment point relative to the chassis's
    // centre of mass — valid even when hulling dropped that vertex.
    const offset = { x: vertex.x - centre.x, y: vertex.y - centre.y };
    const body = Bodies.circle(x + offset.x, y + offset.y, wheel.radius, {
      label: `wheel-${i}`,
      density: CAR_PHYSICS.wheelDensity,
      friction: CAR_PHYSICS.wheelFriction,
      frictionStatic: CAR_PHYSICS.wheelFrictionStatic,
      collisionFilter: { group: CAR_COLLISION_GROUP },
    });
    // A zero-length rigid constraint is a pin joint: the wheel is held at the
    // vertex but spins freely, which is exactly a driven axle.
    const constraint = Constraint.create({
      bodyA: chassis,
      pointA: offset,
      bodyB: body,
      pointB: { x: 0, y: 0 },
      length: 0,
      stiffness: 1,
    });
    parts.push(body, constraint);
    return { body, constraint, torque: wheel.torque, radius: wheel.radius };
  });

  const composite = Composite.create({ label: 'car' });
  Composite.add(composite, parts);

  return { composite, chassis, wheels, genome: safe };
}

/**
 * Drive every wheel one step. Positive torque spins wheels clockwise, which
 * rolls the car to the right (canvas y grows downward).
 * @param {{wheels: object[]}} car
 */
export function applyMotor(car) {
  for (const wheel of car.wheels) {
    wheel.body.torque = wheel.torque * CAR_PHYSICS.motorScale;
  }
}

/** True when any body of the car has drifted to a non-finite position. */
export function hasNaNPosition(car) {
  const bodies = [car.chassis, ...car.wheels.map((w) => w.body)];
  return bodies.some(
    (b) =>
      !Number.isFinite(b.position.x) ||
      !Number.isFinite(b.position.y) ||
      !Number.isFinite(b.angle),
  );
}

/**
 * Chassis tilt in radians, normalized to [0, PI]. A car that has rolled onto
 * its roof reads near PI; upright reads near 0.
 */
export function chassisTilt(car) {
  const angle = Math.abs(normalizeAngle(car.chassis.angle));
  return angle;
}

/** Wrap an angle to [-PI, PI]. */
export function normalizeAngle(angle) {
  const wrapped = ((angle + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
  return wrapped - Math.PI;
}

/**
 * The chassis outline in body-local space (relative to its centre of mass) —
 * what the renderer draws and what the population overview draws silhouettes
 * from. Matches the hull buildCar gives the physics, so the picture and the
 * simulation always agree.
 * @returns {{x: number, y: number}[]}
 */
export function chassisOutline(genome) {
  const safe = normalizeGenome(genome);
  const hull = Vertices.hull(safe.chassis.map((p) => ({ x: p.x, y: p.y })));
  const centre = Vertices.centre(hull);
  return hull.map((p) => ({ x: p.x - centre.x, y: p.y - centre.y }));
}

/**
 * Where each wheel sits in body-local space, with its radius. Lets the renderer
 * draw a car from a genome alone, without building physics bodies for it.
 */
export function wheelAnchors(genome) {
  const safe = normalizeGenome(genome);
  const hull = Vertices.hull(safe.chassis.map((p) => ({ x: p.x, y: p.y })));
  const centre = Vertices.centre(hull);
  return safe.wheels.map((wheel) => {
    const vertex = safe.chassis[wheel.vertexIndex];
    return {
      x: vertex.x - centre.x,
      y: vertex.y - centre.y,
      radius: wheel.radius,
      torque: wheel.torque,
    };
  });
}

/** Rest the car on the ground: the y at which its lowest point touches height. */
export function lowestOffset(genome) {
  const safe = normalizeGenome(genome);
  const hull = Vertices.hull(safe.chassis.map((p) => ({ x: p.x, y: p.y })));
  const centre = Vertices.centre(hull);
  let lowest = Math.max(...hull.map((p) => p.y - centre.y));
  for (const wheel of safe.wheels) {
    const vertex = safe.chassis[wheel.vertexIndex];
    lowest = Math.max(lowest, vertex.y - centre.y + wheel.radius);
  }
  return lowest;
}

export { Body, Composite };
