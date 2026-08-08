export interface RepresentativePagePlan {
  /** Zero-based pages downloaded for the initial local preview. */
  initialPageIndexes: readonly number[];
  /** Zero-based pages downloaded in total, including the back page. */
  representativePageIndexes: readonly number[];
  backPageIndex: number;
}

/**
 * Selects pages 1, 2, 3, N by default, deduplicating short publications.
 * Initial pages stay contiguous so sparse-page URLs retain their true numbering.
 */
export const createRepresentativePagePlan = (
  pageCount: number,
  initialPageCount = 3,
): RepresentativePagePlan => {
  if (!Number.isSafeInteger(pageCount) || pageCount <= 0)
    throw new Error("pageCount must be a positive integer");
  if (!Number.isSafeInteger(initialPageCount) || initialPageCount <= 0)
    throw new Error("initialPageCount must be a positive integer");
  const initialPageIndexes = Array.from(
    {length: Math.min(pageCount, initialPageCount)},
    (_, index) => index,
  );
  const backPageIndex = pageCount - 1;
  return {
    initialPageIndexes,
    representativePageIndexes: [
      ...new Set([...initialPageIndexes, backPageIndex]),
    ],
    backPageIndex,
  };
};

export interface ConcurrentAcquisitionContext {
  /**
   * Signals that acquisition has reached the point where its expensive work is
   * in flight. The queue also signals this automatically when a task settles.
   */
  markStarted(): void;
}

export interface ConcurrentAcquisitionHandle {
  /** Stable, zero-based enqueue order. */
  index: number;
  /** Resolves once acquisition starts, is skipped, or is discarded. */
  started: Promise<void>;
}

export interface ConcurrentAcquisitionOutcome<Input, Prepared, Result> {
  index: number;
  input: Input;
  prepared: Prepared;
  result: Result;
}

export interface ConcurrentAcquisitionPipeline<Input, Prepared, Result> {
  abort(reason?: unknown): void;
  drain(): Promise<
    readonly ConcurrentAcquisitionOutcome<Input, Prepared, Result>[]
  >;
  enqueue(input: Input): ConcurrentAcquisitionHandle;
  getFailure(): unknown;
  hasFailed(): boolean;
}

export interface ConcurrentAcquisitionPipelineOptions<Input, Prepared, Result> {
  acquire(
    prepared: Prepared,
    context: ConcurrentAcquisitionContext,
  ): Promise<Result>;
  /** Maximum acquisitions in flight after serial preparation. */
  concurrency: number;
  /**
   * Resolves source metadata before acquisition. Preparation is deliberately
   * serial so providers can respect metadata API rate limits while downloads
   * from already-resolved items continue in parallel. Return undefined to skip.
   */
  prepare(input: Input): Promise<Prepared | undefined>;
}

interface QueuedAcquisition<Input> {
  index: number;
  input: Input;
  resolveStarted(): void;
}

interface SettledAcquisition<Input, Prepared, Result> {
  error?: unknown;
  failed: boolean;
  index: number;
  outcome?: ConcurrentAcquisitionOutcome<Input, Prepared, Result>;
}

/**
 * Streams discovered items through serial metadata preparation and bounded,
 * concurrent acquisition. This lets a provider keep searching while downloads
 * for earlier results are already in flight without rebuilding queue, ordering,
 * draining, and failure handling infrastructure.
 */
export const createConcurrentAcquisitionPipeline = <Input, Prepared, Result>(
  options: ConcurrentAcquisitionPipelineOptions<Input, Prepared, Result>,
): ConcurrentAcquisitionPipeline<Input, Prepared, Result> => {
  if (!Number.isSafeInteger(options.concurrency) || options.concurrency <= 0)
    throw new Error("concurrency must be a positive integer");

  const queue: QueuedAcquisition<Input>[] = [];
  const active = new Map<
    number,
    Promise<SettledAcquisition<Input, Prepared, Result>>
  >();
  const outcomes: ConcurrentAcquisitionOutcome<Input, Prepared, Result>[] = [];
  let failure: unknown;
  let failed = false;
  let nextIndex = 0;
  let worker: Promise<void> | undefined;

  const discardQueue = () => {
    for (const queued of queue.splice(0)) queued.resolveStarted();
  };

  const settleNext = async () => {
    if (active.size === 0) return;
    const settled = await Promise.race(active.values());
    active.delete(settled.index);
    if (settled.outcome) outcomes.push(settled.outcome);
    if (!settled.failed || failed) return;
    failed = true;
    failure = settled.error;
    discardQueue();
  };

  const processQueue = async () => {
    while (queue.length > 0 && !failed) {
      if (active.size >= options.concurrency) {
        await settleNext();
        continue;
      }
      const queued = queue.shift();
      if (!queued) continue;
      let prepared: Prepared | undefined;
      try {
        prepared = await options.prepare(queued.input);
      } catch (error) {
        failed = true;
        failure = error;
        queued.resolveStarted();
        discardQueue();
        break;
      }
      if (failed || prepared === undefined) {
        queued.resolveStarted();
        if (failed) break;
        continue;
      }
      let started = false;
      const markStarted = () => {
        if (started) return;
        started = true;
        queued.resolveStarted();
      };
      const acquisition = options
        .acquire(prepared, {markStarted})
        .then(
          (result): SettledAcquisition<Input, Prepared, Result> => ({
            failed: false,
            index: queued.index,
            outcome: {
              index: queued.index,
              input: queued.input,
              prepared,
              result,
            },
          }),
          (error): SettledAcquisition<Input, Prepared, Result> => ({
            error,
            failed: true,
            index: queued.index,
          }),
        )
        .finally(markStarted);
      active.set(queued.index, acquisition);
    }
  };

  const startWorker = () => {
    if (worker || failed || queue.length === 0) return;
    worker = processQueue().finally(() => {
      worker = undefined;
      if (queue.length > 0 && !failed) startWorker();
    });
  };

  const drain = async () => {
    while (worker || queue.length > 0) {
      startWorker();
      await worker;
    }
    while (active.size > 0) await settleNext();
    if (failed) throw failure;
    return outcomes.toSorted((left, right) => left.index - right.index);
  };

  return {
    abort: (reason = new Error("Acquisition pipeline aborted")) => {
      if (failed) return;
      failed = true;
      failure = reason;
      discardQueue();
    },
    drain,
    enqueue: (input) => {
      if (failed) throw failure;
      const index = nextIndex;
      nextIndex += 1;
      let resolveStarted = () => {};
      const started = new Promise<void>((resolvePromise) => {
        resolveStarted = resolvePromise;
      });
      queue.push({index, input, resolveStarted});
      startWorker();
      return {index, started};
    },
    getFailure: () => (failed ? failure : undefined),
    hasFailed: () => failed,
  };
};
