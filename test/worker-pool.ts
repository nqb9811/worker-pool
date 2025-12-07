import { WorkerPool } from '../src/worker-pool';
import { initWorker } from '../src/init-worker';
import { parentPort } from 'node:worker_threads';
import assert from 'node:assert';
import { Task } from '../src/worker-task-descriptor';
import { AbortException } from '@gyra/utils';

function shouldInitWorker() {
    if (parentPort) {
        try {
            initWorker(async ({ type, data, emitEvent, throwIfAborted }) => {
                if (type === 'add') {
                    const { a, b } = data;
                    return { data: a + b };
                } else if (type === 'event') {
                    emitEvent('progress', 1);
                    emitEvent('progress', 2);
                    return { data: 3 };
                } else if (type === 'abort') {
                    while (true) {
                        throwIfAborted();
                    }
                } else if (type === 'crash') {
                    setTimeout(() => {
                        throw new Error('Crash');
                    });
                    await new Promise((resolve) => setTimeout(resolve, 10));
                    return { data: 'should not run to here' };
                } else if (type === 'ping') {
                    await new Promise((resolve) => setTimeout(resolve, 10));
                    return { data: 'pong' };
                } else {
                    throw new Error(`Unknown task type "${type}"`);
                }
            });
        } catch (error) {
            assert(false, 'Should not throw on initializing worker');
        }
    }
}

function shouldCreatePool() {
    if (!parentPort) {
        try {
            let pool = new WorkerPool({
                poolSize: 2,
                workerPath: __filename,
            });
            pool.close();
            pool = new WorkerPool({
                poolSize: 4,
                workerPath: __filename,
                usePriorityTaskQueue: true,
            });
            pool.close();
        } catch (error) {
            assert(false, 'Should not throw on creating and closing pool');
        }
    }
}

async function shouldCompleteTasksWithoutPriority() {
    if (!parentPort) {
        const pool = new WorkerPool({
            poolSize: 1,
            workerPath: __filename,
        });
        const tasks: Task[] = [
            { type: 'ping' },
            {
                type: 'add',
                data: { a: 2, b: 7 },
            },
            {
                type: 'add',
                data: { a: 10, b: 8 },
            },
            {
                type: 'add',
                data: { a: 18, b: 9 },
            },
        ];
        const results: number[] = await Promise.all(tasks.map((task) => {
            return pool.runTask(task);
        }));
        assert(
            results
                .filter((v) => typeof v !== 'string')
                .sort((a, b) => a - b)
                .join(',') === '9,18,27',
            'Should return correct task results (9,18,27)',
        );
        pool.close();
    }
}

async function shouldCompleteTasksWithPriority() {
    if (!parentPort) {
        const pool = new WorkerPool({
            poolSize: 1,
            workerPath: __filename,
            usePriorityTaskQueue: true,
        });
        const sentToWorkerTaskIndexes: number[] = [];
        const tasks: Task[] = [
            { type: 'ping' },
            {
                type: 'add',
                data: { a: 2, b: 7 },
                priority: 2,
                onEvent: (event) => {
                    if (event === 'sent to worker') {
                        sentToWorkerTaskIndexes.push(1);
                    }
                },
            },
            {
                type: 'add',
                data: { a: 10, b: 8 },
                priority: 3,
                onEvent: (event) => {
                    if (event === 'sent to worker') {
                        sentToWorkerTaskIndexes.push(2);
                    }
                },
            },
            {
                type: 'add',
                data: { a: 18, b: 9 },
                priority: 1,
                onEvent: (event) => {
                    if (event === 'sent to worker') {
                        sentToWorkerTaskIndexes.push(3);
                    }
                },
            },
        ];
        const results: number[] = await Promise.all(tasks.map((task) => {
            return pool.runTask(task);
        }));
        assert(
            sentToWorkerTaskIndexes.join(',') === '3,1,2',
            'Should start running tasks based on priority',
        );
        assert(
            results
                .filter((v) => typeof v !== 'string')
                .sort((a, b) => a - b)
                .join(',') === '9,18,27',
            'Should return correct task results (9,18,27)',
        );
        pool.close();
    }
}

async function shouldHandleTaskEvents() {
    if (!parentPort) {
        const pool = new WorkerPool({
            poolSize: 1,
            workerPath: __filename,
            usePriorityTaskQueue: true,
        });
        const taskData: number[] = [];
        const result = await pool.runTask({
            type: 'event',
            onEvent: (event, data) => {
                if (event === 'progress') {
                    taskData.push(data);
                }
            }
        });
        taskData.push(result);
        assert(
            taskData.join(',') === '1,2,3',
            'Should have correct task event and result data',
        );
        pool.close();
    }
}

