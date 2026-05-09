const nodemailer = require('nodemailer');
const pool = require('../database');
const buildDailyEmailHtml = require('../templates/dailyEmailTemplate').buildDailyEmailHtml;
const buildSingleReportEmailHtml = require('../templates/dailyEmailTemplate').buildSingleReportEmailHtml;

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.MAIL_HOST;
  if (!host) return null;

  transporter = nodemailer.createTransport({
    host,
    port: parseInt(process.env.MAIL_PORT || '465', 10),
    secure: process.env.MAIL_SECURE === 'true',
    auth: {
      user: process.env.MAIL_USER || '',
      pass: process.env.MAIL_PASS || '',
    },
  });
  return transporter;
}

/**
 * 发送今日日报汇总邮件
 * @returns {Promise<{success: boolean, message: string, data?: object}>}
 */
async function sendDailyReport() {
  const transporter = getTransporter();
  if (!transporter) {
    return { success: false, message: '邮件服务未配置（MAIL_HOST 为空）' };
  }

  const today = new Date().toISOString().split('T')[0];

  // 1. 汇总统计
  const [totalRows] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM engineers WHERE status = 'active'`
  );
  const total = totalRows[0].cnt;

  const [submittedRows] = await pool.query(
    `SELECT COUNT(DISTINCT engineer_id) AS cnt FROM daily_reports WHERE report_date = ?`,
    [today]
  );
  const submitted = submittedRows[0].cnt;
  const notSubmitted = total - submitted;

  // 2. 在外实施人数（今日有 tomorrow_plan 且去向为项目现场的）
  const [fieldRows] = await pool.query(
    `SELECT COUNT(DISTINCT tp.engineer_id) AS cnt
     FROM tomorrow_plans tp
     WHERE tp.report_date = ? AND tp.destination IN ('existing_project', 'new_project')`,
    [today]
  );
  const inField = fieldRows[0].cnt;

  // 3. 详细日报（含工程师姓名、项目名）
  const [reports] = await pool.query(
    `SELECT e.name AS engineer_name, e.abbr AS engineer_abbr,
            p.name AS project_name,
            dr.plan_title, dr.tasks, dr.progress, dr.status,
            dr.issues, dr.next_plan
     FROM daily_reports dr
     JOIN engineers e ON dr.engineer_id = e.id
     JOIN projects p ON dr.project_id = p.id
     WHERE dr.report_date = ?
     ORDER BY e.name`,
    [today]
  );

  // 解析 tasks JSON
  const parsedReports = reports.map(r => ({
    ...r,
    tasks: typeof r.tasks === 'string' ? JSON.parse(r.tasks) : (r.tasks || []),
  }));

  // 4. 未提交名单
  const [notSubmittedRows] = await pool.query(
    `SELECT name, abbr FROM engineers
     WHERE status = 'active'
     AND id NOT IN (
       SELECT DISTINCT engineer_id FROM daily_reports WHERE report_date = ?
     )
     ORDER BY name`,
    [today]
  );

  // 5. 生成 HTML
  const dateLabel = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'
  });

  const html = buildDailyEmailHtml({
    dateLabel,
    total,
    submitted,
    notSubmitted,
    inField,
    reports: parsedReports,
    notSubmittedList: notSubmittedRows,
  });

  // 6. 发送
  const toList = (process.env.MAIL_TO || '').split(',').map(s => s.trim()).filter(Boolean);
  if (toList.length === 0) {
    return { success: false, message: '未配置收件人（MAIL_TO 为空）' };
  }

  try {
    const info = await transporter.sendMail({
      from: process.env.MAIL_FROM || process.env.MAIL_USER,
      to: toList.join(', '),
      subject: `日报汇总 ${today}`,
      html,
    });

    return {
      success: true,
      message: '邮件发送成功',
      data: {
        messageId: info.messageId,
        accepted: info.accepted,
        stats: { total, submitted, notSubmitted, inField },
      },
    };
  } catch (err) {
    console.error('[邮件发送失败]', err.message);
    return { success: false, message: `邮件发送失败: ${err.message}` };
  }
}

/**
 * 发送单条日报邮件
 * @param {number} reportId - 日报 ID
 * @returns {Promise<{success: boolean, message: string, data?: object}>}
 */
async function sendSingleReport(reportId) {
  const transporter = getTransporter();
  if (!transporter) {
    return { success: false, message: '邮件服务未配置（MAIL_HOST 为空）' };
  }

  // 查询日报详情
  const [rows] = await pool.query(
    `SELECT dr.*, e.name AS engineer_name, e.abbr AS engineer_abbr,
            p.name AS project_name
     FROM daily_reports dr
     JOIN engineers e ON dr.engineer_id = e.id
     JOIN projects p ON dr.project_id = p.id
     WHERE dr.id = ?`,
    [reportId]
  );

  if (rows.length === 0) {
    return { success: false, message: '日报不存在' };
  }

  const report = {
    ...rows[0],
    tasks: typeof rows[0].tasks === 'string' ? JSON.parse(rows[0].tasks) : (rows[0].tasks || []),
    report_date: rows[0].report_date ? rows[0].report_date.toISOString().split('T')[0] : '',
  };

  const html = buildSingleReportEmailHtml(report);

  const toList = (process.env.MAIL_TO || '').split(',').map(s => s.trim()).filter(Boolean);
  if (toList.length === 0) {
    return { success: false, message: '未配置收件人（MAIL_TO 为空）' };
  }

  try {
    const info = await transporter.sendMail({
      from: process.env.MAIL_FROM || process.env.MAIL_USER,
      to: toList.join(', '),
      subject: `日报 - ${report.engineer_name} ${report.report_date}`,
      html,
    });

    return {
      success: true,
      message: '邮件发送成功',
      data: {
        messageId: info.messageId,
        accepted: info.accepted,
        report: { id: reportId, engineer: report.engineer_name, date: report.report_date },
      },
    };
  } catch (err) {
    console.error('[单条邮件发送失败]', err.message);
    return { success: false, message: `邮件发送失败: ${err.message}` };
  }
}

module.exports = { sendDailyReport, sendSingleReport };
