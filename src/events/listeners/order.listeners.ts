import { eventBus, APP_EVENTS } from '../eventBus.js';
import { enqueueNotification } from '../../queues/notification.queue.js';
import { logger } from '../../logs/logger.js';

interface OrderStatusChangedPayload {
  orderId: string;
  userId: string;
  previousStatus: string;
  newStatus: string;
}

export function registerOrderListeners(): void {
  eventBus.on(APP_EVENTS.ORDER_STATUS_CHANGED, (payload: OrderStatusChangedPayload) => {
    logger.info('Order status changed event', payload);

    void enqueueNotification({
      userId: payload.userId,
      title: 'Order Update',
      body: `Your order status changed to ${payload.newStatus}`,
      type: 'order_update',
      metadata: { orderId: payload.orderId },
    });
  });
}