async function shouldAcquireAndReleaseWorker() {
    if (!parentPort) {
        const pool = new WorkerPool({
            poolSize: 1,
            workerPath: __filename,
            usePriorityTaskQueue: true,
        });
        const task1Promise = pool.runTask({ type: 'ping' });
        const acquiringPromise = pool.acquireWorker();
        const task2Promise = pool.runTask({ type: 'ping' });
        acquiringPromise.then((worker) => setTimeout(() => {
            pool.releaseWorker(worker);
        }, 10));
        await Promise.all([task1Promise, acquiringPromise, task2Promise]);
        pool.close();
    }
}

async function shouldThrowOnUnknownTask() {
    if (!parentPort) {
        const pool = new WorkerPool({
            poolSize: 1,
            workerPath: __filename,
            usePriorityTaskQueue: true,
        });
        try {
            await pool.runTask({ type: 'unknown' });
            assert(false, 'Should throw unknown task error');
        } catch (error) {
            assert(/unknown/i.test(error?.message), 'Should throw unknown task error');
        }
        pool.close();
    }
}

async function shouldAbortTask() {
    if (!parentPort) {
        const pool = new WorkerPool({
            poolSize: 1,
            workerPath: __filename,
            usePriorityTaskQueue: true,
        });
        try {
            const abortController = new AbortController();
            const promise = pool.runTask({
                type: 'abort',
                abortSignal: abortController.signal,
            });
            await new Promise((resolve) => setTimeout(resolve, 10));
            abortController.abort();
            await promise;
            assert(false, 'Should throw abort exception');
        } catch (error) {
            assert(error instanceof AbortException, 'Should throw abort exception');
        }
        pool.close();
    }
}

async function shouldReplaceCrashedWorker() {
    if (!parentPort) {
        const pool = new WorkerPool({
            poolSize: 1,
            workerPath: __filename,
            usePriorityTaskQueue: true,
        });
        try {
            await pool.runTask({ type: 'crash' });
            assert(false, 'Should throw crash error');
        } catch (error) {
            assert(pool.stats().availableWorkers === 0, 'Should remove crashed worker');
            assert(/crash/i.test(error?.message), 'Should throw crash error');
        }
        const newTaskPromise = pool.runTask({
            type: 'add',
            data: { a: 7, b: 2 },
        });
        let attempts = 0;
        while (pool.stats().availableWorkers === 1) {
            await new Promise((resolve) => setTimeout(resolve, 10));
            attempts++;
            if (attempts === 10) {
                assert(false, 'Should replace crashed worker with a new one');
            }
        }
        const newTaskResult = await newTaskPromise;
        assert(newTaskResult === 9, 'Should normally handle tasks after a worker crash');
        pool.close();
    }
}

async function shouldTrackCurrentPoolStats() {
    if (!parentPort) {
        const pool = new WorkerPool({
            poolSize: 2,
            workerPath: __filename,
            usePriorityTaskQueue: true,
        });
        let stats = pool.stats();
        assert(stats.availableWorkers === 2, 'Available workers should be 2');
        assert(stats.idleWorkers === 2, 'Idle workers should be 2');
        assert(stats.runningTasks === 0, 'Running tasks should be 0');
        assert(stats.queuedTasks === 0, 'Queued tasks should 0');
        const task1Promise = pool.runTask({ type: 'ping' });
        stats = pool.stats();
        assert(stats.availableWorkers === 2, 'Available workers should be 2');
        assert(stats.idleWorkers === 1, 'Idle workers should be 1');
        assert(stats.runningTasks === 1, 'Running tasks should be 1');
        assert(stats.queuedTasks === 0, 'Queued tasks should 0');
        const task2Promise = pool.runTask({ type: 'ping' });
        stats = pool.stats();
        assert(stats.availableWorkers === 2, 'Available workers should be 2');
        assert(stats.idleWorkers === 0, 'Idle workers should be 0');
        assert(stats.runningTasks === 2, 'Running tasks should be 2');
        assert(stats.queuedTasks === 0, 'Queued tasks should 0');
        const task3Promise = pool.runTask({ type: 'ping' });
        stats = pool.stats();
        assert(stats.availableWorkers === 2, 'Available workers should be 2');
        assert(stats.idleWorkers === 0, 'Idle workers should be 0');
        assert(stats.runningTasks === 2, 'Running tasks should be 2');
        assert(stats.queuedTasks === 1, 'Queued tasks should 1');
        await Promise.all([task1Promise, task2Promise, task3Promise]);
        stats = pool.stats();
        assert(stats.availableWorkers === 2, 'Available workers should be 2');
        assert(stats.idleWorkers === 2, 'Idle workers should be 2');
        assert(stats.runningTasks === 0, 'Running tasks should be 0');
        assert(stats.queuedTasks === 0, 'Queued tasks should 0');
        pool.close();
    }
}

