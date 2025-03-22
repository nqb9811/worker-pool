const { initWorker } = require('..');

initWorker((type, params, emitEvent, resolve, reject) => {
  switch (type) {
    case 'add': {
      const { a, b } = params;
      resolve(a + b);
      break;
    }

    case 'long-process': {
      emitEvent('progress', { processed: 3, total: 10 });
      emitEvent('progress', { processed: 7, total: 10 });
      emitEvent('progress', { processed: 10, total: 10 });
      resolve();
      break;
    }

    case 'failure': {
      reject(new Error('Test'));
      break;
    }
  }
});
