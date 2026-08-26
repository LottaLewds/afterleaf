import {describe, expect, test} from "bun:test";

import {PaperSheetSimulation} from "~/game/PaperSheetSimulation";

const COLUMNS = 3;
const ROWS = 3;
const WIDTH = 0.5;
const HEIGHT = 0.74;

const createUvs = () => {
  const uvs = new Float32Array(COLUMNS * ROWS * 2);
  for (let row = 0; row < ROWS; row += 1) {
    for (let column = 0; column < COLUMNS; column += 1) {
      const uvOffset = (row * COLUMNS + column) * 2;
      uvs[uvOffset] = column / (COLUMNS - 1);
      uvs[uvOffset + 1] = row / (ROWS - 1);
    }
  }
  return uvs;
};

const createTarget = (turnAngle: number) => {
  const positions = new Float32Array(COLUMNS * ROWS * 3);
  for (let row = 0; row < ROWS; row += 1) {
    for (let column = 0; column < COLUMNS; column += 1) {
      const positionOffset = (row * COLUMNS + column) * 3;
      const edgeDistance = (column / (COLUMNS - 1)) * WIDTH;
      positions[positionOffset] = edgeDistance * Math.cos(turnAngle);
      positions[positionOffset + 1] = (row / (ROWS - 1) - 0.5) * HEIGHT;
      positions[positionOffset + 2] = edgeDistance * Math.sin(turnAngle);
    }
  }
  return positions;
};

const createSimulation = () =>
  new PaperSheetSimulation({
    columns: COLUMNS,
    height: HEIGHT,
    rows: ROWS,
    uvs: createUvs(),
    width: WIDTH,
  });

describe("paper sheet simulation", () => {
  test("pins the spine while gravity pulls a lifted free edge toward a stack", () => {
    const simulation = createSimulation();
    const target = createTarget(Math.PI * 0.45);
    const output = new Float32Array(target.length);
    simulation.reset(target);

    for (let frame = 0; frame < 12; frame += 1)
      simulation.step({
        deltaSeconds: 1 / 60,
        dragging: false,
        grabU: 1,
        grabV: 0.5,
        outputPositions: output,
        targetPositions: target,
      });

    const spineCenterOffset = COLUMNS * 3;
    const edgeCenterOffset = (COLUMNS + COLUMNS - 1) * 3;
    expect(output[spineCenterOffset]).toBeCloseTo(target[spineCenterOffset] ?? 0);
    expect(output[spineCenterOffset + 2]).toBeCloseTo(0);
    expect(output[edgeCenterOffset + 2] ?? 0).toBeLessThan(target[edgeCenterOffset + 2] ?? 0);
    expect(output[edgeCenterOffset + 2] ?? 0).toBeGreaterThan(0);
    expect((target[edgeCenterOffset + 2] ?? 0) - (output[edgeCenterOffset + 2] ?? 0)).toBeLessThan(WIDTH * 0.025);
  });

  test("pins the grabbed point to the animated hand target", () => {
    const simulation = createSimulation();
    const source = createTarget(0);
    const lifted = createTarget(Math.PI / 2);
    const output = new Float32Array(source.length);
    simulation.reset(source);
    simulation.step({
      deltaSeconds: 1 / 60,
      dragging: true,
      grabU: 1,
      grabV: 0.5,
      outputPositions: output,
      targetPositions: lifted,
    });

    const grabbedOffset = (COLUMNS + COLUMNS - 1) * 3;
    expect(output[grabbedOffset]).toBeCloseTo(lifted[grabbedOffset] ?? 0);
    expect(output[grabbedOffset + 1]).toBeCloseTo(lifted[grabbedOffset + 1] ?? 0);
    expect(output[grabbedOffset + 2]).toBeCloseTo(lifted[grabbedOffset + 2] ?? 0);
  });

  test("pulls the free edge as a coherent sheet instead of leaving loose corners", () => {
    const simulation = createSimulation();
    const source = createTarget(0);
    const lifted = createTarget(Math.PI / 2);
    const output = new Float32Array(source.length);
    simulation.reset(source);

    for (let frame = 0; frame < 12; frame += 1)
      simulation.step({
        deltaSeconds: 1 / 60,
        dragging: true,
        grabU: 1,
        grabV: 0.5,
        outputPositions: output,
        targetPositions: lifted,
      });

    const bottomEdgeOffset = (COLUMNS - 1) * 3;
    const topEdgeOffset = (COLUMNS * ROWS - 1) * 3;
    expect(output[bottomEdgeOffset + 2] ?? 0).toBeGreaterThan(WIDTH * 0.85);
    expect(output[topEdgeOffset + 2] ?? 0).toBeGreaterThan(WIDTH * 0.85);
    expect(Math.abs((output[topEdgeOffset + 2] ?? 0) - (output[bottomEdgeOffset + 2] ?? 0))).toBeLessThan(WIDTH * 0.02);
  });

  test("settles on the destination side after crossing the vertical", () => {
    const simulation = createSimulation();
    const crossed = createTarget(Math.PI * 0.6);
    const destination = createTarget(Math.PI);
    const output = new Float32Array(crossed.length);
    simulation.reset(crossed);

    for (let frame = 0; frame < 90; frame += 1)
      simulation.step({
        deltaSeconds: 1 / 60,
        dragging: false,
        grabU: 1,
        grabV: 0.5,
        outputPositions: output,
        targetPositions: destination,
      });

    const edgeCenterOffset = (COLUMNS + COLUMNS - 1) * 3;
    expect(output[edgeCenterOffset] ?? 0).toBeLessThan(0);
    expect(output[edgeCenterOffset + 2] ?? 0).toBeCloseTo(0, 2);
  });
});
