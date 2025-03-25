# Worker Pool

Node.js worker pool to utilize threads for CPU-intensive tasks

## Features

Structural and simple pool and worker setup

Fixed pool size or autoscale with min and max pool size

Execute tasks by priority

Cancel tasks (if a task is already sent to a worker, its logic still run, although the task is aborted and rejected)

Handle task events from worker during processing (usually helpful for tracking progress)

Acquire worker, run tasks with the acquired worker and release it back to the pool (when you want to run tasks with the same worker)

Get pool stats (for evaluation when you need to run multiple tasks at the same time without draining all available worker resources)

## Installation

```sh
npm i @nqb/worker-pool
```

## Usage

### Sample project structure

```
my-project/
│── src/
│   ├── worker.js
│   ├── worker-pool.js
│   ├── ...
│   ...
```

### Initialize worker to handle tasks

```js
// In worker.js
const { initWorker } = require('@nqb/worker-pool');

initWorker((type, params, emitEvent, resolve, reject) => {
  switch (type) {
    case 'process-something-intensive': { // define your task type
      const { input1, input2 } = params; // get task inputs
      // Your task logic...
      emitEvent('progress', { processed: 3, total: 10 }); // optional: emit event to track progress
      // Your task logic...
      // Resolve the task data
      resolve({ aggregation: 1.1 });
      // Or, reject error
      reject(new Error('test'));
      break;
    }
  }
  // Make sure for each task, resolve or reject is called, or any error is thrown
  // Otherwise, the worker will hang as the task is still not completed
});
```

### Initialize and use pool to run tasks

#### Initialize a pool

```js
// In worker-pool.js
const { WorkerPool } = require('@nqb/worker-pool');

// Just pass the path to worker and use the default config: no worker options, fixed pool size (4)
const pool = new WorkerPool('./worker');
// Pass some options for worker (e.g. workerData)
const pool = new WorkerPool('./worker', { workerData: null });
// Enable dynamic pool size, new worker will be created when all current ones are busy
// (worker options is null only for the below sample code)
const pool = new WorkerPool('./worker', null, {
  poolSize: 3, // optional: the initial pool size, 4 if not defined
  autoScale: true, // optional: enable dynamic pool size, default is false
  autoShrinkInterval: 30 * 1000, // optional: interval time to remove idle worker(s) until pool size is minimum, default is 30 seconds
  minPoolSize: 1, // optional: minimum number of workers in the pool, default is 2, pool will not shrink if the number of workers are already minimum
  maxPoolSize: 4, // optional: maximum number of workers in the pool, default is CPU cores * 2, pool will not grow if the number of workers are already maximum
});
// Make sure .init() is called
await pool.init();
```

#### Run tasks with the pool

```js
const { promise, abort } = pool.runTask({
  type: 'process-something-intensive', // type of task defined in worker.js
  priority: 0, // optional: task priority, lower value is prioritized, default is 0
  params: { // optional: required inputs for the task
    input1: 1,
    input2: 2,
  },
  transferList: [buffer], // optional: transferred data for faster posting message to worker, only transferrable objects (https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects)
  onEvent: (type, params) => { // optional: handle events from worker during running the task
    if (type === 'progress') {
      const { processed, total } = params;
      Socket.emit('calculation progress', processed, total);
    }
  },
});
const data = await promise; // get resolved task data
abort(); // or abort the task, task will be rejected with "Task aborted" error
```

#### Acquire worker from the pool for dedicated usage and release it back

```js
const { worker, release } = await pool.acquireWorker();
for (let i = 0; i < 3; i++) {
  const { promise, abort } = pool.runTask({
    type: 'do-something',
    params: { i },
  }, worker); // pass the acquired worker to run all the tasks with it
  await promise;
}
release(); // release it back to the pool after done
```

#### Get current pool stats

```js
const {
  poolSize,
  autoScale,
  autoShrinkInterval,
  minPoolSize,
  maxPoolSize,
  closed,
  workers,
  idleWorkers,
  acquiredWorkers,
  queuedTasks,
  runningTasks
} = pool.stats;
```

#### Close the pool

```js
await pool.close(); // all running and queued tasks will be rejected with "Pool closed" error
```

## License

[MIT](https://opensource.org/license/mit)
