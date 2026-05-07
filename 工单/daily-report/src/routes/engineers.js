const express = require('express');
const router = express.Router();
const pool = require('../database');

// 模糊搜索工程师（含项目数量）
router.get('/search', async (req, res, next) => {
  try {
    const { name } = req.query;
    if (!name) {
      return res.json({ success: true, data: [] });
    }
    const [rows] = await pool.query(
      `SELECT e.id, e.name, e.abbr,
              COUNT(ep.id) AS project_count
       FROM engineers e
       LEFT JOIN engineer_projects ep ON e.id = ep.engineer_id
       WHERE e.name LIKE ?
       GROUP BY e.id, e.name, e.abbr`,
      [`%${name}%`]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

// 获取工程师关联的项目列表
router.get('/:id/projects', async (req, res, next) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      `SELECT p.id, p.name, p.order_no, p.customer,
              p.contact_name, p.contact_phone, p.product_version,
              p.install_address, ep.impl_days
       FROM projects p
       JOIN engineer_projects ep ON p.id = ep.project_id
       WHERE ep.engineer_id = ?`,
      [id]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
