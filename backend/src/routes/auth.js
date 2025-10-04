const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const router = express.Router();

module.exports = (pool) => {
  // Register
  router.post('/register', async (req, res) => {
    const { fullname, email, password } = req.body;
    if (!fullname || !email || !password) {
      return res.status(400).json({ error: 'Please fill in all required fields' });
    }
    try {
      // Check if it already exists
      const [existing] = await pool.query('SELECT id FROM users WHERE email=?', [email]);
      if (existing.length > 0) {
        return res.status(400).json({ error: 'Email already registered' });
      }
      // hash password
      const hash = await bcrypt.hash(password, 10);
      await pool.query(
        'INSERT INTO users(fullname,email,password_hash) VALUES(?,?,?)',
        [fullname, email, hash]
      );
      res.json({ success: true, message: 'User registered' });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Log in
  router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Please fill in all required fields' });
    }
    try {
      const [rows] = await pool.query('SELECT * FROM users WHERE email=?', [email]);
      if (rows.length === 0) {
        return res.status(400).json({ error: 'Invalid email or password' });
      }
      const user = rows[0];
      const ok = await bcrypt.compare(password, user.password_hash);
      if (!ok) {
        return res.status(400).json({ error: 'Invalid email or password' });
      }
      const token = jwt.sign(
        { id: user.id, email: user.email },
        process.env.JWT_SECRET || 'dev_secret',
        { expiresIn: '2h' }
      );
      res.json({ success: true, token, fullname: user.fullname });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
};
