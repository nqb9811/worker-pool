import { PriorityQueue } from '../src/priority-queue';
import assert from 'node:assert';

function shouldHaveEmptyState() {
    type Item = { priority: number; value: string; };
    const pq = new PriorityQueue<Item>((a, b) => a.priority - b.priority);
    assert(pq.len() === 0, 'New queue should be empty');
    assert(pq.pop() === undefined, 'Pop on empty queue should return undefined');
    assert(pq.peek() === undefined, 'Peek on empty queue should return undefined');
}

function shouldPushAndPopBasedOnPriority() {
    type Item = { priority: number; value: string; };
    const pq = new PriorityQueue<Item>((a, b) => a.priority - b.priority);
    pq.push({ priority: 5, value: 'a' });
    pq.push({ priority: 2, value: 'b' });
    pq.push({ priority: 8, value: 'c' });
    pq.push({ priority: 1, value: 'd' });
    let size = pq.len();
    assert(size === 4, 'Length should be 4 after pushes');
    const popped: string[] = [];
    let item: Item | undefined = undefined;
    while (item = pq.pop()) {
        popped.push(item.value);
        assert(pq.len() === size - 1, 'Length should be decreased after each pop');
        size--;
    }
    assert(popped.join(',') === 'd,b,a,c', 'Should pop in ascending priority order (1,2,5,8)');
    assert(pq.pop() === undefined, 'Pop on empty queue should return undefined');
}

function shouldPeekItems() {
    type Item = { priority: number; value: string; };
    const pq = new PriorityQueue<Item>((a, b) => a.priority - b.priority);
    pq.push({ priority: 5, value: 'a' });
    pq.push({ priority: 2, value: 'b' });
    assert(pq.len() === 2, 'Length should be 2 after pushes');
    assert(pq.peek()?.value === 'b', '1st peek should return b');
    assert(pq.peek()?.value === 'b', '1st peek should still return b');
    assert(pq.len() === 2, 'Length should not change on peeks');
}

function shouldClearItems() {
    type Item = { priority: number; value: string; };
    const pq = new PriorityQueue<Item>((a, b) => a.priority - b.priority);
    pq.push({ priority: 5, value: 'a' });
    pq.push({ priority: 2, value: 'b' });
    assert(pq.len() === 2, 'Length should be 2 after pushes');
    pq.clear();
    assert(pq.len() === 0, 'Length should be 0 after clear');
    assert(pq.peek() === undefined, 'Peek should return undefined after clear');
}

(function main() {
    shouldHaveEmptyState();
    shouldPushAndPopBasedOnPriority();
    shouldPeekItems();
    shouldClearItems();
    console.log('✅ All PriorityQueue tests passed!');
})();
