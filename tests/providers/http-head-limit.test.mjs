import assert from 'node:assert/strict';
import { fetchTextHead } from '../../providers/_http.mjs';
import { pass, fail } from '../helpers.mjs';

const originalFetch = globalThis.fetch;
try {
  for (const [name, chunks, maxBytes] of [
    ['single oversized chunk', [Buffer.alloc(65536, 97)], 8192],
    ['multiple chunks straddle limit', [Buffer.from('abc'), Buffer.from('defgh')], 5],
    ['short body', [Buffer.from('abc')], 8],
    ['exact limit', [Buffer.from('abcd')], 4],
    ['empty body', [], 8],
    ['zero limit', [Buffer.from('abc')], 0],
    ['split UTF-8 at byte boundary', [Buffer.from('a\u00e9z')], 2],
  ]) {
    try {
      globalThis.fetch = async () => new Response(new ReadableStream({
        start(controller) { for (const chunk of chunks) controller.enqueue(chunk); controller.close(); },
      }));
      const actual = await fetchTextHead('https://example.invalid', { maxBytes });
      assert.equal(actual, Buffer.concat(chunks).subarray(0, maxBytes).toString('utf8'));
      pass(name);
    } catch (error) { fail(name + ': ' + error.message); }
  }
  try {
    let canceled = false;
    globalThis.fetch = async () => new Response(new ReadableStream({
      start(controller) { controller.enqueue(Buffer.alloc(100, 120)); },
      cancel() { canceled = true; },
    }));
    assert.equal(await fetchTextHead('https://example.invalid', { maxBytes: 5 }), 'xxxxx');
    assert.equal(canceled, true, 'stop consuming at the allowance, without waiting for EOF');
    pass('cancels a still-open body at the limit');
  } catch (error) { fail(error.message); }
  try {
    globalThis.fetch = async () => ({ ok: true, text: async () => 'a\u00e9z' });
    assert.equal(await fetchTextHead('https://example.invalid', { maxBytes: 2 }), Buffer.from('a\u00e9z').subarray(0, 2).toString('utf8'));
    pass('non-stream fallback is also byte-bounded');
  } catch (error) { fail(error.message); }
  for (const maxBytes of [-1, 1.5, Infinity, NaN, '5']) {
    try {
      globalThis.fetch = async () => { throw new Error('must validate before fetch'); };
      await assert.rejects(fetchTextHead('https://example.invalid', { maxBytes }), RangeError);
      pass('rejects invalid maxBytes=' + maxBytes);
    } catch (error) { fail('invalid limit: ' + error.message); }
  }
} finally { globalThis.fetch = originalFetch; }
