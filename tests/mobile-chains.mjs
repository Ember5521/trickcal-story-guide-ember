import assert from 'node:assert/strict';
import { mobileChainPairs, toggleMobileChain } from '../src/lib/mobileChains.mjs';

const types = ['main', 'main', 'theme', 'theme_now', 'main', 'main'];
const nodes = types.map((type, index) => ({ id: String(index + 1), rowIndex: index, colIndex: 0, renderTop: index * 76, data: { type } }));
let edges = [{ id: 'pc', source: '1', target: '2', data: { required: true } }];
edges = toggleMobileChain(edges, nodes, nodes[1], nodes[4], 'mc');
assert.deepEqual(mobileChainPairs(nodes, edges).map(({ source, target }) => `${source.id}-${target.id}`),
    ['2-3', '3-4', '4-5']);
assert.equal(edges[0].id, 'pc');
edges = toggleMobileChain(edges, nodes, nodes[2], nodes[3], 'unused');
assert.deepEqual(mobileChainPairs(nodes, edges).map(({ source, target }) => `${source.id}-${target.id}`),
    ['2-3', '4-5']);
edges = toggleMobileChain(edges, nodes, nodes[1], nodes[4], 'again');
assert.deepEqual(mobileChainPairs(nodes, edges).map(({ source, target }) => `${source.id}-${target.id}`),
    ['2-3', '4-5', '3-4']);
edges = toggleMobileChain(edges, nodes, nodes[4], nodes[1], 'remove');
assert.deepEqual(mobileChainPairs(nodes, edges), []);
assert.throws(() => toggleMobileChain(edges, nodes, { id: 'etc', data: { type: 'etc' } }, nodes[0], 'bad'), /메인 스토리/);
console.log('모바일 체인 경로 확인');
