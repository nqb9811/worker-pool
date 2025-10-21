# Minimal implementation of Node.js Worker Threads Pool

## Features

Run tasks with optional priority

Auto error handling for both sync and async tasks

Track pool stats

Auto replace crashed workers

Handle task events

Abort tasks (both async and sync)

Acquire workers for dedicated usage

## Notes

No dynamic pool size. So far I do not think it is useful. Spawning workers could be expensive.

## License

MIT
