# Minimal implementation of Node.js Worker Threads Pool

## Features

Run tasks with optional priority

Auto error handling for both sync and async tasks

Auto replace crashed workers

Handle task events

Abort both sync and async tasks

Acquire workers for dedicated usage

Track pool stats

Wait for pool resource availability

## Notes

No dynamic pool size. So far it seems unuseful. Spawning workers could be expensive.

## Examples

See [test/worker-pool.ts](./test/worker-pool.ts)

## Benchmark

See [benchmark/fifo.ts](./benchmark/fifo.ts) and [benchmark/priority.ts](./benchmark/priority.ts)

## License

MIT
