import Matter from 'matter-js';
import { createRandomGenome } from './genome.js';

const canvas = document.getElementById('scene');
const ctx = canvas.getContext('2d');

function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);
resize();

// Placeholder physics world: proves Matter.js is wired up before the real
// evolution loop lands. A single random genome stands in for a population.
const engine = Matter.Engine.create();
const ground = Matter.Bodies.rectangle(400, 610, 810, 60, { isStatic: true });
Matter.Composite.add(engine.world, [ground]);
Matter.Engine.update(engine, 1000 / 60);

const genome = createRandomGenome();

function draw() {
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
  ctx.fillStyle = '#eee';
  ctx.font = '24px sans-serif';
  ctx.fillText("Darwin's Garage — evolution engine coming soon", 24, 48);
  ctx.font = '14px monospace';
  ctx.fillText(
    `seed genome: ${genome.chassis.length} vertices, ${genome.wheels.length} wheels`,
    24,
    76,
  );
}

draw();
