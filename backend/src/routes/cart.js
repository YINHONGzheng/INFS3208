const express = require('express');
const router = express.Router();

// Ensure that the cart corresponding to the specified sessionId exists and return cart_id
async function ensureCart(pool, sessionId) {
  const [found] = await pool.query('SELECT id FROM carts WHERE session_id=?', [sessionId]);
  if (found.length) return found[0].id;
  const [ret] = await pool.query('INSERT INTO carts(session_id) VALUES(?)', [sessionId]);
  return ret.insertId;
}

module.exports = (pool) => {
  // 1) Get shopping cart details
  router.get('/', async (req, res) => {
    const sessionId = req.header('X-Session-Id');
    if (!sessionId) return res.status(400).json({ error: 'X-Session-Id required' });
    try {
      const cartId = await ensureCart(pool, sessionId);
      const [rows] = await pool.query(
        `SELECT ci.id, ci.product_id, p.name, p.price, ci.qty,
                (p.price * ci.qty) AS subtotal
         FROM cart_items ci
         JOIN products p ON p.id = ci.product_id
         WHERE ci.cart_id=?`,
        [cartId]
      );
      const total = rows.reduce((s, r) => s + Number(r.subtotal), 0);
      res.json({ items: rows, total });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 2) Add to cart { productId, qty }
  router.post('/add', async (req, res) => {
    const sessionId = req.header('X-Session-Id');
    const { productId, qty } = req.body || {};
    if (!sessionId) return res.status(400).json({ error: 'X-Session-Id required' });
    if (!productId) return res.status(400).json({ error: 'productId required' });
    const n = Math.max(1, parseInt(qty || 1, 10));
    try {
      const cartId = await ensureCart(pool, sessionId);
      const [exists] = await pool.query(
        'SELECT id, qty FROM cart_items WHERE cart_id=? AND product_id=?',
        [cartId, productId]
      );

      if (exists.length) {
        await pool.query(
          'UPDATE cart_items SET qty = qty + ? WHERE id=?',
          [n, exists[0].id]
        );
      } else {
        await pool.query(
          'INSERT INTO cart_items(cart_id, product_id, qty) VALUES (?,?,?)',
          [cartId, productId, n]
        );
      }
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 3) Remove an item { cartItemId } from the cart
  router.post('/remove', async (req, res) => {
    const sessionId = req.header('X-Session-Id');
    const { cartItemId } = req.body || {};
    if (!sessionId) return res.status(400).json({ error: 'X-Session-Id required' });
    if (!cartItemId) return res.status(400).json({ error: 'cartItemId required' });
    try {
      // For security reasons, verifying that the cartItemId belongs to the cart of the current session.
      const cartId = await ensureCart(pool, sessionId);
      await pool.query('DELETE FROM cart_items WHERE id=? AND cart_id=?', [cartItemId, cartId]);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  
  // 4) Clear shopping cart
  router.post('/clear', async (req, res) => {
    const sessionId = req.header('X-Session-Id');
    const userId = getUserIdFromReq(req);
    if (!sessionId && !userId) {
      return res.status(400).json({ error: 'X-Session-Id or user token required' });
    }
    try {
      const cartId = await ensureCart(pool, sessionId, userId);
      await pool.query('DELETE FROM cart_items WHERE cart_id=?', [cartId]);
      return res.json({ success: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  });

  return router;
};
