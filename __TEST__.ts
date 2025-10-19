import { Queue } from './src/queue';
import { CircularBuffer } from './src/circular-buffer';
import { PriorityQueue } from './src/priority-queue';
import { WorkerPool } from './src/worker-pool';
import { initWorker } from './src/init-worker';
import { parentPort } from 'node:worker_threads';

function assert(condition: any, msg: string) {
    if (!condition) {
        throw new Error(`Assertion failed: ${msg}`);
    }
}

///////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////

(function testQueue() {
    const q = new Queue<number>();

    // Initially empty
    assert(q.size() === 0, 'new queue should be empty');
    assert(q.pop() === undefined, 'pop on empty should return undefined');
    assert(q.peek() === undefined, 'peek on empty should return undefined');

    // Push some items
    q.push(1);
    q.push(2);
    q.push(3);
    assert(q.size() === 3, 'size should be 3 after pushes');
    assert(q.peek() === 1, 'peek should return first item (1)');

    // Pop in order
    assert(q.pop() === 1, 'first pop should return 1');
    assert(q.pop() === 2, 'second pop should return 2');
    assert(q.size() === 1, 'size should be 1 after two pops');
    assert(q.peek() === 3, 'peek should now return 3');

    // Push more after pops
    q.push(4);
    q.push(5);
    assert(q.size() === 3, 'size should be 3 after repush');
    assert(q.pop() === 3, 'should continue FIFO order');

    // Empty completely
    assert(q.pop() === 4, 'should return 4');
    assert(q.pop() === 5, 'should return 5');
    assert(q.pop() === undefined, 'extra pop should return undefined');
    assert(q.size() === 0, 'should be empty again');

    // Reuse after empty
    q.push(10);
    q.push(20);
    assert(q.peek() === 10, 'peek after reuse should work');
    assert(q.pop() === 10, 'should return first item after reuse');
    assert(q.pop() === 20, 'should return second item after reuse');

    console.log('✅ All Queue tests passed!');
})();

///////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////

(function testCircularBuffer() {
    const buf = new CircularBuffer<number>(3);
    assert(buf.isEmpty(), 'should start empty');
    assert(!buf.isFull(), 'should not be full initially');
    assert(buf.size() === 3, 'size should be 3');

    buf.push(1);
    buf.push(2);
    buf.push(3);
    assert(buf.isFull(), 'should be full after 3 pushes');
    assert(buf.peek() === 1, 'peek should return first item (1)');

    try {
        buf.push(4);
        throw new Error('should have thrown when pushing into full buffer');
    } catch (e) {
        assert((e as Error).message === 'Buffer is full', 'should throw correct error');
    }

    assert(buf.pop() === 1, 'pop should return 1');
    assert(buf.pop() === 2, 'pop should return 2');
    assert(!buf.isFull(), 'should not be full after popping');

    buf.push(4);
    buf.push(5);
    assert(buf.pop() === 3, 'pop should return 3 (wrapped)');
    assert(buf.pop() === 4, 'pop should return 4');
    assert(buf.pop() === 5, 'pop should return 5');
    assert(buf.isEmpty(), 'should be empty after popping all');

    // Test resize
    buf.push(10);
    buf.push(11);
    buf.push(12);
    buf.pop(); // move head forward
    buf.push(13);
    buf.resize(5);
    buf.push(999);
    buf.push(0.001);

    assert(buf.size() === 5, 'size should be 5 after resize');
    assert(buf.isFull() === true, 'should be full after pushing 5 items');
    assert(buf.pop() === 11, 'first item should be 11 after resize');
    assert(buf.pop() === 12, 'second item should be 12 after resize');
    assert(buf.pop() === 13, 'third item should be 13 after resize');
    assert(buf.pop() === 999, 'fourth item should be 999 after resize');
    assert(buf.pop() === 0.001, 'fifth item should be 999 after resize');
    assert(buf.isEmpty(), 'should be empty after popping all resized items');

    console.log('✅ All CircularBuffer tests passed!');
})();

///////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////

(function testPriorityQueue() {
    type Item = { priority: number; value: string; };
    const pq = new PriorityQueue<Item>((a, b) => a.priority - b.priority);

    // push items with different priorities
    pq.push({ priority: 5, value: 'A' });
    pq.push({ priority: 2, value: 'B' });
    pq.push({ priority: 8, value: 'C' });
    pq.push({ priority: 1, value: 'D' });

    assert(pq.peek()!.value === 'D', 'peek should return item with lowest priority (D)');
    assert(pq.size() === 4, 'size should be 4 after pushes');

    // pop in order
    const popped: string[] = [];
    while (pq.size()) {
        popped.push(pq.pop()!.value);
    }
    assert(popped.join(',') === 'D,B,A,C', 'should pop in ascending priority order (1,2,5,8)');
    assert(pq.pop() === undefined, 'pop on empty should return undefined');
    assert(pq.size() === 0, 'should be empty after all pops');

    // single element
    pq.push({ priority: 10, value: 'X' });
    assert(pq.pop()!.value === 'X', 'single element pop should return it');
    assert(pq.size() === 0, 'should be empty after single pop');

    // duplicate priorities (stability not required but order must be valid)
    pq.push({ priority: 2, value: 'J' });
    pq.push({ priority: 2, value: 'K' });
    pq.push({ priority: 1, value: 'L' });
    const dupOut: string[] = [];
    while (pq.size()) {
        dupOut.push(pq.pop()!.value);
    }
    assert(dupOut[0] === 'L', 'lowest priority should be popped first');
    assert(new Set(dupOut).size === 3, 'should have all unique values');

    console.log('✅ All PriorityQueue tests passed!');
})();

///////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////

(function testWorkerPool() {
    if (parentPort) {
        initWorker(({ type, data, emitEvent, assertAborted }) => {
            if (type === 'add') {
                const { a, b } = data;
                return { data: a + b };
            } else if (type === 'abortSync') {
                while (true) {
                    assertAborted();
                }
            } else {
                throw new Error(`Unknown task type "${type}"`);
            }
        });
    } else {
        const pool = new WorkerPool({
            poolSize: 4,
            workerPath: __filename,
        });

        pool.runTask({
            type: 'add',
            data: { a: 2, b: 7 }
        })
            .then((result) => {
                console.log('Worker pool - task "add" result', result);
            })
            .catch((error) => {
                console.log('Worker pool - task "add" error', error);
            });

        const abortController = new AbortController();
        pool.runTask({
            type: 'abortSync',
            data: null,
            abortSignal: abortController.signal,
        })
            .then((result) => {
                console.log('Worker pool - task "abortSync" result', result);
            })
            .catch((error) => {
                console.log('Worker pool - task "abortSync" error', error);
            });
        setTimeout(() => {
            abortController.abort();
        }, 1000);
    }
})();
