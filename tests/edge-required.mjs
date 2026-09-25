import assert from 'node:assert/strict';
import { createUndoStack, layoutSignature, record, undo } from '../src/lib/undo.mjs';

const stack = createUndoStack();
const nodes = [];
const edge = { source: 'main', target: 'theme' };
record(stack, { nodes, edges: [edge] }, s => layoutSignature(s.nodes, s.edges));
record(stack, { nodes, edges: [{ ...edge, data: { required: true } }] }, s => layoutSignature(s.nodes, s.edges));
assert.equal(undo(stack).edges[0].data?.required, undefined);
console.log('필수 연결선 되돌리기 확인');
