import { Worker, WorkerOptions } from 'worker_threads';

type PoolOptions = {
  poolSize?: number;
  autoScale?: boolean;
  autoShrinkInterval?: number;
  minPoolSize?: number;
  maxPoolSize?: number;
};

type Task = {
  type: string;
  params?: any;
  priority?: number;
  transferList?: any[];
  onEvent?: (type: string, params: any) => void;
};

export class WorkerPool {
  constructor(workerPath: string, workerOptions?: WorkerOptions, poolOptions?: PoolOptions);
  get stats(): {
    poolSize: number;
    autoScale: boolean;
    autoShrinkInterval: number;
    minPoolSize: number;
    maxPoolSize: number;
    closed: boolean;
    workers: number;
    idleWorkers: number;
    acquiredWorkers: number;
    queuedTasks: number;
    runningTasks: number;
  };
  init(): Promise<void>;
  close(): Promise<void>;
  runTask(task: Task, acquiredWorker?: Worker): {
    promise: Promise<any>;
    abort: () => void;
  };
  acquireWorker(): Promise<{
    worker: Worker;
    release: () => void;
  }>;
}

type TaskHandler = (
  type: string,
  params: any,
  emitEvent: (type: string, params: any) => void,
  resolve: (data: any) => void,
  reject: (error: any) => void,
) => void;

export function initWorker(handleTask: TaskHandler): void;
