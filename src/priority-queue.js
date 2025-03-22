class PriorityQueue {
  constructor() {
    this._heap = [];
  }

  get length() {
    return this._heap.length;
  }

  enqueue(element, priority) {
    this._heap.push({ element, priority });
    this._heapifyUp();
  }

  dequeue() {
    if (!this._heap.length) {
      return undefined;
    }

    if (this._heap.length === 1) {
      const { element } = this._heap.pop();
      return element;
    }

    const { element } = this._heap[0];
    this._heap[0] = this._heap.pop();
    this._heapifyDown();
    return element;
  }

  peek() {
    return this._heap[0];
  }

  empty() {
    this._heap = [];
  }

  _getParentIndex(i) {
    return Math.floor((i - 1) / 2);
  }

  _getLeftChildIndex(i) {
    return (i * 2) + 1;
  }

  _getRightChildIndex(i) {
    return (i * 2) + 2;
  }

  _swap(i, j) {
    const temp = this._heap[i];
    this._heap[i] = this._heap[j];
    this._heap[j] = temp;
  }

  _heapifyUp() {
    let index = this._heap.length - 1;

    while (index > 0) {
      let parentIndex = this._getParentIndex(index);

      if (this._heap[parentIndex].priority <= this._heap[index].priority) {
        break;
      }

      this._swap(index, parentIndex);
      index = parentIndex;
    }
  }

  _heapifyDown() {
    let index = 0;

    while (this._getLeftChildIndex(index) < this._heap.length) {
      let smallerChildIndex = this._getLeftChildIndex(index);
      let rightChildIndex = this._getRightChildIndex(index);

      if (
        rightChildIndex < this._heap.length
        && this._heap[rightChildIndex].priority < this._heap[smallerChildIndex].priority
      ) {
        smallerChildIndex = rightChildIndex;
      }

      if (this._heap[index].priority <= this._heap[smallerChildIndex].priority) {
        break;
      }

      this._swap(index, smallerChildIndex);
      index = smallerChildIndex;
    }
  }
}

module.exports = {
  PriorityQueue,
};
