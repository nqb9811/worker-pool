/** Queue data structure. */
export class Queue<T = any> {
    private items: T[] = [];
    private length = 0;
    private head = 0;

    /** Get number of items in queue. */
    public len() {
        return this.length;
    }

    /** Add new item to queue. */
    public push(item: T) {
        this.items.push(item);
        this.length = this.items.length - this.head;
    }

    /** Get next item and remove it from queue. */
    public pop() {
        if (!this.length) {
            return undefined;
        }
        const items = this.items;
        const length = items.length;
        const head = this.head;
        const item = items[head];
        if (head >= (length >> 1)) {
            this.items = items.slice(head + 1);
            this.head = 0;
        } else {
            this.head = head + 1;
        }
        this.length = this.items.length - this.head;
        return item;
    }

    /** Get next item from queue but do not remove it. */
    public peek() {
        if (!this.length) {
            return undefined;
        }
        return this.items[this.head];
    }

    /** Clear all items in queue. */
    public clear() {
        this.items = [];
        this.head = 0;
        this.length = 0;
    }
}
