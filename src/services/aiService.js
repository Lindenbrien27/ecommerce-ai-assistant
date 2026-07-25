const anthropic = require('../config/ai');
const { definitions: tools, implementations } = require('../tools/trackingTools');

const MODEL = 'claude-haiku-4-5';

const SYSTEM_PROMPT = `You are a support assistant for an e-commerce store. You help the currently authenticated customer check the status and shipment tracking of their own orders.
Use the provided tools to look up real order data before answering - never guess or invent order details.
The tools are already scoped to this customer - you cannot look up anyone else's order, so don't ask for or accept another customer's email address.
If a lookup returns no results, tell the customer you couldn't find a matching order and ask them to double-check the order number or tracking number.
Keep responses concise and friendly.`;

async function runChat(messages, customerEmail) {
  const conversation = [...messages];
  const context = { customerEmail };

  for (let turn = 0; turn < 5; turn += 1) {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: conversation,
      tools,
    });

    conversation.push({ role: 'assistant', content: response.content });

    if (response.stop_reason !== 'tool_use') {
      const textBlock = response.content.find((block) => block.type === 'text');
      return textBlock ? textBlock.text : '';
    }

    const toolResults = [];
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;

      const impl = implementations[block.name];
      const result = impl ? await impl(block.input, context) : { error: 'Unknown tool' };

      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(result),
      });
    }

    conversation.push({ role: 'user', content: toolResults });
  }

  return "I'm having trouble completing that request right now. Please try again in a moment.";
}

module.exports = { runChat };
