const test = require('node:test');
const assert = require('node:assert/strict');
const anthropic = require('../src/config/ai');
const { implementations } = require('../src/tools/trackingTools');
const { runChat } = require('../src/services/aiService');

test('returns the assistant reply directly when no tool call is made', async (t) => {
  t.mock.method(anthropic.messages, 'create', async () => ({
    content: [{ type: 'text', text: 'Hello there!' }],
    stop_reason: 'end_turn',
  }));

  const reply = await runChat([{ role: 'user', content: 'hi' }]);
  assert.equal(reply, 'Hello there!');
});

test('executes a tool call and feeds the result back before replying', async (t) => {
  t.mock.method(implementations, 'get_order_by_number', async () => ({
    order_number: 'ORD-1001',
    status: 'shipped',
  }));

  let callCount = 0;
  t.mock.method(anthropic.messages, 'create', async () => {
    callCount += 1;

    if (callCount === 1) {
      return {
        content: [
          {
            type: 'tool_use',
            id: 'toolu_01',
            name: 'get_order_by_number',
            input: { orderNumber: 'ORD-1001' },
          },
        ],
        stop_reason: 'tool_use',
      };
    }

    return { content: [{ type: 'text', text: 'Your order has shipped.' }], stop_reason: 'end_turn' };
  });

  const reply = await runChat([{ role: 'user', content: "Where's ORD-1001?" }]);
  assert.equal(reply, 'Your order has shipped.');
  assert.equal(callCount, 2);
});

test('reports an unknown tool instead of throwing', async (t) => {
  let callCount = 0;
  t.mock.method(anthropic.messages, 'create', async () => {
    callCount += 1;

    if (callCount === 1) {
      return {
        content: [{ type: 'tool_use', id: 'toolu_01', name: 'not_a_real_tool', input: {} }],
        stop_reason: 'tool_use',
      };
    }

    return { content: [{ type: 'text', text: "Sorry, I couldn't do that." }], stop_reason: 'end_turn' };
  });

  const reply = await runChat([{ role: 'user', content: 'do the impossible' }]);
  assert.equal(reply, "Sorry, I couldn't do that.");
});
