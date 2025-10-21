/** Priority queue data structure based on binary min heap (lower value means higher priority). */
export class PriorityQueue<T = any> {
    private items: T[] = [];
    private length = 0;

    constructor(private compare: (a: T, b: T) => number) { }

    /** Get number of items in queue. */
    public len() {
        return this.length;
    }

    /** Add new item to queue. */
    public push(item: T) {
        this.items.push(item);
        this.length++;
        this.siftUp(this.length - 1);
    }

    /** Get the most prioritized item and remove it from queue. */
    public pop() {
        if (!this.length) {
            return undefined;
        }
        const items = this.items;
        const top = items[0];
        const last = items.pop()!;
        this.length--;
        if (this.length) {
            this.siftDown(0, last);
        }
        return top;
    }

    /** Get the most prioritized item but do not remove it from queue. */
    public peek() {
        if (!this.length) {
            return undefined;
        }
        return this.items[0];
    }

    /** Clear all items in queue. */
    public clear() {
        this.items = [];
        this.length = 0;
    }

    /** Maintain heap property after adding new item. */
    private siftUp(index: number) {
        const items = this.items;
        const item = items[index];
        const compare = this.compare;
        while (index > 0) {
            const parent = (index - 1) >> 1;
            if (compare(item, items[parent]) >= 0) {
                break;
            }
            items[index] = items[parent];
            index = parent;
        }
        items[index] = item;
    }

    /** Maintain heap property after removing an item. */
    private siftDown(index: number, item: T) {
        const data = this.items;
        const length = this.length;
        const compare = this.compare;
        while (true) {
            const left = (index << 1) + 1;
            const right = left + 1;
            let smallest = index;
            if (left < length && compare(data[left], item) < 0) {
                smallest = left;
                if (right < length && compare(data[right], item) < 0) {
                    smallest = right;
                }
            } else if (right < length && compare(data[right], item) < 0) {
                smallest = right;
            }
            if (smallest === index) {
                break;
            }
            data[index] = data[smallest];
            index = smallest;
        }
        data[index] = item;
    }
}
