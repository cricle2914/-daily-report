const express = require('express');
const router = express.Router();
const pool = require('../database');

// 提交日报（支持 upsert：已存在则覆盖）
router.post('/', async (req, res, next) => {
  try {
    const { engineer_id, project_id, plan_title, tasks, progress, status, issues, next_plan, overwrite } = req.body;

    // 必填校验
    if (!engineer_id || !project_id || !plan_title || !tasks || progress === undefined || !status) {
      return res.status(400).json({
        success: false,
        error: '必填字段缺失'
      });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const today = new Date().toISOString().split('T')[0];

      // 检查当日是否已提交
      const [existing] = await conn.query(
        'SELECT id, impl_day FROM daily_reports WHERE engineer_id = ? AND project_id = ? AND report_date = ?',
        [engineer_id, project_id, today]
      );

      if (existing.length > 0) {
        if (!overwrite) {
          // 未携带 overwrite 标记，返回冲突让前端确认
          await conn.rollback();
          return res.status(400).json({
            success: false,
            error: '今日已提交过日报',
            data: { existing: true }
          });
        }
        // 覆盖模式：UPDATE 已有记录，不增加实施天数
        await conn.query(
          `UPDATE daily_reports SET plan_title = ?, tasks = ?, progress = ?, status = ?, issues = ?, next_plan = ?, submitted_at = NOW()
           WHERE id = ?`,
          [plan_title, JSON.stringify(tasks), progress, status, issues || null, next_plan || null, existing[0].id]
        );
        await conn.commit();
        return res.json({
          success: true,
          data: { impl_day: existing[0].impl_day, overwritten: true, message: '日报已更新' }
        });
      }

      // 新记录：计算实施天数并插入
      const [history] = await conn.query(
        'SELECT COUNT(*) AS cnt FROM daily_reports WHERE engineer_id = ? AND project_id = ?',
        [engineer_id, project_id]
      );
      const implDay = history[0].cnt + 1;

      await conn.query(
        `INSERT INTO daily_reports (engineer_id, project_id, report_date, impl_day, plan_title, tasks, progress, status, issues, next_plan)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [engineer_id, project_id, today, implDay, plan_title, JSON.stringify(tasks), progress, status, issues || null, next_plan || null]
      );

      // 同步更新 engineer_projects.impl_days
      await conn.query(
        'UPDATE engineer_projects SET impl_days = impl_days + 1 WHERE engineer_id = ? AND project_id = ?',
        [engineer_id, project_id]
      );

      await conn.commit();

      res.json({
        success: true,
        data: { impl_day: implDay, message: '日报提交成功' }
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

// 修改已有日报（PUT）
router.put('/', async (req, res, next) => {
  try {
    const { engineer_id, project_id, plan_title, tasks, progress, status, issues, next_plan } = req.body;
    if (!engineer_id || !project_id || !plan_title || !tasks || progress === undefined || !status) {
      return res.status(400).json({ success: false, error: '必填字段缺失' });
    }

    const today = new Date().toISOString().split('T')[0];
    const [existing] = await pool.query(
      'SELECT id FROM daily_reports WHERE engineer_id = ? AND project_id = ? AND report_date = ?',
      [engineer_id, project_id, today]
    );

    if (existing.length === 0) {
      return res.status(400).json({ success: false, error: '今日尚无日报可修改' });
    }

    await pool.query(
      `UPDATE daily_reports SET plan_title = ?, tasks = ?, progress = ?, status = ?, issues = ?, next_plan = ?, submitted_at = NOW()
       WHERE id = ?`,
      [plan_title, JSON.stringify(tasks), progress, status, issues || null, next_plan || null, existing[0].id]
    );

    res.json({ success: true, data: { overwritten: true, message: '日报已修改' } });
  } catch (err) {
    next(err);
  }
});

// 提交明日去向
router.post('/tomorrow', async (req, res, next) => {
  try {
    const { engineer_id, report_date, destination, project_id,
            new_project_customer, new_project_name, new_project_order,
            new_project_contact, new_project_phone, new_project_version,
            new_project_address, new_project_manufacturer, new_project_agent,
            new_project_tech_lead, new_project_service_manager,
            other_reason, overwrite } = req.body;

    if (!engineer_id || !report_date || !destination) {
      return res.status(400).json({
        success: false,
        error: '必填字段缺失：engineer_id、report_date、destination'
      });
    }

    const validDestinations = ['existing_project', 'new_project', 'back_to_office', 'other'];
    if (!validDestinations.includes(destination)) {
      return res.status(400).json({
        success: false,
        error: '无效的 destination 值'
      });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // 检查当日是否已提交明日去向
      const [existing] = await conn.query(
        'SELECT id FROM tomorrow_plans WHERE engineer_id = ? AND report_date = ?',
        [engineer_id, report_date]
      );
      if (existing.length > 0) {
        if (!overwrite) {
          await conn.rollback();
          return res.status(400).json({
            success: false,
            error: '今日已提交过明日去向',
            data: { existing: true }
          });
        }
        // 覆盖模式：删除旧记录重新插入
        await conn.query('DELETE FROM tomorrow_plans WHERE id = ?', [existing[0].id]);
      }

      let finalProjectId = project_id || null;

      // new_project 类型：自动创建项目并关联
      if (destination === 'new_project') {
        if (!new_project_customer || !new_project_name) {
          await conn.rollback();
          return res.status(400).json({
            success: false,
            error: '新项目需填写客户名和项目名'
          });
        }

        const [result] = await conn.query(
          `INSERT INTO projects (name, order_no, customer, contact_name, contact_phone, product_version, install_address, created_by,
            manufacturer, agent, tech_lead, service_manager)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [new_project_name, new_project_order || null, new_project_customer,
           new_project_contact || null, new_project_phone || null,
           new_project_version || null, new_project_address || null, engineer_id,
           new_project_manufacturer || null, new_project_agent || null,
           new_project_tech_lead || null, new_project_service_manager || null]
        );

        finalProjectId = result.insertId;

        await conn.query(
          'INSERT INTO engineer_projects (engineer_id, project_id, impl_days) VALUES (?, ?, 0)',
          [engineer_id, finalProjectId]
        );
      }

      // 插入明日计划
      await conn.query(
        `INSERT INTO tomorrow_plans
         (engineer_id, report_date, destination, project_id,
          new_project_customer, new_project_name, new_project_order,
          new_project_contact, new_project_phone, new_project_version,
          new_project_address, other_reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [engineer_id, report_date, destination, finalProjectId,
         new_project_customer || null, new_project_name || null, new_project_order || null,
         new_project_contact || null, new_project_phone || null,
         new_project_version || null, new_project_address || null, other_reason || null]
      );

      await conn.commit();

      res.json({ success: true, data: { message: '明日去向提交成功' } });
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

// 获取指定工程师/项目上次日报的进度
router.get('/last-progress', async (req, res, next) => {
  try {
    const { engineer_id, project_id } = req.query;
    if (!engineer_id || !project_id) {
      return res.json({ success: true, data: { progress: 0 } });
    }
    const [rows] = await pool.query(
      'SELECT progress FROM daily_reports WHERE engineer_id = ? AND project_id = ? ORDER BY report_date DESC LIMIT 1',
      [engineer_id, project_id]
    );
    res.json({
      success: true,
      data: { progress: rows.length > 0 ? rows[0].progress : 0 }
    });
  } catch (err) {
    next(err);
  }
});

// 次日人员分布统计
router.get('/stats/tomorrow', async (req, res, next) => {
  try {
    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ success: false, error: '缺少 date 参数' });
    }

    // 计算次日日期
    const d = new Date(date);
    d.setDate(d.getDate() + 1);
    const nextDate = d.toISOString().split('T')[0];

    // 查询所有工程师及其明日去向
    const [rows] = await pool.query(
      `SELECT e.id, e.name, e.abbr,
              tp.destination, tp.project_id, p.name AS project_name
       FROM engineers e
       LEFT JOIN tomorrow_plans tp ON e.id = tp.engineer_id AND tp.report_date = ?
       LEFT JOIN projects p ON tp.project_id = p.id`,
      [date]
    );

    let inProject = [];
    let backToOffice = [];
    let unavailable = [];
    let pending = [];

    for (const row of rows) {
      if (!row.destination) {
        pending.push({ engineer_name: row.name });
      } else if (row.destination === 'existing_project' || row.destination === 'new_project') {
        inProject.push({
          engineer_name: row.name,
          project_name: row.project_name || '新项目'
        });
      } else if (row.destination === 'back_to_office') {
        backToOffice.push({ engineer_name: row.name });
      } else if (row.destination === 'other') {
        unavailable.push({ engineer_name: row.name });
      }
    }

    res.json({
      success: true,
      data: {
        date: nextDate,
        total_engineers: rows.length,
        in_project: inProject.length,
        back_to_office: backToOffice.length,
        unavailable: unavailable.length,
        pending: pending.length,
        details: {
          in_project: inProject,
          back_to_office: backToOffice,
          unavailable,
          pending
        }
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
