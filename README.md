# Minimal implementation of Node.js Worker Threads Pool

## Features

Run tasks with optional priority

Auto error handling for both sync and async tasks

Auto replace crashed workers

Handle task events

Abort tasks (both async and sync)

Acquire workers for dedicated usage

Track pool stats

## Notes

No dynamic pool size. So far I do not think it is useful. Spawning workers could be expensive.

## Examples

See [test/worker-pool.ts](./test/worker-pool.ts)

## Benchmark

See [bench/fifo.ts](./bench/fifo.ts) and [bench/priority.ts](./bench/priority.ts)

## License

MIT
