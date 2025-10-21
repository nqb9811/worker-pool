import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const scripts = [
    'queue.ts',
    'circular-buffer.ts',
    'priority-queue.ts',
    'worker-pool.ts',
].map((name) => {
    return resolve(__dirname, name);
});

for (const script of scripts) {
    spawn('ts-node', [script], { stdio: 'inherit' })
        .on('exit', (code) => {
            if (code !== 0) {
                console.log(`❌ Script ${script} exited with code ${code}`);
            }
        });
}
