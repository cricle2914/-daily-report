const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const pool = require('../database');
const auth = require('../middleware/authMiddleware');

// ====== 权限辅助函数：获取当前用户可查看的工程师ID列表 ======
async function getAuthorizedEngineerIds(user) {
  if (user.role === 'admin') return null; // null = 不过滤
  if (user.role === 'engineer' && user.engineer_id) {
    const [perms] = await pool.query(
      'SELECT target_engineer_id FROM view_permissions WHERE viewer_account_id = ?',
      [user.id]
    );
    const ids = perms.map(p => p.target_engineer_id);
    ids.push(user.engineer_id); // 自己永远可见
    return ids;
  }
  return null;
}

// ==================== 仪表盘 ====================
router.get('/dashboard', auth(), async (req, res, next) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    // 今日已提交人数
    const [submitted] = await pool.query(
      `SELECT COUNT(DISTINCT engineer_id) AS cnt FROM daily_reports WHERE report_date = ?`,
      [today]
    );

    // 所有在职工程师数（应提交）
    const [total] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM engineers WHERE status = 'active'`
    );

    // 在外实施人数（有项目关联的在职工程师）
    const [inField] = await pool.query(
      `SELECT COUNT(DISTINCT ep.engineer_id) AS cnt
       FROM engineer_projects ep
       JOIN engineers e ON e.id = ep.engineer_id
       WHERE e.status = 'active'`
    );

    // 本月累计工时
    const [monthHours] = await pool.query(
      `SELECT COALESCE(SUM(hours), 0) AS total FROM work_hours
       WHERE YEAR(report_date) = YEAR(CURDATE()) AND MONTH(report_date) = MONTH(CURDATE())`
    );

    // 近7天每日提交数
    const [weekly] = await pool.query(
      `SELECT report_date, COUNT(DISTINCT engineer_id) AS cnt
       FROM daily_reports
       WHERE report_date >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
       GROUP BY report_date ORDER BY report_date`
    );

    // 今日未提交名单
    const [notSubmitted] = await pool.query(
      `SELECT e.id, e.name, e.abbr FROM engineers e
       WHERE e.status = 'active'
       AND e.id NOT IN (
         SELECT DISTINCT engineer_id FROM daily_reports WHERE report_date = ?
       )`,
      [today]
    );

    // 补全近7天空白天数
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const ds = d.toISOString().split('T')[0];
      const found = weekly.find(w => {
        const wd = w.report_date instanceof Date
          ? w.report_date.toISOString().split('T')[0]
          : new Date(w.report_date).toISOString().split('T')[0];
        return wd === ds;
      });
      days.push({ date: ds, count: found ? found.cnt : 0 });
    }

    res.json({
      success: true,
      data: {
        submitted: submitted[0].cnt,
        total: total[0].cnt,
        notSubmitted: notSubmitted,
        inField: inField[0].cnt,
        monthHours: parseFloat(monthHours[0].total),
        weekly: days
      }
    });
  } catch (err) {
    next(err);
  }
});

// ==================== 员工管理 ====================

// 员工列表
router.get('/engineers', auth(), async (req, res, next) => {
  try {
    const { status } = req.query;
    const allowedIds = await getAuthorizedEngineerIds(req.session.user);
    let sql = `SELECT e.*, COUNT(ep.id) AS project_count
               FROM engineers e
               LEFT JOIN engineer_projects ep ON e.id = ep.engineer_id`;
    const params = [];
    const conditions = [];

    if (allowedIds !== null) {
      conditions.push(`e.id IN (${allowedIds.map(() => '?').join(',')})`);
      params.push(...allowedIds);
    }
    if (status && status !== 'all') {
      conditions.push('e.status = ?');
      params.push(status);
    }
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' GROUP BY e.id ORDER BY e.created_at DESC';
    const [rows] = await pool.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

// 员工详情
router.get('/engineers/:id', auth(), async (req, res, next) => {
  try {
    const { id } = req.params;

    const [engineers] = await pool.query(
      'SELECT * FROM engineers WHERE id = ?', [id]
    );
    if (engineers.length === 0) {
      return res.status(404).json({ success: false, message: '员工不存在' });
    }

    // 参与的项目
    const [projects] = await pool.query(
      `SELECT p.*, ep.impl_days, ep.joined_at
       FROM projects p
       JOIN engineer_projects ep ON p.id = ep.project_id
       WHERE ep.engineer_id = ?
       ORDER BY ep.joined_at DESC`,
      [id]
    );

    // 每个项目最近一条日报
    const [reports] = await pool.query(
      `SELECT dr.*, p.name AS project_name
       FROM daily_reports dr
       JOIN projects p ON dr.project_id = p.id
       WHERE dr.engineer_id = ?
       AND dr.id IN (
         SELECT MAX(id) FROM daily_reports
         WHERE engineer_id = ?
         GROUP BY project_id
       )
       ORDER BY dr.report_date DESC`,
      [id, id]
    );

    res.json({
      success: true,
      data: { ...engineers[0], projects, recent_reports: reports }
    });
  } catch (err) {
    next(err);
  }
});

// 新建员工
router.post('/engineers', auth(), async (req, res, next) => {
  try {
    const { name, abbr, phone, email, department, position, hire_date } = req.body;
    if (!name || !abbr) {
      return res.status(400).json({ success: false, message: '姓名和缩写不能为空' });
    }
    const [result] = await pool.query(
      'INSERT INTO engineers (name, abbr, phone, email, department, position, hire_date) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [name, abbr, phone || null, email || null, department || null, position || null, hire_date || null]
    );
    res.json({ success: true, data: { id: result.insertId } });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ success: false, message: '该员工名已存在' });
    }
    next(err);
  }
});

// 更新员工
router.put('/engineers/:id', auth(), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, abbr, phone, email, department, position, hire_date, status } = req.body;
    await pool.query(
      'UPDATE engineers SET name=?, abbr=?, phone=?, email=?, department=?, position=?, hire_date=?, status=? WHERE id=?',
      [name, abbr, phone || null, email || null, department || null, position || null, hire_date || null, status || 'active', id]
    );
    res.json({ success: true, data: { message: '已更新' } });
  } catch (err) {
    next(err);
  }
});

// 删除员工（软删除，检查是否有进行中的项目）
router.delete('/engineers/:id', auth(), async (req, res, next) => {
  try {
    const { id } = req.params;

    // 检查是否有进行中的项目
    const [projects] = await pool.query(
      `SELECT p.id, p.name FROM projects p
       JOIN engineer_projects ep ON p.id = ep.project_id
       WHERE ep.engineer_id = ?`,
      [id]
    );

    if (projects.length > 0) {
      const names = projects.map(p => p.name).join('、');
      return res.status(400).json({
        success: false,
        message: `该员工仍有进行中的项目（${names}），请先移除项目关联`
      });
    }

    await pool.query('UPDATE engineers SET status = ? WHERE id = ?', ['inactive', id]);
    res.json({ success: true, data: { message: '已离职' } });
  } catch (err) {
    next(err);
  }
});

// ==================== 项目管理 ====================

// 项目列表（支持搜索）
router.get('/projects', auth(), async (req, res, next) => {
  try {
    const { keyword, order_no, engineer } = req.query;
    const allowedIds = await getAuthorizedEngineerIds(req.session.user);
    let sql = `
      SELECT p.*,
             GROUP_CONCAT(DISTINCT CONCAT(e.id, ':', e.name, ':', e.abbr) SEPARATOR ',') AS engineers
      FROM projects p
      LEFT JOIN engineer_projects ep ON p.id = ep.project_id
      LEFT JOIN engineers e ON ep.engineer_id = e.id`;
    const params = [];
    const conditions = [];

    if (allowedIds !== null) {
      conditions.push(`ep.engineer_id IN (${allowedIds.map(() => '?').join(',')})`);
      params.push(...allowedIds);
    }
    if (keyword) {
      conditions.push('p.name LIKE ?');
      params.push(`%${keyword}%`);
    }
    if (order_no) {
      conditions.push('p.order_no LIKE ?');
      params.push(`%${order_no}%`);
    }
    if (engineer) {
      conditions.push('(e.name LIKE ? OR e.abbr LIKE ?)');
      params.push(`%${engineer}%`, `%${engineer}%`);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ` GROUP BY p.id ORDER BY p.created_at DESC`;

    const [rows] = await pool.query(sql, params);

    // 解析工程师字符串为数组
    const data = rows.map(r => {
      const engineers_list = r.engineers
        ? r.engineers.split(',').map(s => {
            const [id, name, abbr] = s.split(':');
            return { id: parseInt(id), name, abbr };
          })
        : [];
      return { ...r, engineers: engineers_list };
    });

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// 项目详情
router.get('/projects/:id', auth(), async (req, res, next) => {
  try {
    const { id } = req.params;

    const [projects] = await pool.query('SELECT * FROM projects WHERE id = ?', [id]);
    if (projects.length === 0) {
      return res.status(404).json({ success: false, message: '项目不存在' });
    }

    const [engineers] = await pool.query(
      `SELECT e.*, ep.impl_days, ep.joined_at
       FROM engineers e
       JOIN engineer_projects ep ON e.id = ep.engineer_id
       WHERE ep.project_id = ?
       ORDER BY ep.joined_at DESC`,
      [id]
    );

    res.json({ success: true, data: { ...projects[0], engineers } });
  } catch (err) {
    next(err);
  }
});

// 新建项目
router.post('/projects', auth(), async (req, res, next) => {
  try {
    const {
      name, order_no, customer, contact_name, contact_phone,
      product_version, install_address, manufacturer, agent,
      tech_lead, service_manager
    } = req.body;

    if (!name || !customer) {
      return res.status(400).json({ success: false, message: '项目名和客户名不能为空' });
    }

    const [result] = await pool.query(
      `INSERT INTO projects (name, order_no, customer, contact_name, contact_phone,
        product_version, install_address, manufacturer, agent, tech_lead, service_manager)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, order_no || null, customer, contact_name || null, contact_phone || null,
       product_version || null, install_address || null, manufacturer || null,
       agent || null, tech_lead || null, service_manager || null]
    );

    res.json({ success: true, data: { id: result.insertId } });
  } catch (err) {
    next(err);
  }
});

