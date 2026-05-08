const express = require('express');
const router = express.Router();
const pool = require('../database');

// 创建新项目并关联工程师
router.post('/', async (req, res, next) => {
  try {
    const {
      engineer_id, name, customer, order_no,
      contact_name, contact_phone, product_version, install_address,
      manufacturer, agent, tech_lead, service_manager
    } = req.body;

    // 必填校验
    if (!engineer_id || !name || !customer) {
      return res.status(400).json({
        success: false,
        error: '必填字段缺失：engineer_id、name、customer'
      });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // 创建项目
      const [result] = await conn.query(
        `INSERT INTO projects (name, order_no, customer, contact_name, contact_phone, product_version, install_address, created_by,
          manufacturer, agent, tech_lead, service_manager)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [name, order_no || null, customer, contact_name || null,
         contact_phone || null, product_version || null, install_address || null, engineer_id,
         manufacturer || null, agent || null, tech_lead || null, service_manager || null]
      );

      const projectId = result.insertId;

      // 关联工程师
      await conn.query(
        'INSERT INTO engineer_projects (engineer_id, project_id, impl_days) VALUES (?, ?, 0)',
        [engineer_id, projectId]
      );

      await conn.commit();

      res.json({
        success: true,
        data: { id: projectId, name, customer, order_no }
      });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
});

module.exports = router;
