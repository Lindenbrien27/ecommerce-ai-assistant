const orderService = require('../services/orderService');

const definitions = [
  {
    type: 'function',
    function: {
      name: 'get_order_by_number',
      description: "Look up a single order by its order number (e.g. 'ORD-1001').",
      parameters: {
        type: 'object',
        properties: {
          orderNumber: { type: 'string', description: 'The order number to look up.' },
        },
        required: ['orderNumber'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_orders_by_email',
      description: 'Look up all orders placed by a customer, given their email address.',
      parameters: {
        type: 'object',
        properties: {
          email: { type: 'string', description: "The customer's email address." },
        },
        required: ['email'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_order_by_tracking_number',
      description: 'Look up a single order by its shipment tracking number.',
      parameters: {
        type: 'object',
        properties: {
          trackingNumber: { type: 'string', description: 'The carrier tracking number.' },
        },
        required: ['trackingNumber'],
      },
    },
  },
];

const implementations = {
  get_order_by_number: ({ orderNumber }) => orderService.getOrderByNumber(orderNumber),
  get_orders_by_email: ({ email }) => orderService.getOrdersByEmail(email),
  get_order_by_tracking_number: ({ trackingNumber }) =>
    orderService.getOrderByTrackingNumber(trackingNumber),
};

module.exports = { definitions, implementations };
