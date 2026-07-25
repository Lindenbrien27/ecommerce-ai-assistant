import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export function OrdersPage() {
  const { token, logout } = useAuth();
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch('/api/orders', {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.status === 401) {
          logout();
          return;
        }

        if (!res.ok) {
          if (!cancelled) setError('Something went wrong loading your orders.');
          return;
        }

        const data = await res.json();
        if (!cancelled) setOrders(data);
      } catch {
        if (!cancelled) setError("Couldn't reach the server. Please check your connection and try again.");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [token, logout]);

  return (
    <>
      <h1>Your Orders</h1>
      <p className="subtitle">Every order placed under your verified email.</p>

      {error && <p className="verify-error">{error}</p>}
      {!error && orders === null && <p className="subtitle">Loading...</p>}
      {orders && orders.length === 0 && <p className="subtitle">No orders found.</p>}

      {orders && orders.length > 0 && (
        <ul className="order-list">
          {orders.map((order) => (
            <li key={order.order_number}>
              <Link to={`/orders/${order.order_number}`} className="order-list-item">
                <span className="order-number">{order.order_number}</span>
                <span className="order-product">{order.product_name}</span>
                <span className={`order-status status-${order.status}`}>
                  {order.status.replace(/_/g, ' ')}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
