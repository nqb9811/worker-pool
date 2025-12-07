import { Transferable } from 'node:worker_threads';

/** Task sent to a worker to process. */
export type Task = {
    /** Type of task to process. */
    type: string;
    /** Task input data. */
    data?: any;
    /** Optional task priority (lower is more prioritized, default 0). */
    priority?: number;
    /** Optional signal to handle task aborting. */
    abortSignal?: AbortSignal;
    /**
     * Optional handler for event emitted by worker when processing task.
     * There is a preserved event "sent to worker" with no data,
     * emitted when the task is sent to worker.
     */
    onEvent?: (event: string, data?: any, transferList?: Transferable[]) => void;
    /** Data should be transfered to worker (not copy). */
    transferList?: Transferable[];
};

/** Result from processing task. */
export type TaskResult = {
    data: any,
    transferList?: Transferable[];
};

/** Function to handle tasks sent to worker, passed to `initWorker` function. */
export type WorkerTaskHandler = (params: {
    /** Type of task to process. */
    type: string;
    /** Task input data. */
    data: any;
    /**
     * Emit task-related event to main thread.
     * There is a preserved event "sent to worker" with no data,
     * emitted when the task is sent to worker.
     */
    emitEvent: (event: string, data?: any, transferList?: Transferable[]) => void;
    /**
     * Check if task is aborted by main thread and throw
     * (exception is then caught by main thread).
     */
    throwIfAborted: () => void;
}) => TaskResult | Promise<TaskResult>;

/** Internal type of message sent between main thread and worker. */
export enum WorkerMessageType {
    TASK = 'task',
    EVENT = 'event',
    RESULT = 'result',
};

/** Parameters to initialize worker pool. */
export type WorkerPoolParams = {
    workerPath: string;
    workerOptions?: WorkerOptions;
    usePriorityTaskQueue?: boolean;
    autoShrinkIntervalTime?: number;
} & (
        | { poolSize: number; }
        | { minPoolSize: number; maxPoolSize: number; }
    );
