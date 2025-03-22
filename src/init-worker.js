const { parentPort } = require('worker_threads');

function initWorker(handleTask) {
  parentPort.on('message', (msg) => {
    const { type, payload } = msg;

    switch (type) {
      case 'task': {
        const { taskId, type, params } = payload;

        const emitEvent = (event, params, transferList) => {
          parentPort.postMessage(
            {
              type: 'event',
              payload: {
                taskId,
                event,
                params,
              },
            },
            transferList,
          );
        };

        let responded = false;

        const resolve = (data, transferList) => {
          parentPort.postMessage(
            {
              type: 'result',
              payload: {
                taskId,
                error: null,
                data,
              },
            },
            transferList,
          );

          responded = true;
        };

        const reject = (error, transferList) => {
          parentPort.postMessage(
            {
              type: 'result',
              payload: {
                taskId,
                error,
                data: null,
              },
            },
            transferList,
          );

          responded = true;
        };

        try {
          const maybePromise = handleTask(type, params, emitEvent, resolve, reject);

          if (maybePromise instanceof Promise) {
            maybePromise.catch((error) => {
              if (!responded) {
                reject(error);
              }
            });
          }
        } catch (error) {
          if (!responded) {
            reject(error);
          }
        }

        break;
      }
    }
  });
}

module.exports = {
  initWorker,
};