// 更新项目
router.put('/projects/:id', auth(), async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      name, order_no, customer, contact_name, contact_phone,
      product_version, install_address, manufacturer, agent,
      tech_lead, service_manager
    } = req.body;

    await pool.query(
      `UPDATE projects SET name=?, order_no=?, customer=?, contact_name=?, contact_phone=?,
        product_version=?, install_address=?, manufacturer=?, agent=?, tech_lead=?, service_manager=?
       WHERE id=?`,
      [name, order_no || null, customer, contact_name || null, contact_phone || null,
       product_version || null, install_address || null, manufacturer || null,
       agent || null, tech_lead || null, service_manager || null, id]
    );

    res.json({ success: true, data: { message: '已更新' } });
  } catch (err) {
    next(err);
  }
});

// 添加工程师到项目
router.post('/projects/:id/engineers', auth(), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { engineer_id } = req.body;

    if (!engineer_id) {
      return res.status(400).json({ success: false, message: '请选择工程师' });
    }

    await pool.query(
      'INSERT INTO engineer_projects (engineer_id, project_id, impl_days) VALUES (?, ?, 0)',
      [engineer_id, id]
    );

    res.json({ success: true, data: { message: '已添加' } });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ success: false, message: '该工程师已在项目中' });
    }
    next(err);
  }
});

