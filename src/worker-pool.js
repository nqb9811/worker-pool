const { Worker } = require('worker_threads');
const os = require('os');
const { Queue } = require('./queue');
const { PriorityQueue } = require('./priority-queue');
const { getRuntimeID } = require('./get-runtime-id');

class TaskAbortedError extends Error {
  constructor() {
    super();
    this.message = 'Task aborted';
  }
}

class PoolClosedError extends Error {
  constructor() {
    super();
    this.message = 'Pool closed';
  }
}

class WorkerPool {
  constructor(workerPath, workerOptions, poolOptions) {
    this._workerPath = workerPath;
    this._workerOptions = workerOptions;
    this._poolSize = poolOptions?.poolSize || 4;
    this._autoScale = poolOptions?.autoScale || false;
    this._autoShrinkInterval = poolOptions?.autoShrinkInterval || 1000 * 30;
    this._minPoolSize = poolOptions?.minPoolSize || 2;
    this._maxPoolSize = poolOptions?.maxPoolSize || os.cpus().length * 2;
    this._closed = false;
    this._workers = new Set();
    this._idleWorkers = new Queue();
    this._acquiredWorkers = new Set();
    this._acquiringWorkerResolvers = new Queue();
    this._autoScalingPromise = null;
    this._queuedTasks = new PriorityQueue();
    this._runningTasks = new Map();
    this._autoShrinkTimer = null;
  }

  get stats() {
    return {
      poolSize: this._poolSize,
      autoScale: this._autoScale,
      autoShrinkInterval: this._autoShrinkInterval,
      minPoolSize: this._minPoolSize,
      maxPoolSize: this._maxPoolSize,
      closed: this._closed,
      workers: this._workers.size,
      idleWorkers: this._idleWorkers.length,
      acquiredWorkers: this._acquiredWorkers.size,
      queuedTasks: this._queuedTasks.length,
      runningTasks: this._runningTasks.size,
    };
  }

  async init() {
    for (let i = 0; i < this._poolSize; i++) {
      await this._createWorker();
    }

    this._autoShrinkTimer = setTimeout(
      () => this._shrink(),
      this._autoShrinkInterval,
    );
  }

  async close() {
    this._closed = true;

    clearTimeout(this._autoShrinkTimer);

    for (const [taskId, task] of this._runningTasks) {
      task.reject(new PoolClosedError());
      this._runningTasks.delete(taskId);
    }

    while (this._queuedTasks.length) {
      const task = this._queuedTasks.dequeue();
      task.reject(new PoolClosedError());
    }

    for (const worker of this._workers) {
      try {
        await worker.terminate();
      } catch (error) {
        console.error('Failed to terminate worker', error);
      }

      this._workers.delete(worker);
    }
  }

  runTask(task, acquiredWorker) {
    if (this._closed) {
      throw new PoolClosedError();
    }

    task.aborted = false;

    const promise = new Promise(async (resolve, reject) => {
      task.resolve = resolve;
      task.reject = reject;

      let worker;

      if (acquiredWorker) {
        worker = acquiredWorker;
      } else if (this._idleWorkers.length) {
        worker = this._idleWorkers.dequeue();
      }

      if (!worker && this._autoScale) {
        await this._grow();

        if (task.aborted) {
          return task.reject(new TaskAbortedError());
        }

        if (this._idleWorkers.length) {
          worker = this._idleWorkers.dequeue();
        }
      }

      if (worker) {
        const taskId = getRuntimeID();
        this._submitTask(worker, taskId, task);
      } else {
        this._queuedTasks.enqueue(task, task.priority || 0);
      }
    });

    const abort = () => {
      task.aborted = true;
    };

    return { promise, abort };
  }

