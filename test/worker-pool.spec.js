const { WorkerPool } = require('..');
const path = require('path');

const workerPath = path.resolve(__dirname, './worker');

describe('Worker pool specs', () => {
  test('should resolve, reject and handle task events', async () => {
    const pool = new WorkerPool(workerPath, { workerData: null });
    await pool.init();

    // Resolve
    const { promise: resolvePromise } = pool.runTask({
      type: 'add',
      params: { a: 1, b: 2 },
    });
    await expect(resolvePromise).resolves.toBe(3);

    // Reject
    const { promise: rejectPromise } = pool.runTask({ type: 'failure' });
    await expect(rejectPromise).rejects.toThrow('Test');

    // Handle events
    const onEvent = jest.fn();
    const { promise } = pool.runTask({ type: 'long-process', onEvent });
    await promise;
    expect(onEvent).toHaveBeenCalledTimes(3);
    expect(onEvent).toHaveBeenCalledWith('progress', { processed: 3, total: 10 });
    expect(onEvent).toHaveBeenCalledWith('progress', { processed: 7, total: 10 });
    expect(onEvent).toHaveBeenCalledWith('progress', { processed: 10, total: 10 });

    await pool.close();
  });

  test('should run tasks based on priority and complete all with limited workers', async () => {
    const pool = new WorkerPool(workerPath, {}, { poolSize: 1 });
    await pool.init();

    const taskCount = 10;
    const taskCompletedTimes = new Array(taskCount);
    const taskPromises = new Array(taskCount);
    for (let i = 0; i < taskCount; i++) {
      const { promise } = pool.runTask({
        type: 'add',
        priority: taskCount - i,
        params: { a: i, b: i },
      });
      promise.then(() => {
        taskCompletedTimes[i] = performance.now();
      });
      taskPromises[i] = promise;
    }
    await Promise.all(taskPromises);
    taskCompletedTimes.splice(0, 1); // the 1st task is not queued
    expect(taskCompletedTimes).toEqual(taskCompletedTimes.slice().sort((a, b) => b - a));

    await pool.close();
  });

  test('should acquire worker, run task with it and release the worker', async () => {
    const pool = new WorkerPool(workerPath, {}, { poolSize: 1 });
    await pool.init();

    // Acquire worker and run task with the worker
    const { worker, release } = await pool.acquireWorker();
    const { promise: task1Promise } = pool.runTask(
      {
        type: 'add',
        params: { a: 1, b: 2 },
      },
      worker,
    );
    await expect(task1Promise).resolves.toBe(3);

    // Run task, then release the worker, task should be run after the worker is released
    let taskCompletedTime = performance.now();
    const { promise: task2Promise } = pool.runTask({
      type: 'add',
      params: { a: 1, b: 2 },
    });
    task2Promise.then(() => taskCompletedTime = performance.now());
    release();
    const workerReleasedTime = performance.now();
    await task2Promise;
    expect(workerReleasedTime).toBeLessThan(taskCompletedTime);

    await pool.close();
  });

  test('should wait for worker to be idle before acquiring', async () => {
    const pool = new WorkerPool(workerPath, {}, { poolSize: 1 });
    await pool.init();

    const { promise: taskCompletedPromise } = pool.runTask({
      type: 'add',
      params: { a: 1, b: 2 },
    });
    const acquireWorkerPromise = pool.acquireWorker();
    let workerAcquiredTime = performance.now();
    let taskCompletedTime = performance.now();
    acquireWorkerPromise.then(() => {
      workerAcquiredTime = performance.now();
    });
    taskCompletedPromise.then(() => {
      taskCompletedTime = performance.now();
    });
    await Promise.all([acquireWorkerPromise, taskCompletedPromise]);
    expect(taskCompletedTime).toBeLessThan(workerAcquiredTime);

    await pool.close();
  });

  test('should auto scale the pool', async () => {
    const pool = new WorkerPool(workerPath, {}, {
      poolSize: 2,
      autoScale: true,
      autoShrinkInterval: 10,
      minPoolSize: 1,
      maxPoolSize: 4,
    });
    await pool.init();

    const checkGrow = async () => {
      return new Promise((resolve) => setImmediate(async () => {
        if (pool.stats.poolSize !== 4) {
          await checkGrow();
        }
        resolve();
      }));
    };
    const checkShrink = async () => {
      return new Promise((resolve) => setImmediate(async () => {
        if (pool.stats.poolSize !== 1) {
          await checkShrink();
        }
        resolve();
      }));
    };

    const taskPromises = [];
    for (let i = 0; i < 10; i++) {
      const { promise } = pool.runTask({
        type: 'add',
        params: { a: i, b: i },
      });
      taskPromises.push(promise);
    }

    await checkGrow();
    await Promise.all(taskPromises);
    await checkShrink();

    await pool.close();
  });

  test('should reject all running tasks and queued tasks when closing the pool', async () => {
    let pool;
    let assertPromise;

    pool = new WorkerPool(workerPath, {}, { poolSize: 1 });
    await pool.init();
    const { promise: task1Promise } = pool.runTask({
      type: 'add',
      params: { a: 1, b: 2 },
    });
    assertPromise = expect(task1Promise).rejects.toThrow('Pool closed');
    await pool.close();
    await assertPromise;

    pool = new WorkerPool(workerPath, {}, { poolSize: 1 });
    await pool.init();
    await pool.acquireWorker();
    const { promise: task2Promise } = pool.runTask({
      type: 'add',
      params: { a: 1, b: 2 },
    });
    assertPromise = expect(task2Promise).rejects.toThrow('Pool closed');
    await pool.close();
    await assertPromise;
  });

  test('should abort tasks that are waiting for growing pool and queued tasks', async () => {
    let pool = new WorkerPool(workerPath, {}, {
      poolSize: 1,
      autoScale: true,
      minPoolSize: 1,
      maxPoolSize: 2,
    });
    await pool.init();
    const taskPromises = [];
    for (let i = 0; i < 10; i++) {
      const { promise, abort } = pool.runTask({
        type: 'add',
        params: { a: i, b: i },
      });
      taskPromises.push(promise);
      abort();
    }
    await Promise.allSettled(taskPromises);
    await expect(Promise.all(taskPromises)).rejects.toThrow('Task aborted');
    await pool.close();

    pool = new WorkerPool(workerPath, {}, { poolSize: 1 });
    await pool.init();
    const { release } = await pool.acquireWorker();
    const { promise, abort } = pool.runTask({
      type: 'add',
      params: { a: 1, b: 1 },
    });
    abort();
    release();
    await expect(promise).rejects.toThrow('Task aborted');
    await pool.close();
  });
});
