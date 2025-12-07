import { Worker, WorkerOptions } from 'node:worker_threads';
import { Task, WorkerMessageType, WorkerPoolParams } from './worker-task-descriptor';
import { AbortException, AsyncInterval, PromiseResolvers } from '@gyra/utils';
import { CircularBuffer, PriorityQueue, Queue } from '@gyra/struct';

/** Pool of worker threads to handle CPU-intensive tasks. Pool size can be fixed or dynamic. */
export class WorkerPool {
    private minPoolSize: number;
    private maxPoolSize: number;
    private workerPath: string;
    private workerOptions: WorkerOptions;
    private workers = new Set<Worker>();
    private idleWorkers: CircularBuffer<Worker>;
    private runningTaskByWorker = new Map<Worker, Task>();
    private acquiringWorkerResolvers = new Queue<PromiseResolvers<Worker>>();
    private acquiredWorkers = new Set<Worker>();
    private taskQueue: Queue<Task> | PriorityQueue<Task>;
    private runningTasks = new Set<Task>;
    private taskRegistry = new Map<Task, {
        resolvers: PromiseResolvers;
        meta: {
            aborted: boolean;
        },
        sharedBuffer: SharedArrayBuffer;
        abort: () => void;
    }>();
    private closed = false;
    private availableResourceResolvers = new Queue<PromiseResolvers<void>>();
    private autoShrinkInterval: AsyncInterval;
    private replacingCrashedWorkerResolvers = new Set<PromiseResolvers<void>>();

