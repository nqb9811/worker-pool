import { AbortException } from '@gyra/utils';
import { randomUUID } from 'node:crypto';

function benchmark(fn: () => void) {
    const times: number[] = [];

    fn(); // warn up

    for (let i = 0; i < 8; i++) {
        const start = performance.now();
        fn();
        const end = performance.now();
        times.push(end - start);
    }

    const avg = times.reduce((a, b) => a + b, 0) / times.length;

    return avg;
}


(function main() {
    const raw = benchmark(() => {
        for (let i = 0; i < 1e7; i++) {
            randomUUID();
        }
    });

    const sharedBuffer = new SharedArrayBuffer(1);
    const sharedBufferView = new Uint8Array(sharedBuffer);
    const assertAborted = () => {
        if (sharedBufferView[0] === 1) {
            throw new AbortException();
        }
    };
    const assertAbortedOverhead = benchmark(() => {
        for (let i = 0; i < 1e7; i++) {
            randomUUID();
            assertAborted();
        }
    });

    console.log('🚀 Assert aborted overhead (%):', (assertAbortedOverhead - raw) * 100 / raw);
})();
