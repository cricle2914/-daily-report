const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const pool = require('../database');
const auth = require('../middleware/authMiddleware');

// ==================== 账户管理（仅 admin） ====================

// 账户列表（含关联工程师信息）
router.get('/accounts', auth('admin'), async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT a.id, a.username, a.role, a.engineer_id, a.created_at,
              e.name AS engineer_name, e.abbr AS engineer_abbr
       FROM accounts a
       LEFT JOIN engineers e ON a.engineer_id = e.id
       ORDER BY a.created_at DESC`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

// 新建账户
router.post('/accounts', auth('admin'), async (req, res, next) => {
  try {
    const { username, password, role, engineer_id } = req.body;

    if (!username || !password || !role) {
      return res.status(400).json({ success: false, message: '用户名、密码、角色不能为空' });
    }
    if (!['admin', 'leader', 'engineer'].includes(role)) {
      return res.status(400).json({ success: false, message: '角色无效' });
    }
    if (role === 'engineer' && !engineer_id) {
      return res.status(400).json({ success: false, message: '员工角色必须关联一个工程师' });
    }

    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO accounts (username, password_hash, role, engineer_id) VALUES (?, ?, ?, ?)',
      [username, hash, role, role === 'engineer' ? engineer_id : null]
    );

    res.json({ success: true, data: { message: '账户已创建' } });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ success: false, message: '用户名已存在' });
    }
    next(err);
  }
});

// 重置密码
router.put('/accounts/:id/password', auth('admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ success: false, message: '密码不能为空' });
    }

    const hash = await bcrypt.hash(password, 10);
    await pool.query('UPDATE accounts SET password_hash = ? WHERE id = ?', [hash, id]);

    res.json({ success: true, data: { message: '密码已重置' } });
  } catch (err) {
    next(err);
  }
});

// 删除账户
router.delete('/accounts/:id', auth('admin'), async (req, res, next) => {
  try {
    const { id } = req.params;

    if (parseInt(id) === req.session.user.id) {
      return res.status(400).json({ success: false, message: '不能删除自己的账户' });
    }

    await pool.query('DELETE FROM accounts WHERE id = ?', [id]);
    res.json({ success: true, data: { message: '已删除' } });
  } catch (err) {
    next(err);
  }
});

// ==================== 权限管理 ====================

// 获取所有权限配置
router.get('/permissions', auth('admin'), async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT vp.*, a.username AS viewer_name, e.name AS engineer_name, e.abbr AS engineer_abbr
       FROM view_permissions vp
       JOIN accounts a ON vp.viewer_account_id = a.id
       JOIN engineers e ON vp.target_engineer_id = e.id
       ORDER BY a.username, e.name`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

// 添加权限
router.post('/permissions', auth('admin'), async (req, res, next) => {
  try {
    const { viewer_account_id, target_engineer_id } = req.body;

    if (!viewer_account_id || !target_engineer_id) {
      return res.status(400).json({ success: false, message: '参数不完整' });
    }

    await pool.query(
      'INSERT INTO view_permissions (viewer_account_id, target_engineer_id) VALUES (?, ?)',
      [viewer_account_id, target_engineer_id]
    );

    res.json({ success: true, data: { message: '权限已添加' } });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ success: false, message: '该权限已存在' });
    }
    next(err);
  }
});

// 删除权限
router.delete('/permissions/:id', auth('admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM view_permissions WHERE id = ?', [id]);
    res.json({ success: true, data: { message: '权限已删除' } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
