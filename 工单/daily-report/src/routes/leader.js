const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const pool = require('../database');
const auth = require('../middleware/authMiddleware');

// ====== 鉴权辅助：允许普通 session 或 viewer session ======
function viewerOrUser(req, res, next) {
  if (req.session?.viewer?.authed) return next();
  if (req.session?.user) return next();
  return res.status(401).json({ success: false, message: '未登录' });
}

// ==================== Viewer 认证 ====================

// viewer 登录（支持 viewer 或 admin 角色账户）
router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.json({ success: false, message: '请输入用户名和密码' });
    }

    const [rows] = await pool.query(
      'SELECT id, password_hash, role FROM accounts WHERE username = ? AND role IN (?, ?)',
      [username, 'viewer', 'admin']
    );

    if (rows.length === 0) {
      return res.json({ success: false, message: '用户名或密码错误' });
    }

    const valid = await bcrypt.compare(password, rows[0].password_hash);
    if (!valid) {
      return res.json({ success: false, message: '用户名或密码错误' });
    }

    req.session.viewer = { authed: true, account_id: rows[0].id, username, role: rows[0].role };
    res.json({ success: true, data: { message: '登录成功', username, role: rows[0].role } });
  } catch (err) {
    next(err);
  }
});

// viewer 退出
router.post('/logout', (req, res) => {
  req.session.viewer = null;
  res.json({ success: true });
});

// viewer 状态检查
router.get('/me', (req, res) => {
  if (req.session?.viewer?.authed) {
    return res.json({ success: true, data: { role: req.session.viewer.role || 'viewer' } });
  }
  if (req.session?.user) {
    return res.json({ success: true, data: { role: req.session.user.role } });
  }
  res.status(401).json({ success: false, message: '未登录' });
});

// 修改 viewer 密码
router.put('/password', async (req, res, next) => {
  try {
    if (!req.session?.viewer?.authed && !req.session?.user) {
      return res.status(401).json({ success: false, message: '未登录' });
    }

    const { old_password, new_password } = req.body;
    if (!old_password || !new_password) {
      return res.json({ success: false, message: '请填写旧密码和新密码' });
    }

    let accountId;
    if (req.session?.viewer?.authed) {
      accountId = req.session.viewer.account_id;
    } else if (req.session?.user) {
      accountId = req.session.user.id;
    }

    if (!accountId) {
      return res.status(401).json({ success: false, message: '未登录' });
    }

    const [rows] = await pool.query(
      'SELECT id, password_hash FROM accounts WHERE id = ?',
      [accountId]
    );

    if (rows.length === 0) {
      return res.json({ success: false, message: '账户未找到' });
    }

    const valid = await bcrypt.compare(old_password, rows[0].password_hash);
    if (!valid) {
      return res.json({ success: false, message: '旧密码错误' });
    }

    const hash = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE accounts SET password_hash = ? WHERE id = ?', [hash, accountId]);

    res.json({ success: true, data: { message: '密码已修改' } });
  } catch (err) {
    next(err);
  }
});

// ==================== 今日汇报总览 ====================
router.get('/today', viewerOrUser, async (req, res, next) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    // 所有在职工程师
    const [allEngineers] = await pool.query(
      `SELECT e.id, e.name, e.abbr FROM engineers e WHERE e.status = 'active' ORDER BY e.name`
    );

    // 今日已提交日报的工程师
    const [submitted] = await pool.query(
      `SELECT DISTINCT dr.engineer_id, dr.project_id, dr.progress, dr.status,
              p.name AS project_name
       FROM daily_reports dr
       JOIN projects p ON dr.project_id = p.id
       WHERE dr.report_date = ?`,
      [today]
    );

    // 今日在外实施（有 tomorrow_plan 标记为去项目）
    const [fieldPlans] = await pool.query(
      `SELECT tp.engineer_id, tp.destination, tp.project_id, p.name AS project_name
       FROM tomorrow_plans tp
       LEFT JOIN projects p ON tp.project_id = p.id
       WHERE tp.report_date = ? AND tp.destination IN ('existing_project', 'new_project')`,
      [today]
    );

    // 组装数据
    const submittedMap = {};
    submitted.forEach(r => {
      submittedMap[r.engineer_id] = { project_id: r.project_id, project_name: r.project_name, progress: r.progress, status: r.status };
    });

    const fieldMap = {};
    fieldPlans.forEach(p => {
      fieldMap[p.engineer_id] = { destination: p.destination, project_id: p.project_id, project_name: p.project_name };
    });

    const engineers = allEngineers.map(e => ({
      ...e,
      is_submitted: !!submittedMap[e.id],
      report: submittedMap[e.id] || null,
      in_field: !!fieldMap[e.id],
      plan: fieldMap[e.id] || null
    }));

    const inField = engineers.filter(e => e.in_field);
    const notSubmitted = engineers.filter(e => !e.is_submitted);
    const submitted_count = engineers.filter(e => e.is_submitted).length;

    res.json({
      success: true,
      data: {
        total: engineers.length,
        submitted: submitted_count,
        not_submitted: notSubmitted.length,
        in_field: inField.length,
        engineers,
        not_submitted_list: notSubmitted
      }
    });
  } catch (err) {
    next(err);
  }
});

