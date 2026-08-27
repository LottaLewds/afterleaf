const FIXED_STEP_SECONDS = 1 / 120;
const MAX_SUBSTEPS = 6;
const SOLVER_ITERATIONS = 6;
const VELOCITY_DAMPING = 0.72;
const DRAG_SHAPE_PULL = 180;
const RELEASED_SHAPE_PULL = 260;
const PAGE_NORMAL_GRAVITY = 0.8;
const WORLD_DOWN_GRAVITY = 0.04;

type PaperSheetSimulationOptions = {
  columns: number;
  height: number;
  rows: number;
  uvs: Float32Array;
  width: number;
};

export type PaperSheetStep = {
  deltaSeconds: number;
  dragging: boolean;
  grabU: number;
  grabV: number;
  outputPositions: Float32Array;
  targetPositions: Float32Array;
};

const finiteDeltaSeconds = (deltaSeconds: number) => (Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0);

// Compound assignment reads the current slot, which may be out of bounds under
// noUncheckedIndexedAccess, so fall back to 0 like every other read here.
const addTo = (array: Float32Array, offset: number, delta: number) => {
  array[offset] = (array[offset] ?? 0) + delta;
};

const subtractFrom = (array: Float32Array, offset: number, delta: number) => {
  array[offset] = (array[offset] ?? 0) - delta;
};

export class PaperSheetSimulation {
  readonly #constraintA: Uint16Array;
  readonly #constraintB: Uint16Array;
  readonly #constraintRestLength: Float32Array;
  readonly #constraintStiffness: Float32Array;
  readonly #positions: Float32Array;
  readonly #previousPositions: Float32Array;
  readonly #spineMask: Uint8Array;
  readonly #uvs: Float32Array;
  #accumulatorSeconds = 0;
  #initialized = false;

