const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const pool = require('../database');

// 登录
router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.json({ success: false, message: '请输入用户名和密码' });
    }

    const [rows] = await pool.query(
      'SELECT id, username, password_hash, role, engineer_id FROM accounts WHERE username = ?',
      [username]
    );

    if (rows.length === 0) {
      return res.json({ success: false, message: '用户名或密码错误' });
    }

    const account = rows[0];
    const valid = await bcrypt.compare(password, account.password_hash);
    if (!valid) {
      return res.json({ success: false, message: '用户名或密码错误' });
    }

    req.session.user = {
      id: account.id,
      username: account.username,
      role: account.role,
      engineer_id: account.engineer_id
    };

    let redirect = '/admin/';
    if (account.role === 'viewer' || account.role === 'leader') {
      redirect = '/leader/';
    }

    let engineer = null;
    if (account.engineer_id) {
      const [engRows] = await pool.query('SELECT id, name, abbr FROM engineers WHERE id = ?', [account.engineer_id]);
      if (engRows.length > 0) {
        engineer = engRows[0];
      }
    }

    res.json({
      success: true,
      data: {
        username: account.username,
        role: account.role,
        engineer_id: account.engineer_id,
        engineer,
        redirect
      }
    });
  } catch (err) {
    next(err);
  }
});

// 登出
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.json({ success: false, message: '退出失败' });
    }
    res.json({ success: true });
  });
});

// 获取当前用户
router.get('/me', (req, res) => {
  if (!req.session?.user) {
    return res.status(401).json({ success: false, message: '未登录' });
  }
  res.json({
    success: true,
    data: req.session.user
  });
});

module.exports = router;