// ==================== 出勤格子数据 ====================
router.get('/attendance', viewerOrUser, async (req, res, next) => {
  try {
    const { engineer_id, date_from, date_to } = req.query;

    if (!date_from || !date_to) {
      return res.status(400).json({ success: false, message: '请选择日期范围' });
    }

    // 查询工程师列表
    let engSql = `SELECT id, name, abbr FROM engineers WHERE status = 'active'`;
    const engParams = [];
    if (engineer_id) {
      engSql += ' AND id = ?';
      engParams.push(engineer_id);
    }
    engSql += ' ORDER BY name';
    const [engineers] = await pool.query(engSql, engParams);

    // 查询日报数据
    const [reports] = await pool.query(
      `SELECT engineer_id, project_id, report_date, id, progress, status, plan_title
       FROM daily_reports
       WHERE engineer_id IN (${engineers.map(() => '?').join(',')})
       AND report_date BETWEEN ? AND DATE_ADD(?, INTERVAL 1 DAY)
       ORDER BY engineer_id, report_date`,
      [...engineers.map(e => e.id), date_from, date_to]
    );

    // 查询明日计划
    const [plans] = await pool.query(
      `SELECT tp.*, p.name AS project_name
       FROM tomorrow_plans tp
       LEFT JOIN projects p ON tp.project_id = p.id
       WHERE tp.engineer_id IN (${engineers.map(() => '?').join(',')})
       AND tp.report_date BETWEEN ? AND ?
       ORDER BY tp.engineer_id, tp.report_date`,
      [...engineers.map(e => e.id), date_from, date_to]
    );

    // 组织数据
    const reportsByEng = {};
    reports.forEach(r => {
      const d = r.report_date instanceof Date ? r.report_date.toISOString().split('T')[0] : new Date(r.report_date).toISOString().split('T')[0];
      if (!reportsByEng[r.engineer_id]) reportsByEng[r.engineer_id] = {};
      reportsByEng[r.engineer_id][d] = r;
    });

    const plansByEng = {};
    plans.forEach(p => {
      const d = p.report_date instanceof Date ? p.report_date.toISOString().split('T')[0] : new Date(p.report_date).toISOString().split('T')[0];
      if (!plansByEng[p.engineer_id]) plansByEng[p.engineer_id] = {};
      plansByEng[p.engineer_id][d] = p;
    });

    // 计算日期列表和颜色
    const start = new Date(date_from);
    const end = new Date(date_to);
    const dates = [];
    const d = new Date(start);
    while (d <= end) {
      dates.push(d.toISOString().split('T')[0]);
      d.setDate(d.getDate() + 1);
    }

    const attendance = {};
    engineers.forEach(e => {
      attendance[e.id] = {};
      dates.forEach(dateStr => {
        const theDate = new Date(dateStr);
        const dayOfWeek = theDate.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

        const engReports = reportsByEng[e.id] || {};
        const engPlans = plansByEng[e.id] || {};
        const plan = engPlans[dateStr];
        const report = engReports[dateStr];

        let color = 'unknown';
        let tooltip = dateStr;

        // 请假/其他
        if (plan && plan.destination === 'other') {
          color = 'other';
        }
        // 在外实施：计划去项目现场
        else if (plan && ['existing_project', 'new_project'].includes(plan.destination)) {
          color = 'onsite';
        }
        // 在公司：回公司 或 有日报但没有外勤计划
        else if (report || (plan && plan.destination === 'back_to_office')) {
          color = 'office';
        }
        // 周末无记录
        else if (isWeekend) {
          color = 'weekend';
        }
        // 无记录
        else {
          color = 'unknown';
        }

        attendance[e.id][dateStr] = {
          color,
          report_id: report ? report.id : null,
          has_report: !!report,
          destination: plan ? plan.destination : null,
          project_name: plan ? plan.project_name : null
        };
      });
    });

    res.json({
      success: true,
      data: { engineers, dates, attendance }
    });
  } catch (err) {
    next(err);
  }
});

