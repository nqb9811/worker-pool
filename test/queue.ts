import { Queue } from '../src/queue';
import assert from 'node:assert';

function shouldHaveEmptyState() {
    const q = new Queue<string>();
    assert(q.len() === 0, 'New queue should be empty');
    assert(q.pop() === undefined, 'Pop on empty queue should return undefined');
    assert(q.peek() === undefined, 'Peek on empty queue should return undefined');
}

function shouldPushItems() {
    const q = new Queue<string>();
    q.push('a');
    q.push('b');
    q.push('c');
    assert(q.len() === 3, 'Length should be 3 after pushes');
}

function shouldPopItems() {
    const q = new Queue<string>();
    q.push('a');
    q.push('b');
    q.push('c');
    assert(q.len() === 3, 'Length should be 3 after pushes');
    assert(q.pop() === 'a', '1st pop should return a');
    assert(q.pop() === 'b', '2nd pop should return b');
    assert(q.len() === 1, 'Length should be 1 after two pops');
}

function shouldPeekItems() {
    const q = new Queue<string>();
    q.push('a');
    q.push('b');
    q.push('c');
    assert(q.len() === 3, 'Length should be 3 after pushes');
    assert(q.peek() === 'a', '1st peek should return a');
    assert(q.peek() === 'a', '1st peek should still return a');
    assert(q.len() === 3, 'Length should still be 3 after two peeks');
}

function shouldClearItems() {
    const q = new Queue<string>();
    q.push('a');
    q.push('b');
    q.push('c');
    assert(q.len() === 3, 'Length should be 3 after pushes');
    q.clear();
    assert(q.len() === 0, 'Length should still be 0 after clear');
    assert(q.peek() === undefined, 'Peek should return undefined after clear');
}

(function main() {
    shouldHaveEmptyState();
    shouldPushItems();
    shouldPopItems();
    shouldPeekItems();
    shouldClearItems();
    console.log('✅ All Queue tests passed!');
})();
