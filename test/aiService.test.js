const test = require('node:test');
const assert = require('node:assert/strict');
const openai = require('../src/config/ai');
const { implementations } = require('../src/tools/trackingTools');
const { runChat } = require('../src/services/aiService');

test('returns the assistant reply directly when no tool call is made', async (t) => {
  t.mock.method(openai.chat.completions, 'create', async () => ({
    choices: [{ message: { role: 'assistant', content: 'Hello there!' } }],
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
  t.mock.method(openai.chat.completions, 'create', async () => {
    callCount += 1;

    if (callCount === 1) {
      return {
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_1',
                  function: {
                    name: 'get_order_by_number',
                    arguments: '{"orderNumber":"ORD-1001"}',
                  },
                },
              ],
            },
          },
        ],
      };
    }

    return { choices: [{ message: { role: 'assistant', content: 'Your order has shipped.' } }] };
  });

  const reply = await runChat([{ role: 'user', content: "Where's ORD-1001?" }]);
  assert.equal(reply, 'Your order has shipped.');
  assert.equal(callCount, 2);
});

test('reports an unknown tool instead of throwing', async (t) => {
  let callCount = 0;
  t.mock.method(openai.chat.completions, 'create', async () => {
    callCount += 1;

    if (callCount === 1) {
      return {
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                { id: 'call_1', function: { name: 'not_a_real_tool', arguments: '{}' } },
              ],
            },
          },
        ],
      };
    }

    return { choices: [{ message: { role: 'assistant', content: "Sorry, I couldn't do that." } }] };
  });

  const reply = await runChat([{ role: 'user', content: 'do the impossible' }]);
  assert.equal(reply, "Sorry, I couldn't do that.");
});