// 从项目移除工程师
router.delete('/projects/:id/engineers/:eid', auth(), async (req, res, next) => {
  try {
    const { id, eid } = req.params;
    await pool.query(
      'DELETE FROM engineer_projects WHERE project_id = ? AND engineer_id = ?',
      [id, eid]
    );
    res.json({ success: true, data: { message: '已移除' } });
  } catch (err) {
    next(err);
  }
});

// 删除项目（递归删除，需验证密码）
router.delete('/projects/:id', auth(), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ success: false, message: '请输入管理员密码确认删除' });
    }

    // 验证当前用户密码
    const [accounts] = await pool.query(
      'SELECT password_hash FROM accounts WHERE id = ?',
      [req.session.user.id]
    );
    if (accounts.length === 0) {
      return res.status(400).json({ success: false, message: '账户异常' });
    }
    const valid = await bcrypt.compare(password, accounts[0].password_hash);
    if (!valid) {
      return res.status(400).json({ success: false, message: '密码错误' });
    }

    // 递归删除：日报 → 工时 → 工程师关联 → 项目
    await pool.query('DELETE FROM daily_reports WHERE project_id = ?', [id]);
    await pool.query('DELETE FROM work_hours WHERE project_id = ?', [id]);
    await pool.query('DELETE FROM engineer_projects WHERE project_id = ?', [id]);
    await pool.query('DELETE FROM projects WHERE id = ?', [id]);

    res.json({ success: true, data: { message: '项目及关联数据已全部删除' } });
  } catch (err) {
    next(err);
  }
});

// 项目每日进度总结
router.get('/projects/:id/progress-summary', auth(), async (req, res, next) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.query(
      `SELECT dr.report_date, dr.progress, dr.status, dr.plan_title,
              e.name AS engineer_name, e.abbr AS engineer_abbr,
              dr.issues, dr.next_plan
       FROM daily_reports dr
       JOIN engineers e ON dr.engineer_id = e.id
       WHERE dr.project_id = ?
       ORDER BY dr.report_date DESC, e.name ASC`,
      [id]
    );

    // 按日期分组
    const grouped = {};
    for (const r of rows) {
      const dateStr = r.report_date instanceof Date
        ? r.report_date.toISOString().split('T')[0]
        : new Date(r.report_date).toISOString().split('T')[0];
      if (!grouped[dateStr]) {
        grouped[dateStr] = { date: dateStr, entries: [] };
      }
      grouped[dateStr].entries.push(r);
    }

    res.json({
      success: true,
      data: Object.values(grouped).sort((a, b) => b.date.localeCompare(a.date))
    });
  } catch (err) {
    next(err);
  }
});

// ==================== 日报管理 ====================

