const express = require('express');
const router = express.Router();

module.exports = (pool) => {
  // Get all products
  router.get('/', async (req, res) => {
    try {
      const [rows] = await pool.query('SELECT * FROM products');
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Search products by keyword
  router.get('/search', async (req, res) => {
    const { q } = req.query;
    if (!q) return res.json([]);
    try {
      const [rows] = await pool.query(
        'SELECT * FROM products WHERE name LIKE ? OR category LIKE ?',
        [`%${q}%`, `%${q}%`]
      );
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
};