    constructor(params: WorkerPoolParams) {
        if ('poolSize' in params) {
            this.minPoolSize = this.maxPoolSize = params.poolSize;
        } else {
            this.minPoolSize = params.minPoolSize;
            this.maxPoolSize = params.maxPoolSize;
        }

        this.workerPath = params.workerPath;
        this.workerOptions = params.workerOptions ?? {};
        this.idleWorkers = new CircularBuffer(this.maxPoolSize);
        this.taskQueue = params.usePriorityTaskQueue
            ? new PriorityQueue((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
            : new Queue();

        for (let i = 0; i < this.minPoolSize; i++) {
            this.addNewWorker();
        }

        this.autoShrinkInterval = new AsyncInterval(async () => {
            await this.autoShrink();
        }, params.autoShrinkIntervalTime ?? 5 * 60 * 1000);

        this.autoShrinkInterval.start();
    }

    /**
     * Run a task with acquired worker or an idle worker,
     * to queue it to be run later when a worker becomes idle.
     */
    public async runTask(task: Task, acquiredWorker?: Worker): Promise<any> {
        if (this.closed) {
            throw new Error('Pool closed');
        }

        let taskInfo = this.taskRegistry.get(task);
        if (!taskInfo) {
            const resolvers = new PromiseResolvers();
            const meta = { aborted: false };
            const sharedBuffer = new SharedArrayBuffer(1);
            const abort = () => {
                meta.aborted = true;
                resolvers.reject(new AbortException());

                if (this.runningTasks.has(task)) {
                    const view = new Uint8Array(sharedBuffer);
                    view[0] = 1;
                    this.runningTasks.delete(task);
                }

                this.taskRegistry.delete(task);

                if (task.abortSignal) {
                    task.abortSignal.removeEventListener('abort', abort);
                }
            };

            taskInfo = { resolvers, meta, sharedBuffer, abort };
            this.taskRegistry.set(task, taskInfo);

            if (task.abortSignal) {
                task.abortSignal.addEventListener('abort', abort);
            }
        }

        if (task.abortSignal?.aborted) {
            taskInfo.resolvers.reject(new AbortException());
            this.taskRegistry.delete(task);
            return taskInfo.resolvers.promise;
        }

        let worker = acquiredWorker ?? this.idleWorkers.pop();
        if (worker) {
            this.runningTasks.add(task);
            this.runningTaskByWorker.set(worker, task);

            try {
                worker.postMessage({
                    type: WorkerMessageType.TASK,
                    payload: {
                        type: task.type,
                        data: task.data,
                        sharedBuffer: taskInfo.sharedBuffer,
                    },
                }, task.transferList);

                if (task.onEvent) {
                    task.onEvent('sent to worker');
                }
            } catch (error) {
                this.runningTasks.delete(task);
                this.runningTaskByWorker.delete(worker);
                this.taskRegistry.delete(task);
                taskInfo.resolvers.reject(error);
            }
        } else {
            this.taskQueue.push(task);
            await this.autoGrow();
        }

        return taskInfo.resolvers.promise;
    }

    /**
     * Acquire an idle worker from pool for dedicated usage.
     * Acquired worker is then passed back to the pool to run tasks.
     * The only difference is that when it completes the task,
     * it is not added back to idle list of the pool,
     * until caller releases it with `releaseWorker(worker)`.
     */
    public async acquireWorker(): Promise<Worker> {
        if (this.closed) {
            throw new Error('Pool closed');
        }

        const worker = this.idleWorkers.pop();
        if (worker) {
            this.acquiredWorkers.add(worker);
            return worker;
        }

        const resolvers = new PromiseResolvers<Worker>();
        this.acquiringWorkerResolvers.push(resolvers);
        await this.autoGrow();

        return resolvers.promise;
    }

    /**
     * Release an acquired worker back to pool.
     * Must call after acquiring worker and finish dedicated usage.
     * Otherwise, pool would lost one worker to run tasks.
     */
    public releaseWorker(worker: Worker) {
        if (this.closed) {
            worker.terminate();
            return;
        }

        if (!this.acquiredWorkers.has(worker)) {
            return;
        }

        this.acquiredWorkers.delete(worker);
        this.onIdleWorker(worker);
    }

    /** Get current pool stats of workers and tasks. */
    public stats() {
        return {
            availableWorkers: this.workers.size,
            idleWorkers: this.idleWorkers.len(),
            runningTasks: this.runningTasks.size,
            queuedTasks: this.taskQueue.len(),
            closed: this.closed,
        };
    }

    /** Close pool, reject all running and queued tasks, destroy all workers. */
    public close() {
        if (this.closed) {
            return;
        }

        for (const [task, taskInfo] of this.taskRegistry) {
            taskInfo.resolvers.reject(new Error('Pool closed'));
        }
        this.taskRegistry.clear();
        this.runningTasks.clear();
        this.taskQueue.clear();

        for (const worker of this.workers) {
            worker.terminate();
        }
        this.workers.clear();
        this.idleWorkers.clear();
        this.runningTaskByWorker.clear();
        this.acquiredWorkers.clear();

        let acquiringWorkerResolvers: PromiseResolvers<Worker> | undefined;
        while (acquiringWorkerResolvers = this.acquiringWorkerResolvers.pop()) {
            acquiringWorkerResolvers.reject(new Error('Pool closed'));
        }

        this.autoShrinkInterval.stop();
        this.closed = true;
    }

    /** Wait until task queue is drained and there is at least one idle worker. */
    public async waitForAvailableResource() {
        if (this.closed) {
            throw new Error('Pool closed');
        }

        if (this.idleWorkers.len()) {
            return;
        }

        const resolvers = new PromiseResolvers<void>();
        this.availableResourceResolvers.push(resolvers);
        await this.autoGrow();

        return resolvers.promise;
    }

    /** Add a new worker to pool. */
    private addNewWorker() {
        if (this.closed) {
            return;
        }

        const worker = new Worker(this.workerPath, {
            ...this.workerOptions,
            ...(this.workerPath.endsWith('.ts') ? { execArgv: ['-r', 'ts-node/register'] } : {})
        })
            .on('message', (msg) => {
                const task = this.runningTaskByWorker.get(worker);
                if (task) {
                    const taskInfo = this.taskRegistry.get(task);
                    if (taskInfo && !taskInfo.meta.aborted) {
                        const msgType = msg.type;
                        const msgPayload = msg.payload;

                        if (msgType === WorkerMessageType.RESULT) {
                            const error = msgPayload.error;
                            const data = msgPayload.data;

                            if (error) {
                                taskInfo.resolvers.reject(error);
                            } else {
                                taskInfo.resolvers.resolve(data);
                            }

                            this.runningTasks.delete(task);
                            this.taskRegistry.delete(task);

                            if (task.abortSignal) {
                                task.abortSignal.removeEventListener('abort', taskInfo.abort);
                            }
                        } else if (msgType === WorkerMessageType.EVENT) {
                            const event = msgPayload.event;
                            const data = msgPayload.data;

                            if (task.onEvent) {
                                task.onEvent(event, data);
                            }

                            return;
                        } else {
                            console.error(`Invalid worker message type "${msgType}"`);
                            process.exit(1);
                        }
                    }

                    this.runningTaskByWorker.delete(worker);
                }

                if (this.acquiredWorkers.has(worker)) {
                    return;
                }

                this.onIdleWorker(worker);
            })
            .on('error', (error) => {
                worker.terminate();
                this.workers.delete(worker);
                this.acquiredWorkers.delete(worker);

                const idleWorkers: Worker[] = [];
                let idleWorker: Worker | undefined;
                while (idleWorker = this.idleWorkers.pop()) {
                    if (idleWorker !== worker) {
                        idleWorkers.push(idleWorker);
                    }
                }
                for (const worker of idleWorkers) {
                    this.idleWorkers.push(worker);
                }

                const resolvers = new PromiseResolvers<void>();
                this.replacingCrashedWorkerResolvers.add(resolvers);
                setImmediate(() => {
                    this.addNewWorker();
                    resolvers.resolve();
                    this.replacingCrashedWorkerResolvers.delete(resolvers);
                });

                const task = this.runningTaskByWorker.get(worker);
                if (task) {
                    const taskInfo = this.taskRegistry.get(task);
                    if (taskInfo) {
                        taskInfo.resolvers.reject(error);
                        this.taskRegistry.delete(task);
                    }

                    this.runningTasks.delete(task);
                    this.runningTaskByWorker.delete(worker);
                }
            });

        this.workers.add(worker);
        this.onIdleWorker(worker);
    }

    /** Remove a worker from pool, only when it is idle. */
    private removeWorker() {
        if (this.closed) {
            return;
        }
        const worker = this.idleWorkers.pop();
        if (worker) {
            this.workers.delete(worker);
            worker.terminate();
        }
    }

    /** Decide what to do when a worker becomes idle. */
    private onIdleWorker(worker: Worker) {
        if (this.closed) {
            return;
        }

        const acquiringWorkerResolvers = this.acquiringWorkerResolvers.pop();
        if (acquiringWorkerResolvers) {
            acquiringWorkerResolvers.resolve(worker);
            this.acquiredWorkers.add(worker);
            return;
        }

        this.idleWorkers.push(worker);
        while (true) {
            const task = this.taskQueue.pop();
            if (!task) {
                break;
            }

            if (!this.taskRegistry.has(task)) {
                continue;
            }

            this.runTask(task);
            return;
        }

        if (this.idleWorkers.len()) {
            const availableResourceResolvers = this.availableResourceResolvers.pop();
            if (availableResourceResolvers) {
                availableResourceResolvers.resolve();
            }
        }
    }

    /** Check and add a new worker to pool if required. */
    private async autoGrow() {
        if (this.closed) {
            return;
        }

        for (const resolvers of this.replacingCrashedWorkerResolvers) {
            await resolvers.promise;
        }

        const queuedTasks = this.taskQueue.len();
        const totalWorkers = this.workers.size;
        const idleWorkers = this.idleWorkers.len();

        if (queuedTasks > 0 && totalWorkers < this.maxPoolSize && idleWorkers === 0) {
            this.addNewWorker();
        }
    }

    /** Check and remove an idle worker in low workload. */
    private async autoShrink() {
        if (this.closed) {
            return;
        }

        for (const resolvers of this.replacingCrashedWorkerResolvers) {
            await resolvers.promise;
        }

        const queuedTasks = this.taskQueue.len();
        const totalWorkers = this.workers.size;
        const idleWorkers = this.idleWorkers.len();

        if (queuedTasks === 0 && totalWorkers > this.minPoolSize && idleWorkers > 1) {
            this.removeWorker();
        }
    }
}