  constructor(options: PaperSheetSimulationOptions) {
    const columns = Math.max(2, Math.trunc(options.columns));
    const rows = Math.max(2, Math.trunc(options.rows));
    const vertexCount = columns * rows;
    this.#uvs = options.uvs;
    this.#positions = new Float32Array(vertexCount * 3);
    this.#previousPositions = new Float32Array(vertexCount * 3);
    this.#spineMask = new Uint8Array(vertexCount);
    for (let index = 0; index < vertexCount; index += 1)
      this.#spineMask[index] = (this.#uvs[index * 2] ?? 1) < 0.001 ? 1 : 0;

    const constraintA: number[] = [];
    const constraintB: number[] = [];
    const constraintRestLength: number[] = [];
    const constraintStiffness: number[] = [];
    const stepX = options.width / (columns - 1);
    const stepY = options.height / (rows - 1);
    const addConstraint = (first: number, second: number, restLength: number, stiffness: number) => {
      constraintA.push(first);
      constraintB.push(second);
      constraintRestLength.push(restLength);
      constraintStiffness.push(stiffness);
    };
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const index = row * columns + column;
        if (column + 1 < columns) addConstraint(index, index + 1, stepX, 0.999);
        if (row + 1 < rows) addConstraint(index, index + columns, stepY, 0.999);
        if (column + 1 < columns && row + 1 < rows) {
          const diagonalLength = Math.hypot(stepX, stepY);
          addConstraint(index, index + columns + 1, diagonalLength, 0.985);
          addConstraint(index + 1, index + columns, diagonalLength, 0.985);
        }
        if (column + 2 < columns) addConstraint(index, index + 2, stepX * 2, 0.92);
        if (row + 2 < rows) addConstraint(index, index + columns * 2, stepY * 2, 0.92);
        if (column + 4 < columns) addConstraint(index, index + 4, stepX * 4, 0.72);
        if (row + 4 < rows) addConstraint(index, index + columns * 4, stepY * 4, 0.72);
      }
    }
    this.#constraintA = Uint16Array.from(constraintA);
    this.#constraintB = Uint16Array.from(constraintB);
    this.#constraintRestLength = Float32Array.from(constraintRestLength);
    this.#constraintStiffness = Float32Array.from(constraintStiffness);
  }

  reset(targetPositions: Float32Array) {
    this.#positions.set(targetPositions);
    this.#previousPositions.set(targetPositions);
    this.#accumulatorSeconds = 0;
    this.#initialized = true;
  }

  step(step: PaperSheetStep) {
    if (!this.#initialized) this.reset(step.targetPositions);
    this.#accumulatorSeconds = Math.min(
      FIXED_STEP_SECONDS * MAX_SUBSTEPS,
      this.#accumulatorSeconds + finiteDeltaSeconds(step.deltaSeconds),
    );
    const grabIndex = step.dragging ? this.#closestVertex(step.grabU, step.grabV) : -1;
    let substepCount = 0;
    while (this.#accumulatorSeconds >= FIXED_STEP_SECONDS && substepCount < MAX_SUBSTEPS) {
      this.#integrate(step.targetPositions, step.dragging);
      for (let iteration = 0; iteration < SOLVER_ITERATIONS; iteration += 1) {
        this.#solveDistanceConstraints(grabIndex);
        this.#pinAnchors(step.targetPositions, grabIndex);
        this.#projectOntoPageStacks();
      }
      this.#accumulatorSeconds -= FIXED_STEP_SECONDS;
      substepCount += 1;
    }
    step.outputPositions.set(this.#positions);
  }

  #closestVertex(grabU: number, grabV: number) {
    let closestDistanceSquared = Number.POSITIVE_INFINITY;
    let closestIndex = 0;
    for (let index = 0; index < this.#spineMask.length; index += 1) {
      const deltaU = (this.#uvs[index * 2] ?? 0) - grabU;
      const deltaV = (this.#uvs[index * 2 + 1] ?? 0) - grabV;
      const distanceSquared = deltaU * deltaU + deltaV * deltaV;
      if (distanceSquared >= closestDistanceSquared) continue;
      closestDistanceSquared = distanceSquared;
      closestIndex = index;
    }
    return closestIndex;
  }

  #integrate(targetPositions: Float32Array, dragging: boolean) {
    const fixedStepSquared = FIXED_STEP_SECONDS * FIXED_STEP_SECONDS;
    const shapePull = dragging ? DRAG_SHAPE_PULL : RELEASED_SHAPE_PULL;
    for (let index = 0; index < this.#spineMask.length; index += 1) {
      const positionOffset = index * 3;
      if (this.#spineMask[index]) {
        this.#writeTargetPosition(targetPositions, positionOffset);
        continue;
      }
      for (let axis = 0; axis < 3; axis += 1) {
        const offset = positionOffset + axis;
        const position = this.#positions[offset] ?? 0;
        const previousPosition = this.#previousPositions[offset] ?? position;
        const targetPosition = targetPositions[offset] ?? position;
        this.#previousPositions[offset] = position;
        this.#positions[offset] =
          position +
          (position - previousPosition) * VELOCITY_DAMPING +
          (targetPosition - position) * shapePull * fixedStepSquared;
      }
      subtractFrom(this.#positions, positionOffset + 1, WORLD_DOWN_GRAVITY * fixedStepSquared);
      subtractFrom(this.#positions, positionOffset + 2, PAGE_NORMAL_GRAVITY * fixedStepSquared);
    }
  }

  #applyDistanceConstraintCorrection(
    firstOffset: number,
    secondOffset: number,
    deltaX: number,
    deltaY: number,
    deltaZ: number,
    firstCorrection: number,
    secondCorrection: number,
  ) {
    addTo(this.#positions, firstOffset, deltaX * firstCorrection);
    addTo(this.#positions, firstOffset + 1, deltaY * firstCorrection);
    addTo(this.#positions, firstOffset + 2, deltaZ * firstCorrection);
    subtractFrom(this.#positions, secondOffset, deltaX * secondCorrection);
    subtractFrom(this.#positions, secondOffset + 1, deltaY * secondCorrection);
    subtractFrom(this.#positions, secondOffset + 2, deltaZ * secondCorrection);
    addTo(this.#previousPositions, firstOffset, deltaX * firstCorrection);
    addTo(this.#previousPositions, firstOffset + 1, deltaY * firstCorrection);
    addTo(this.#previousPositions, firstOffset + 2, deltaZ * firstCorrection);
    subtractFrom(this.#previousPositions, secondOffset, deltaX * secondCorrection);
    subtractFrom(this.#previousPositions, secondOffset + 1, deltaY * secondCorrection);
    subtractFrom(this.#previousPositions, secondOffset + 2, deltaZ * secondCorrection);
  }

  #applyDistanceConstraint(
    constraintIndex: number,
    firstOffset: number,
    secondOffset: number,
    firstWeight: number,
    secondWeight: number,
    totalWeight: number,
  ) {
    const deltaX = (this.#positions[secondOffset] ?? 0) - (this.#positions[firstOffset] ?? 0);
    const deltaY = (this.#positions[secondOffset + 1] ?? 0) - (this.#positions[firstOffset + 1] ?? 0);
    const deltaZ = (this.#positions[secondOffset + 2] ?? 0) - (this.#positions[firstOffset + 2] ?? 0);
    const distance = Math.hypot(deltaX, deltaY, deltaZ);
    if (distance < 1e-7) return;
    const correction =
      ((distance - (this.#constraintRestLength[constraintIndex] ?? 0)) / distance) *
      (this.#constraintStiffness[constraintIndex] ?? 0);
    const firstCorrection = (correction * firstWeight) / totalWeight;
    const secondCorrection = (correction * secondWeight) / totalWeight;
    this.#applyDistanceConstraintCorrection(
      firstOffset,
      secondOffset,
      deltaX,
      deltaY,
      deltaZ,
      firstCorrection,
      secondCorrection,
    );
  }

  #solveDistanceConstraint(constraintIndex: number, grabIndex: number) {
    const firstIndex = this.#constraintA[constraintIndex] ?? 0;
    const secondIndex = this.#constraintB[constraintIndex] ?? 0;
    const firstWeight = this.#spineMask[firstIndex] || firstIndex === grabIndex ? 0 : 1;
    const secondWeight = this.#spineMask[secondIndex] || secondIndex === grabIndex ? 0 : 1;
    const totalWeight = firstWeight + secondWeight;
    if (totalWeight === 0) return;
    const firstOffset = firstIndex * 3;
    const secondOffset = secondIndex * 3;
    this.#applyDistanceConstraint(constraintIndex, firstOffset, secondOffset, firstWeight, secondWeight, totalWeight);
  }

  #solveDistanceConstraints(grabIndex: number) {
    for (let constraintIndex = 0; constraintIndex < this.#constraintA.length; constraintIndex += 1)
      this.#solveDistanceConstraint(constraintIndex, grabIndex);
  }

  #pinAnchors(targetPositions: Float32Array, grabIndex: number) {
    for (let index = 0; index < this.#spineMask.length; index += 1) {
      if (!this.#spineMask[index] && index !== grabIndex) continue;
      this.#writeTargetPosition(targetPositions, index * 3);
    }
  }

  #projectOntoPageStacks() {
    for (let index = 0; index < this.#spineMask.length; index += 1) {
      const zOffset = index * 3 + 2;
      if ((this.#positions[zOffset] ?? 0) >= 0) continue;
      this.#positions[zOffset] = 0;
      if ((this.#previousPositions[zOffset] ?? 0) < 0) this.#previousPositions[zOffset] = 0;
    }
  }

  #writeTargetPosition(targetPositions: Float32Array, positionOffset: number) {
    this.#positions[positionOffset] = targetPositions[positionOffset] ?? 0;
    this.#positions[positionOffset + 1] = targetPositions[positionOffset + 1] ?? 0;
    this.#positions[positionOffset + 2] = targetPositions[positionOffset + 2] ?? 0;
    this.#previousPositions[positionOffset] = this.#positions[positionOffset] ?? 0;
    this.#previousPositions[positionOffset + 1] = this.#positions[positionOffset + 1] ?? 0;
    this.#previousPositions[positionOffset + 2] = this.#positions[positionOffset + 2] ?? 0;
  }
}