async function shouldNotProcessAlreadyAbortedTask() {
    if (!parentPort) {
        const pool = new WorkerPool({
            poolSize: 1,
            workerPath: __filename,
            usePriorityTaskQueue: true,
        });
        let abortController = new AbortController();
        let taskSentToWorker = false;
        abortController.abort();
        try {
            await pool.runTask({
                type: 'ping',
                abortSignal: abortController.signal,
                onEvent: (event) => {
                    if (event === 'sent to worker') {
                        taskSentToWorker = true;
                    }
                },
            });
            assert(false, 'Should throw abort exception');
        } catch (error) {
            assert(error instanceof AbortException, 'Should throw abort exception');
            assert(taskSentToWorker === false, 'Should not send already aborted task to worker');
        }
        const task1Promise = pool.runTask({ type: 'ping' });
        abortController = new AbortController();
        taskSentToWorker = false;
        const task2Promise = pool.runTask({
            type: 'ping',
            abortSignal: abortController.signal,
            onEvent: (event) => {
                if (event === 'sent to worker') {
                    taskSentToWorker = true;
                }
            },
        });
        abortController.abort();
        try {
            await task2Promise;
            assert(false, 'Should throw abort exception');
        } catch (error) {
            assert(error instanceof AbortException, 'Should throw abort exception');
            assert(taskSentToWorker === false, 'Should not send already aborted task to worker');
        }
        await task1Promise;
        pool.close();
    }
}

async function shouldWaitForAvailableResource() {
    if (!parentPort) {
        const pool = new WorkerPool({
            poolSize: 1,
            workerPath: __filename,
            usePriorityTaskQueue: true,
        });
        const runs: string[] = [];
        const task1Promise = pool.runTask({ type: 'ping' }).then(() => {
            runs.push('task 1');
        });
        const task2Promise = pool.runTask({ type: 'ping' }).then(() => {
            runs.push('task 2');
        });
        const promise1 = new Promise<void>((resolve) => {
            pool.waitForAvailableResource().then(async () => {
                runs.push('1st wait for resource');
                await Promise.all([
                    pool.runTask({ type: 'ping' }).then(() => {
                        runs.push('task 3');
                    }),
                    pool.runTask({ type: 'ping' }).then(() => {
                        runs.push('task 4');
                    }),
                ]);
                resolve();
            });
        });
        const promise2 = new Promise<void>((resolve) => {
            pool.waitForAvailableResource().then(async () => {
                runs.push('2nd wait for resource');
                await Promise.all([
                    pool.runTask({ type: 'ping' }).then(() => {
                        runs.push('task 5');
                    }),
                    pool.runTask({ type: 'ping' }).then(() => {
                        runs.push('task 6');
                    }),
                ]);
                resolve();
            });
        });
        await Promise.all([
            task1Promise,
            task2Promise,
            promise1,
            promise2,
        ]);
        assert(
            runs.join('; ') === 'task 1; task 2; 1st wait for resource; task 3; task 4; 2nd wait for resource; task 5; task 6',
            'Should run in correct order',
        );
        pool.close();
    }
}

async function shouldAutoScalePool() {
    if (!parentPort) {
        const pool = new WorkerPool({
            minPoolSize: 1,
            maxPoolSize: 3,
            workerPath: __filename,
            autoShrinkIntervalTime: 20,
        });
        const promises: Promise<void>[] = [];
        promises.push(
            pool.runTask({ type: 'ping' }),
            pool.runTask({ type: 'ping' }),
            pool.runTask({ type: 'ping' }),
        );
        while (true) {
            if (pool.stats().availableWorkers === 3) {
                break;
            }
            await new Promise<void>((resolve) => setTimeout(resolve, 20));
        }
        while (true) {
            if (pool.stats().availableWorkers === 2) {
                break;
            }
            await new Promise<void>((resolve) => setTimeout(resolve, 20));
        }
        promises.push(
            pool.runTask({ type: 'ping' }),
        );
        while (true) {
            if (pool.stats().availableWorkers === 1) {
                break;
            }
            await new Promise<void>((resolve) => setTimeout(resolve, 20));
        }
        await Promise.all(promises);
        pool.close();
    }
}

(async function main() {
    shouldInitWorker();
    shouldCreatePool();
    await shouldCompleteTasksWithoutPriority();
    await shouldCompleteTasksWithPriority();
    await shouldHandleTaskEvents();
    await shouldAcquireAndReleaseWorker();
    await shouldThrowOnUnknownTask();
    await shouldAbortTask();
    await shouldReplaceCrashedWorker();
    await shouldTrackCurrentPoolStats();
    await shouldNotProcessAlreadyAbortedTask();
    await shouldWaitForAvailableResource();
    await shouldAutoScalePool();
    if (!parentPort) {
        console.log('✅ All WorkerPool tests passed!');
    }
})();
