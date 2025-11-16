import { parentPort, Transferable } from 'node:worker_threads';
import { WorkerMessageType, WorkerTaskHandler } from './worker-task-descriptor';
import { AbortException } from '@gyra/utils';

/** Init worker to run inside worker pool and handle tasks. */
export function initWorker(handler: WorkerTaskHandler) {
    if (!parentPort) {
        throw new Error('Do not init worker in main thread');
    }

    parentPort.on('message', async (msg) => {
        try {
            const msgType = msg.type;
            const msgPayload = msg.payload;

            if (msgType !== WorkerMessageType.TASK) {
                console.error(`Invalid worker message type "${msgType}"`);
                process.exit(1);
            }

            const type = msgPayload.type;
            const data = msgPayload.data;
            const sharedBuffer = msgPayload.sharedBuffer;
            const sharedBufferView = new Uint8Array(sharedBuffer);

            const emitEvent = (event: string, data?: any, transferList?: Transferable[]) => {
                parentPort!.postMessage({
                    type: WorkerMessageType.EVENT,
                    payload: { event, data },
                }, transferList);
            };

            const assertAborted = () => {
                if (sharedBufferView[0] === 1) {
                    throw new AbortException();
                }
            };

            const result = await handler({
                type,
                data,
                emitEvent,
                assertAborted,
            });

            parentPort!.postMessage({
                type: WorkerMessageType.RESULT,
                payload: { error: null, data: result.data },
            }, result.transferList);
        } catch (error) {
            parentPort!.postMessage({
                type: WorkerMessageType.RESULT,
                payload: { error, data: null },
            });
        }
    });
}
