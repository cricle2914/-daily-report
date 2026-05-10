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

// 获取工程师关联的项目列表（按最后填写时间排序）
router.get('/:id/projects', async (req, res, next) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      `SELECT p.id, p.name, p.order_no, p.order_type, p.customer,
              p.contact_name, p.contact_phone, p.product_version,
              p.install_address, p.manufacturer, p.agent, p.tech_lead, p.service_manager,
              ep.impl_days,
              (SELECT MAX(dr.submitted_at) FROM daily_reports dr WHERE dr.project_id = p.id AND dr.engineer_id = ep.engineer_id) AS last_report_date
       FROM projects p
       JOIN engineer_projects ep ON p.id = ep.project_id
       WHERE ep.engineer_id = ?
       ORDER BY last_report_date DESC, ep.joined_at DESC`,
      [id]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