  async acquireWorker() {
    if (this._closed) {
      throw new PoolClosedError();
    }

    const getRelease = (worker) => {
      return () => {
        if (this._closed) {
          return;
        }

        this._acquiredWorkers.delete(worker);
        this._idleWorkers.enqueue(worker);
        this._runQueuedTask();
      };
    };

    if (this._idleWorkers.length) {
      const worker = this._idleWorkers.dequeue();
      this._acquiredWorkers.add(worker);
      return {
        worker,
        release: getRelease(worker),
      };
    }

    return new Promise((resolve) => {
      this._acquiringWorkerResolvers.enqueue((worker) => resolve({
        worker,
        release: getRelease(worker),
      }));
    });
  }

  async _createWorker() {
    const worker = new Worker(this._workerPath, this._workerOptions);

    await new Promise((resolve) => {
      worker.on('online', () => {
        worker.on('message', (msg) => {
          const { type, payload } = msg;

          switch (type) {
            case 'result': {
              const { taskId, error, data } = payload;
              const task = this._runningTasks.get(taskId);

              if (!task.aborted) {
                if (error) {
                  task.reject(error);
                } else {
                  task.resolve(data);
                }
              } else {
                task.reject(new TaskAbortedError());
              }

              this._runningTasks.delete(taskId);

              if (this._acquiringWorkerResolvers.length) {
                this._acquiredWorkers.add(worker);
                const resolve = this._acquiringWorkerResolvers.dequeue();
                resolve(worker);
              } else if (!this._acquiredWorkers.has(worker)) {
                this._idleWorkers.enqueue(worker);
                this._runQueuedTask();
              }

              break;
            }

            case 'event': {
              const { taskId, event, params } = payload;
              const task = this._runningTasks.get(taskId);

              if (!task.aborted && task.onEvent) {
                try {
                  task.onEvent(event, params);
                } catch (error) {
                  console.error('Failed to handle task event', error);
                }
              }

              break;
            }
          }
        });

        this._workers.add(worker);
        this._idleWorkers.enqueue(worker);
        resolve();
      });
    });
  }

  _submitTask(worker, taskId, task) {
    this._runningTasks.set(taskId, task);

    worker.postMessage(
      {
        type: 'task',
        payload: {
          taskId,
          type: task.type,
          params: task.params,
        },
      },
      task.transferList,
    );
  }

  _runQueuedTask() {
    if (
      !this._idleWorkers.length
      || !this._queuedTasks.length
    ) {
      return;
    }

    const worker = this._idleWorkers.dequeue();
    const task = this._queuedTasks.dequeue();
    const taskId = getRuntimeID();

    if (task.aborted) {
      this._idleWorkers.enqueue(worker);
      task.reject(new TaskAbortedError());
      return this._runQueuedTask();
    }

    this._submitTask(worker, taskId, task);
  }

  async _grow() {
    if (this._closed || !this._autoScale) {
      return;
    }

    if (this._autoScalingPromise) {
      await this._autoScalingPromise;
    }

    if (this._poolSize < this._maxPoolSize) {
      let resolve;

      const promise = new Promise((_resolve) => {
        resolve = _resolve;
      });

      this._autoScalingPromise = promise;
      await this._createWorker();
      this._poolSize++;
      this._autoScalingPromise = null;
      resolve();
    }
  }

  async _shrink() {
    if (this._closed || !this._autoScale) {
      return;
    }

    if (this._autoScalingPromise) {
      await this._autoScalingPromise;
    }

    if (this._idleWorkers.length > this._minPoolSize) {
      let resolve;

      const promise = new Promise((_resolve) => {
        resolve = _resolve;
      });

      this._autoScalingPromise = promise;

      const worker = this._idleWorkers.dequeue();

      try {
        await worker.terminate();
      } catch (error) {
        console.error('Failed to terminate worker', error);
      }

      this._workers.delete(worker);
      this._poolSize--;
      this._autoScalingPromise = null;
      resolve();
    }

    this._autoShrinkTimer = setTimeout(
      () => this._shrink(),
      this._autoShrinkInterval,
    );
  }
}

module.exports = {
  WorkerPool,
};
