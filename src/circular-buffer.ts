/** Circular buffer data structure. */
export class CircularBuffer<T = any> {
    private capacity = 0;
    private items: T[] = [];
    private head = 0;
    private tail = 0;
    private length = 0;

    constructor(size: number) {
        this.items.length = this.capacity = size;
    }

    /** Get size of buffer. */
    public size() {
        return this.capacity;
    }

    /** Get number of items in buffer. */
    public len() {
        return this.length;
    }

    /** Check if buffer is full. */
    public isFull() {
        return this.length === this.capacity;
    }

    /** Check if buffer is empty (nothing was added). */
    public isEmpty() {
        return !this.length;
    }

    /** Add new item to buffer (throw if it is already full). */
    public push(item: T) {
        if (this.length === this.capacity) {
            throw new Error('Buffer is full');
        }
        const tail = this.tail;
        this.items[tail] = item;
        this.tail = (tail + 1) % this.capacity;
        this.length++;
    }

    /** Get item at the head of buffer and move pointer to the next item. */
    public pop() {
        if (!this.length) {
            return undefined;
        }
        const head = this.head;
        const item = this.items[head];
        this.head = (head + 1) % this.capacity;
        this.length--;
        return item;
    }

    /** Get item at the head of buffer but do not move pointer to the next item. */
    public peek() {
        if (!this.length) {
            return undefined;
        }
        return this.items[this.head];
    }

    /** Resize buffer to be larger (all current items are kept). */
    public resize(size: number) {
        const length = this.length;
        if (size < length) {
            throw new Error('New size is too small to fit current items');
        }
        const items = this.items;
        const head = this.head;
        const capacity = this.capacity;
        const newItems = new Array<T>(size);
        for (let i = 0; i < length; i++) {
            newItems[i] = items[(head + i) % capacity];
        }
        this.items = newItems;
        this.capacity = size;
        this.head = 0;
        this.tail = length;
    }

    /** Clear all items in buffer. */
    public clear() {
        this.items = [];
        this.items.length = this.capacity;
        this.head = 0;
        this.tail = 0;
        this.length = 0;
    }
}
