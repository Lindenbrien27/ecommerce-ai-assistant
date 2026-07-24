const openai = require('../config/ai');
const { definitions: tools, implementations } = require('../tools/trackingTools');

const SYSTEM_PROMPT = `You are a support assistant for an e-commerce store. You help customers check their order status and shipment tracking.
Use the provided tools to look up real order data before answering - never guess or invent order details.
If a lookup returns no results, tell the customer you couldn't find a matching order and ask them to double-check the order number, tracking number, or email address.
Keep responses concise and friendly.`;

async function runChat(messages) {
  const conversation = [{ role: 'system', content: SYSTEM_PROMPT }, ...messages];

  for (let turn = 0; turn < 5; turn += 1) {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: conversation,
      tools,
    });

    const choice = response.choices[0].message;
    conversation.push(choice);

    if (!choice.tool_calls?.length) {
      return choice.content;
    }

    for (const toolCall of choice.tool_calls) {
      const impl = implementations[toolCall.function.name];
      const args = JSON.parse(toolCall.function.arguments || '{}');
      const result = impl ? await impl(args) : { error: 'Unknown tool' };

      conversation.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      });
    }
  }

  return "I'm having trouble completing that request right now. Please try again in a moment.";
}

module.exports = { runChat };
