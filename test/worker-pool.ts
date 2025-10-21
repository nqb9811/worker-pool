import { WorkerPool } from '../src/worker-pool';
import { initWorker } from '../src/init-worker';
import { parentPort } from 'node:worker_threads';
import assert from 'node:assert';
import { Task } from '../src/worker-task-descriptor';
import { AbortException } from '../src/abort-exception';

function shouldInitWorker() {
    if (parentPort) {
        try {
            initWorker(async ({ type, data, emitEvent, assertAborted }) => {
                if (type === 'add') {
                    const { a, b } = data;
                    return { data: a + b };
                } else if (type === 'event') {
                    emitEvent('progress', 1);
                    emitEvent('progress', 2);
                    return { data: 3 };
                } else if (type === 'abort') {
                    while (true) {
                        assertAborted();
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
                usePriorityQueue: false,
            });
            pool.close();
            pool = new WorkerPool({
                poolSize: 4,
                workerPath: __filename,
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
            usePriorityQueue: false,
        });
        const tasks: Task[] = [
            // First ping to make the worker busy
            {
                type: 'ping',
                data: null,
            },
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
        });
        const sentToWorkerTaskIndexes: number[] = [];
        const tasks: Task[] = [
            // First ping to make the worker busy
            {
                type: 'ping',
                data: null,
            },
            {
                type: 'add',
                data: { a: 2, b: 7 },
                priority: 2,
                onEvent: (event, data) => {
                    if (event === 'sent to worker') {
                        sentToWorkerTaskIndexes.push(1);
                    }
                },
            },
            {
                type: 'add',
                data: { a: 10, b: 8 },
                priority: 3,
                onEvent: (event, data) => {
                    if (event === 'sent to worker') {
                        sentToWorkerTaskIndexes.push(2);
                    }
                },
            },
            {
                type: 'add',
                data: { a: 18, b: 9 },
                priority: 1,
                onEvent: (event, data) => {
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
        });
        const taskData: number[] = [];
        const result = await pool.runTask({
            type: 'event',
            data: null,
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
        });
        // 1st task makes worker busy
        const task1Promise = pool.runTask({ type: 'ping', data: null });
        // Acquiring worker waits for completed task
        const acquiringPromise = pool.acquireWorker();
        // 2nd task waits for released worker
        const task2Promise = pool.runTask({ type: 'ping', data: null });
        acquiringPromise.then((worker) => setTimeout(() => {
            pool.releaseWorker(worker);
        }, 10));
        // All should resolve
        await Promise.all([task1Promise, acquiringPromise, task2Promise]);
        pool.close();
    }
}

async function shouldThrowOnUnknownTask() {
    if (!parentPort) {
        const pool = new WorkerPool({
            poolSize: 1,
            workerPath: __filename,
        });
        try {
            await pool.runTask({ type: 'unknown', data: null });
            pool.close();
            assert(false, 'Should throw unknown task error');
        } catch (error) {
            pool.close();
            assert(/unknown/i.test(error?.message), 'Should throw unknown task error');
        }
    }
}

async function shouldAbortTask() {
    if (!parentPort) {
        const pool = new WorkerPool({
            poolSize: 1,
            workerPath: __filename,
        });
        try {
            const abortController = new AbortController();
            const promise = pool.runTask({
                type: 'abort',
                data: null,
                abortSignal: abortController.signal,
            });
            await new Promise((resolve) => setTimeout(resolve, 10));
            abortController.abort();
            await promise;
            pool.close();
            assert(false, 'Should throw when aborting task');
        } catch (error) {
            pool.close();
            assert(error instanceof AbortException, 'Should throw abort exception when aborting task');
        }
    }
}

async function shouldReplaceCrashedWorker() {
    if (!parentPort) {
        const pool = new WorkerPool({
            poolSize: 1,
            workerPath: __filename,
        });
        try {
            await pool.runTask({ type: 'crash', data: null });
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
                pool.close();
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
        });
        let stats = pool.stats();
        assert(stats.availableWorkers === 2, 'Available workers should be 2');
        assert(stats.idleWorkers === 2, 'Idle workers should be 2');
        assert(stats.runningTasks === 0, 'Running tasks should be 0');
        assert(stats.queuedTasks === 0, 'Queued tasks should 0');
        const task1Promise = pool.runTask({ type: 'ping', data: null });
        stats = pool.stats();
        assert(stats.availableWorkers === 2, 'Available workers should be 2');
        assert(stats.idleWorkers === 1, 'Idle workers should be 1');
        assert(stats.runningTasks === 1, 'Running tasks should be 1');
        assert(stats.queuedTasks === 0, 'Queued tasks should 0');
        const task2Promise = pool.runTask({ type: 'ping', data: null });
        stats = pool.stats();
        assert(stats.availableWorkers === 2, 'Available workers should be 2');
        assert(stats.idleWorkers === 0, 'Idle workers should be 0');
        assert(stats.runningTasks === 2, 'Running tasks should be 2');
        assert(stats.queuedTasks === 0, 'Queued tasks should 0');
        const task3Promise = pool.runTask({ type: 'ping', data: null });
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
    if (!parentPort) {
        console.log('✅ All WorkerPool tests passed!');
    }
})();