// 日报列表（支持筛选）
router.get('/reports', auth(), async (req, res, next) => {
  try {
    const { engineer_id, project_id, date_from, date_to } = req.query;
    const allowedIds = await getAuthorizedEngineerIds(req.session.user);
    let sql = `
      SELECT dr.*, e.name AS engineer_name, e.abbr AS engineer_abbr, p.name AS project_name
      FROM daily_reports dr
      JOIN engineers e ON dr.engineer_id = e.id
      JOIN projects p ON dr.project_id = p.id
      WHERE 1=1`;
    const params = [];

    if (allowedIds !== null) {
      sql += ` AND dr.engineer_id IN (${allowedIds.map(() => '?').join(',')})`;
      params.push(...allowedIds);
    }
    if (engineer_id) {
      sql += ' AND dr.engineer_id = ?';
      params.push(engineer_id);
    }
    if (project_id) {
      sql += ' AND dr.project_id = ?';
      params.push(project_id);
    }
    if (date_from) {
      sql += ' AND dr.report_date >= ?';
      params.push(date_from);
    }
    if (date_to) {
      sql += ' AND dr.report_date <= ?';
      params.push(date_to);
    }

    sql += ' ORDER BY dr.report_date DESC, dr.submitted_at DESC';

    const [rows] = await pool.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

// 日报详情
router.get('/reports/:id', auth(), async (req, res, next) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      `SELECT dr.*, e.name AS engineer_name, e.abbr AS engineer_abbr, p.name AS project_name
       FROM daily_reports dr
       JOIN engineers e ON dr.engineer_id = e.id
       JOIN projects p ON dr.project_id = p.id
       WHERE dr.id = ?`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: '日报不存在' });
    }

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

// 更新日报
router.put('/reports/:id', auth(), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { plan_title, tasks, progress, status, issues, next_plan } = req.body;

    if (!plan_title || !tasks || progress === undefined || !status) {
      return res.status(400).json({ success: false, message: '必填字段缺失' });
    }

    await pool.query(
      `UPDATE daily_reports SET plan_title=?, tasks=?, progress=?, status=?, issues=?, next_plan=?, submitted_at=NOW()
       WHERE id=?`,
      [plan_title, JSON.stringify(tasks), progress, status, issues || null, next_plan || null, id]
    );

    res.json({ success: true, data: { message: '已更新' } });
  } catch (err) {
    next(err);
  }
});

// ==================== 发送单条日报邮件 ====================

// 发送指定日报的邮件（仅 admin）
router.post('/reports/:id/send-email', auth('admin'), async (req, res, next) => {
  try {
    const emailService = require('../services/emailService');
    const result = await emailService.sendSingleReport(req.params.id);
    if (result.success) {
      res.json({ success: true, data: result.data });
    } else {
      res.json({ success: false, message: result.message });
    }
  } catch (err) {
    next(err);
  }
});

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

// 新建账户（支持 engineer 角色关联工程师）
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

// ==================== 权限管理（仅 admin） ====================

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

// ==================== 工时管理 ====================

// 工时列表
router.get('/hours', auth(), async (req, res, next) => {
  try {
    const { engineer_id, project_id, date_from, date_to } = req.query;
    let sql = `
      SELECT wh.*, e.name AS engineer_name, e.abbr AS engineer_abbr, p.name AS project_name
      FROM work_hours wh
      JOIN engineers e ON wh.engineer_id = e.id
      JOIN projects p ON wh.project_id = p.id
      WHERE 1=1`;
    const params = [];

    if (engineer_id) {
      sql += ' AND wh.engineer_id = ?';
      params.push(engineer_id);
    }
    if (project_id) {
      sql += ' AND wh.project_id = ?';
      params.push(project_id);
    }
    if (date_from) {
      sql += ' AND wh.report_date >= ?';
      params.push(date_from);
    }
    if (date_to) {
      sql += ' AND wh.report_date <= ?';
      params.push(date_to);
    }

    sql += ' ORDER BY wh.report_date DESC, e.name ASC';

    const [rows] = await pool.query(sql, params);

    // 计算总计
    const total = rows.reduce((sum, r) => sum + parseFloat(r.hours || 0), 0);

    res.json({ success: true, data: { list: rows, total: Math.round(total * 10) / 10 } });
  } catch (err) {
    next(err);
  }
});

// ==================== 发送日报邮件 ====================

// 发送今日日报汇总邮件（仅 admin）
router.post('/send-email', auth('admin'), async (req, res, next) => {
  try {
    const emailService = require('../services/emailService');
    const result = await emailService.sendDailyReport();
    if (result.success) {
      res.json({ success: true, data: result.data });
    } else {
      res.json({ success: false, message: result.message });
    }
  } catch (err) {
    next(err);
  }
});

module.exports = router;
