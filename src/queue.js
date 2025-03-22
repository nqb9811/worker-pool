// This implementation is more or less a refactoring of https://github.com/datastructures-js/queue,
// from the idea of offset and half-size resizing
class Queue {
  constructor() {
    this._elements = [];
    this._offset = 0;
  }

  get length() {
    return this._elements.length - this._offset;
  }

  enqueue(element) {
    this._elements.push(element);
  }

  dequeue() {
    const element = this._elements[this._offset];

    this._offset++;

    if (this._elements.length / this._offset <= 2) {
      this._elements = this._elements.slice(this._offset);
      this._offset = 0;
    }

    return element;
  }

  peek() {
    return this._elements[this._offset];
  }

  empty() {
    this._elements = [];
    this._offset = 0;
  }
}

module.exports = {
  Queue,
};
