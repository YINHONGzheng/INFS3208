const express = require('express');
const router = express.Router();

function randomCode(len = 6) {
  return Math.random().toString(36).substring(2, 2 + len).toUpperCase();
}

module.exports = (pool) => {
  // 1) Checkout: Generate an order from the shopping cart
  router.post('/checkout', async (req, res) => {
    const sessionId = req.header('X-Session-Id');
    const { userId } = req.body || {};
    if (!sessionId) return res.status(400).json({ error: 'X-Session-Id required' });

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Find shopping cart
      const [carts] = await conn.query('SELECT id FROM carts WHERE session_id=?', [sessionId]);
      if (!carts.length) throw new Error('Cart not found');
      const cartId = carts[0].id;

      // Find product items
      const [items] = await conn.query(
        `SELECT ci.product_id, ci.qty, p.price
         FROM cart_items ci
         JOIN products p ON p.id=ci.product_id
         WHERE ci.cart_id=?`,
        [cartId]
      );
      if (!items.length) throw new Error('Cart is empty');

      // Calculate the total price
      const total = items.reduce((sum, it) => sum + Number(it.price) * it.qty, 0);
      const pickupCode = randomCode(6);

      // Insert Order
      const [result] = await conn.query(
        'INSERT INTO orders(user_id,total,pickup_code,status) VALUES(?,?,?,?)',
        [userId || null, total, pickupCode, 'placed']
      );
      const orderId = result.insertId;

      // Insert order details
      for (const it of items) {
        await conn.query(
          'INSERT INTO order_items(order_id, product_id, qty, price) VALUES (?,?,?,?)',
          [orderId, it.product_id, it.qty, it.price]
        );
      }

      // Delete shopping cart
      await conn.query('DELETE FROM cart_items WHERE cart_id=?', [cartId]);

      await conn.commit();
      res.json({ success: true, orderId, total, pickupCode });
    } catch (e) {
      await conn.rollback();
      res.status(500).json({ error: e.message });
    } finally {
      conn.release();
    }
  });

  // 2) Check order details
  router.get('/:id', async (req, res) => {
    const { id } = req.params;
    try {
      const [orderRows] = await pool.query('SELECT * FROM orders WHERE id=?', [id]);
      if (!orderRows.length) return res.status(404).json({ error: 'Order not found' });
      const order = orderRows[0];
      const [items] = await pool.query('SELECT * FROM order_items WHERE order_id=?', [id]);
      res.json({ ...order, items });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 3) Self-collection confirmation
  router.post('/pickup', async (req, res) => {
    const { pickupCode } = req.body || {};
    if (!pickupCode) return res.status(400).json({ error: 'pickupCode required' });
    try {
      const [rows] = await pool.query('SELECT * FROM orders WHERE pickup_code=?', [pickupCode]);
      if (!rows.length) return res.status(404).json({ error: 'Invalid pickupCode' });
      await pool.query('UPDATE orders SET status="fulfilled" WHERE id=?', [rows[0].id]);
      res.json({ success: true, message: 'Order fulfilled', orderId: rows[0].id });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
};