// ==================== 工时趋势 ====================
router.get('/hours/trend', viewerOrUser, async (req, res, next) => {
  try {
    const { period, date } = req.query;
    const refDate = date || new Date().toISOString().split('T')[0];
    const d = new Date(refDate);

    let dateFrom, dateTo, groupFormat, labelFormat;

    switch (period) {
      case 'year':
        dateFrom = `${d.getFullYear()}-01-01`;
        dateTo = `${d.getFullYear()}-12-31`;
        groupFormat = `DATE_FORMAT(report_date, '%Y-%m')`;
        labelFormat = 'month';
        break;
      case 'quarter': {
        const q = Math.floor(d.getMonth() / 3) * 3;
        const qStart = new Date(d.getFullYear(), q, 1);
        const qEnd = new Date(d.getFullYear(), q + 3, 0);
        dateFrom = qStart.toISOString().split('T')[0];
        dateTo = qEnd.toISOString().split('T')[0];
        groupFormat = `DATE_FORMAT(report_date, '%Y-%m-%d')`;
        labelFormat = 'day';
        break;
      }
      case 'week': {
        const dayOfWeek = d.getDay();
        const weekStart = new Date(d);
        weekStart.setDate(d.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        dateFrom = weekStart.toISOString().split('T')[0];
        dateTo = weekEnd.toISOString().split('T')[0];
        groupFormat = `DATE_FORMAT(report_date, '%Y-%m-%d')`;
        labelFormat = 'day';
        break;
      }
      case 'day':
      default: {
        // 显示近30天
        const dayEnd = new Date(d);
        const dayStart = new Date(d);
        dayStart.setDate(dayStart.getDate() - 29);
        dateFrom = dayStart.toISOString().split('T')[0];
        dateTo = dayEnd.toISOString().split('T')[0];
        groupFormat = `DATE_FORMAT(report_date, '%Y-%m-%d')`;
        labelFormat = 'day';
        break;
      }
    }

    const [rows] = await pool.query(
      `SELECT ${groupFormat} AS period_label,
              SUM(hours) AS total_hours,
              COUNT(DISTINCT engineer_id) AS engineer_count
       FROM work_hours
       WHERE report_date BETWEEN ? AND ?
       GROUP BY period_label
       ORDER BY period_label`,
      [dateFrom, dateTo]
    );

    // 按项目统计
    const [byProject] = await pool.query(
      `SELECT p.name AS project_name, SUM(wh.hours) AS total_hours
       FROM work_hours wh
       JOIN projects p ON wh.project_id = p.id
       WHERE wh.report_date BETWEEN ? AND ?
       GROUP BY wh.project_id
       ORDER BY total_hours DESC`,
      [dateFrom, dateTo]
    );

    // 按工程师统计
    const [byEngineer] = await pool.query(
      `SELECT wh.engineer_id, e.name AS engineer_name, e.abbr, SUM(wh.hours) AS total_hours
       FROM work_hours wh
       JOIN engineers e ON wh.engineer_id = e.id
       WHERE wh.report_date BETWEEN ? AND ?
       GROUP BY wh.engineer_id
       ORDER BY total_hours DESC`,
      [dateFrom, dateTo]
    );

    res.json({
      success: true,
      data: {
        date_from: dateFrom,
        date_to: dateTo,
        trend: rows,
        by_project: byProject,
        by_engineer: byEngineer,
        grand_total: rows.reduce((s, r) => s + parseFloat(r.total_hours || 0), 0)
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
