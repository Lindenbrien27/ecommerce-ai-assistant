const orderService = require('../services/orderService');

const definitions = [
  {
    name: 'get_order_by_number',
    description: "Look up a single order by its order number (e.g. 'ORD-1001').",
    input_schema: {
      type: 'object',
      properties: {
        orderNumber: { type: 'string', description: 'The order number to look up.' },
      },
      required: ['orderNumber'],
    },
  },
  {
    name: 'get_orders_by_email',
    description: 'Look up all orders placed by a customer, given their email address.',
    input_schema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: "The customer's email address." },
      },
      required: ['email'],
    },
  },
  {
    name: 'get_order_by_tracking_number',
    description: 'Look up a single order by its shipment tracking number.',
    input_schema: {
      type: 'object',
      properties: {
        trackingNumber: { type: 'string', description: 'The carrier tracking number.' },
      },
      required: ['trackingNumber'],
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
