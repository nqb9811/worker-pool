import { parentPort } from 'node:worker_threads';
import { WorkerPool } from '../src/worker-pool';
import { initWorker } from '../src/init-worker';

(async function main() {
    if (parentPort) {
        initWorker(async ({ type, data }) => {
            if (type === 'add') {
                const { a, b } = data;
                return { data: a + b };
            } else {
                throw new Error(`Unknown task type "${type}"`);
            }
        });
    } else {
        const pool = new WorkerPool({
            poolSize: 4,
            workerPath: __filename,
        });
        const numTasks = 1e6;
        const promises: Promise<number>[] = [];
        const start = performance.now();
        for (let i = 0; i < numTasks; i++) {
            promises.push(pool.runTask({
                type: 'add',
                data: { a: Math.random(), b: Math.random() },
                priority: Math.random(),
            }));
        }
        await Promise.all(promises);
        const end = performance.now();
        const elapsed = end - start;
        console.log('Task per second:', numTasks * 1e3 / elapsed);
        pool.close();
    }
})();
