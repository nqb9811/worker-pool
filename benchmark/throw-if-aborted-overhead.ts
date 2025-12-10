import { AbortException, Benchmark } from '@gyra/utils';
import { randomUUID } from 'node:crypto';

(async function main() {
    const { avg: raw } = await new Benchmark(() => {
        for (let i = 0; i < 1e6; i++) {
            randomUUID();
        }
    }).run();

    const sharedBuffer = new SharedArrayBuffer(1);
    const sharedBufferView = new Uint8Array(sharedBuffer);
    const throwIfAborted = () => {
        if (sharedBufferView[0] === 1) {
            throw new AbortException();
        }
    };

    const { avg: throwIfAbortedOverhead } = await new Benchmark(() => {
        for (let i = 0; i < 1e6; i++) {
            randomUUID();
            throwIfAborted();
        }
    }).run();

    const percent = (throwIfAbortedOverhead! - raw!) * 100 / raw!;
    if (percent >= 2) {
        throw new Error(`throwIfAborted() has noticable overhead (%): ${percent}`);
    }

    console.log('🚀 throwIfAborted() overhead (%):', percent);
})();
