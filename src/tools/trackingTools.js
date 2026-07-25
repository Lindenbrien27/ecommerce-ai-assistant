const orderService = require('../services/orderService');

// Fixed, not the paginated default - the model has no cursor to hand back
// on a follow-up call, so this has to be a single self-contained page. Caps
// what a "list my orders" question can pull into the conversation, so a
// customer with a very long order history doesn't blow up the prompt.
const MAX_ORDERS_FOR_CHAT = 20;

const definitions = [
  {
    name: 'get_order_by_number',
    description: "Look up a single order by its order number (e.g. 'ORD-1001'). Only returns the order if it belongs to the current customer.",
    input_schema: {
      type: 'object',
      properties: {
        orderNumber: { type: 'string', description: 'The order number to look up.' },
      },
      required: ['orderNumber'],
    },
  },
  {
    name: 'get_my_orders',
    description: `List the current customer's most recent orders (up to ${MAX_ORDERS_FOR_CHAT}, newest first). Takes no parameters - the customer is already known from their authenticated session. If the customer needs their full order history, point them to the orders page instead.`,
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_order_by_tracking_number',
    description: 'Look up a single order by its shipment tracking number. Only returns the order if it belongs to the current customer.',
    input_schema: {
      type: 'object',
      properties: {
        trackingNumber: { type: 'string', description: 'The carrier tracking number.' },
      },
      required: ['trackingNumber'],
    },
  },
];

function ownedBy(order, customerEmail) {
  if (!order) return null;
  return order.customer_email.toLowerCase() === customerEmail.toLowerCase() ? order : null;
}

// Every implementation is scoped to the authenticated customer via
// context.customerEmail - never a value the model supplies. This is what
// stops the assistant from being usable as an oracle to look up someone
// else's order, regardless of what a crafted prompt asks it to do.
const implementations = {
  get_order_by_number: async ({ orderNumber }, { customerEmail }) => {
    const order = await orderService.getOrderByNumber(orderNumber);
    return ownedBy(order, customerEmail);
  },
  get_my_orders: async (_input, { customerEmail }) => {
    const { orders } = await orderService.getOrdersByEmail(customerEmail, {
      limit: MAX_ORDERS_FOR_CHAT,
    });
    return orders;
  },
  get_order_by_tracking_number: async ({ trackingNumber }, { customerEmail }) => {
    const order = await orderService.getOrderByTrackingNumber(trackingNumber);
    return ownedBy(order, customerEmail);
  },
};

module.exports = { definitions, implementations };
