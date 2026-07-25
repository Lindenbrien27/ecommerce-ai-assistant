const orderService = require('../services/orderService');

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
    description: 'List every order placed by the current customer. Takes no parameters - the customer is already known from their authenticated session.',
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
  get_my_orders: async (_input, { customerEmail }) => orderService.getOrdersByEmail(customerEmail),
  get_order_by_tracking_number: async ({ trackingNumber }, { customerEmail }) => {
    const order = await orderService.getOrderByTrackingNumber(trackingNumber);
    return ownedBy(order, customerEmail);
  },
};

module.exports = { definitions, implementations };
