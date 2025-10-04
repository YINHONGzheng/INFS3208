const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');

const PORT = process.env.PORT || 3000;

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'db',
  user: process.env.DB_USER || 'minishop',
  password: process.env.DB_PASS || 'minishop123',
  database: process.env.DB_NAME || 'minishop',
  port: Number(process.env.DB_PORT || 3306),
  waitForConnections: true,
  connectionLimit: 10
});

const app = express();
app.use(cors());
app.use(express.json());

//  Health check
app.get('/api/health', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT 1 AS ok');
    res.json({ ok: true, db: rows[0].ok === 1 });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

//  Catalog routes
const catalogRoutes = require('./routes/catalog')(pool);
app.use('/api/catalog', catalogRoutes);

//  Auth routes
const authRoutes = require('./routes/auth')(pool);
app.use('/api/auth', authRoutes);

//  Cart routes
const cartRoutes = require('./routes/cart')(pool);
app.use('/api/cart', cartRoutes);

//  Order routes
const orderRoutes = require('./routes/order')(pool);
app.use('/api/order', orderRoutes);

app.listen(PORT, () => console.log(`API up on :${PORT}`));
