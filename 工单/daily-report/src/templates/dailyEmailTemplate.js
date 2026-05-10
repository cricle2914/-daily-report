/**
 * 日报汇总 HTML 邮件模板
 * 使用 table 布局 + 内联 CSS 保证邮件客户端兼容性
 */

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function statusText(status) {
  const map = { complete: '已完成', ongoing: '进行中', blocked: '已受阻' };
  return map[status] || status;
}

function statusColor(status) {
  const map = { complete: '#27ae60', ongoing: '#f39c12', blocked: '#e74c3c' };
  return map[status] || '#888';
}

function renderStatCard(label, value, color) {
  return `
    <td align="center" style="padding:8px; width:25%;">
      <table cellpadding="0" cellspacing="0" border="0" style="width:100%;">
        <tr>
          <td style="background:#ffffff; border-radius:8px; border:1px solid #e8ecf1; padding:14px 8px; text-align:center;">
            <div style="font-size:28px; font-weight:700; color:${color}; line-height:1.2;">${value}</div>
            <div style="font-size:12px; color:#8899aa; margin-top:2px;">${label}</div>
          </td>
        </tr>
      </table>
    </td>`;
}

function renderReportCard(report) {
  const tasks = Array.isArray(report.tasks)
    ? report.tasks
    : (typeof report.tasks === 'string' ? JSON.parse(report.tasks) : []);

  const statusClr = statusColor(report.status);
  const statusTxt = statusText(report.status);

  const taskItems = tasks.length > 0
    ? tasks.map(t => `<tr><td style="padding:2px 0 2px 16px; font-size:13px; color:#333; position:relative;">
        <span style="position:absolute; left:0;">•</span>
        ${escapeHtml(t.content || t)}</td></tr>`).join('')
    : '<tr><td style="padding:2px 0 2px 16px; font-size:13px; color:#999;">（无）</td></tr>';

  return `
    <tr>
      <td style="padding:12px 20px 0;">
        <table cellpadding="0" cellspacing="0" border="0" style="width:100%; border:1px solid #e8ecf1; border-radius:8px; background:#fafbfc;">
          <tr>
            <td style="padding:14px 16px; border-bottom:1px solid #e8ecf1;">
              <table cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="font-size:15px; font-weight:700; color:#1a1a2e;">
                    ${escapeHtml(report.engineer_name)}
                    <span style="font-size:12px; font-weight:400; color:#8899aa; margin-left:6px;">(${escapeHtml(report.engineer_abbr)})</span>
                  </td>
                  <td align="right">
                    <span style="display:inline-block; padding:2px 10px; border-radius:4px; font-size:12px; font-weight:600; color:${statusClr}; border:1px solid ${statusClr};">${statusTxt}</span>
                  </td>
                </tr>
              </table>
              <div style="font-size:13px; color:#556677; margin-top:4px;">
                ${escapeHtml(report.project_name)}
                <span style="margin:0 6px; color:#ccc;">|</span>
                进度 ${report.progress}%
                <span style="margin:0 6px; color:#ccc;">|</span>
                ${escapeHtml(report.plan_title || '无标题')}
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:10px 16px;">
              <div style="font-size:12px; font-weight:600; color:#8899aa; text-transform:uppercase; letter-spacing:1px; margin-bottom:4px;">今日任务</div>
              <table cellpadding="0" cellspacing="0" border="0">${taskItems}</table>
            </td>
          </tr>
          ${report.issues ? `
          <tr>
            <td style="padding:4px 16px 10px;">
              <div style="font-size:12px; font-weight:600; color:#8899aa; text-transform:uppercase; letter-spacing:1px; margin-bottom:2px;">存在问题</div>
              <div style="font-size:13px; color:#333;">${escapeHtml(report.issues)}</div>
            </td>
          </tr>` : ''}
          ${report.next_plan ? `
          <tr>
            <td style="padding:4px 16px 14px;">
              <div style="font-size:12px; font-weight:600; color:#8899aa; text-transform:uppercase; letter-spacing:1px; margin-bottom:2px;">明日计划</div>
              <div style="font-size:13px; color:#333;">${escapeHtml(report.next_plan)}</div>
            </td>
          </tr>` : ''}
        </table>
      </td>
    </tr>`;
}

function buildDailyEmailHtml(data) {
  const { dateLabel, total, submitted, notSubmitted, inField, reports, notSubmittedList } = data;
  const dateStr = dateLabel || new Date().toLocaleDateString('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'
  });

  const reportCards = (reports && reports.length > 0)
    ? reports.map(r => renderReportCard(r)).join('')
    : '<tr><td style="padding:20px; text-align:center; font-size:14px; color:#999;">暂无已提交的日报</td></tr>';

  const unsubmittedHtml = (notSubmittedList && notSubmittedList.length > 0)
    ? `<tr>
        <td style="padding:12px 20px 0;">
          <table cellpadding="0" cellspacing="0" border="0" style="width:100%; border:1px solid #fde2e2; border-radius:8px; background:#fef6f6;">
            <tr>
              <td style="padding:14px 16px;">
                <div style="font-size:14px; font-weight:700; color:#e74c3c; margin-bottom:6px;">⚠ 未提交日报</div>
                <div style="font-size:13px; color:#555;">
                  以下 ${notSubmittedList.length} 位工程师尚未提交今日日报：
                  <span style="font-weight:600;">${notSubmittedList.map(n => escapeHtml(n.name)).join('、')}</span>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>`
    : '<tr><td style="padding:12px 20px 0;"><table cellpadding="0" cellspacing="0" border="0" style="width:100%; border:1px solid #d5f5e3; border-radius:8px; background:#eafaf1;"><tr><td style="padding:14px 16px; font-size:13px; color:#27ae60; font-weight:600;">✓ 所有工程师均已提交今日日报</td></tr></table></td></tr>';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0; padding:0; background:#f0f2f5; font-family:'Microsoft YaHei','PingFang SC','Helvetica Neue',Arial,sans-serif;">
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f0f2f5;">
    <tr><td align="center" style="padding:30px 10px 20px;">
      <table cellpadding="0" cellspacing="0" border="0" style="max-width:640px; width:100%;">
        <!-- 标题栏 -->
        <tr>
          <td style="background:linear-gradient(135deg,#1a1a2e,#16213e); border-radius:10px 10px 0 0; padding:28px 24px 22px;">
            <table cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td><div style="font-size:22px; font-weight:800; color:#ffffff; letter-spacing:1px;">日报汇总</div></td>
                <td align="right"><div style="font-size:13px; color:rgba(255,255,255,.6);">${escapeHtml(dateStr)}</div></td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- 主体 -->
        <tr>
          <td style="background:#ffffff; padding:20px 0;">
            <!-- 汇总统计 -->
            <table cellpadding="0" cellspacing="0" border="0" style="width:100%; padding:0 16px;">
              <tr>
                ${renderStatCard('总人数', total, '#546de5')}
                ${renderStatCard('已提交', submitted, '#27ae60')}
                ${renderStatCard('未提交', notSubmitted, notSubmitted > 0 ? '#e74c3c' : '#27ae60')}
                ${renderStatCard('在外实施', inField, '#f39c12')}
              </tr>
            </table>
            <div style="height:1px; background:#e8ecf1; margin:16px 16px 0;"></div>
            <!-- 详细日报 -->
            <table cellpadding="0" cellspacing="0" border="0" style="width:100%;">
              ${reportCards}
            </table>
            <!-- 未提交提醒 -->
            <table cellpadding="0" cellspacing="0" border="0" style="width:100%;">
              ${unsubmittedHtml}
            </table>
          </td>
        </tr>
        <!-- 底部 -->
        <tr>
          <td style="background:#f7f8fa; border-radius:0 0 10px 10px; border-top:1px solid #e8ecf1; padding:16px 24px; text-align:center;">
            <div style="font-size:11px; color:#aab5c0;">本邮件由日报系统自动发送 · 仅供内部查阅</div>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * 单条日报邮件模板 — 项目实施日报格式（含历史记录）
 * data: { reports: [...], project: { customer, project_name, ... } }
 */
function buildSingleReportEmailHtml(data) {
  const { reports, project } = data;
  const latest = reports[0] || {};

  const latestDate = latest.report_date || '';
  const latestProgress = latest.progress || 0;
  const techLeadName = project.tech_lead || '/';
  const engineerInfo = `${project.engineer_name}${project.engineer_phone ? '/' + project.engineer_phone : ''}`;

  // 生成每日工作计划及完成情况表格行
  const historyRows = reports.map(r => {
    const tasks = Array.isArray(r.tasks) ? r.tasks : (typeof r.tasks === 'string' ? JSON.parse(r.tasks) : []);
    const workContent = tasks.map(t => (t.content || t)).join('\n');
    const statusTxt = statusText(r.status);
    let completionText = `完成情况：${statusTxt === '已完成' ? '完成' : statusTxt === '进行中' ? '部分完成' : '未完成'}`;
    if (r.issues) completionText += `\n遗留问题：${r.issues}`;
    if (r.next_plan) completionText += `\n下一步计划：${r.next_plan}`;

    return `<tr>
      <td style="padding:5px 8px;text-align:center;vertical-align:top;white-space:nowrap;">${escapeHtml(r.report_date || '')}</td>
      <td style="padding:5px 8px;vertical-align:top;white-space:pre-wrap;">${escapeHtml(r.plan_title || '')}</td>
      <td style="padding:5px 8px;vertical-align:top;white-space:pre-wrap;">${escapeHtml(workContent)}</td>
      <td style="padding:5px 8px;vertical-align:top;white-space:pre-wrap;">${escapeHtml(completionText)}</td>
      <td style="padding:5px 8px;text-align:center;vertical-align:top;">${(r.progress / 100).toFixed(2)}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Microsoft YaHei','PingFang SC',Arial,sans-serif;font-size:12px;">
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f5f5f5;">
<tr><td align="center" style="padding:20px 10px;">
<table cellpadding="0" cellspacing="0" border="0" style="max-width:800px;width:100%;background:#fff;border:1px solid #d0d0d0;">

  <!-- ====== 标题行 ====== -->
  <tr>
    <td style="padding:16px 20px;background:#4472c4;color:#fff;">
      <table cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td style="font-size:16px;font-weight:700;">${escapeHtml(project.customer || project.project_name)}${project.order_type ? `[${escapeHtml(project.order_type)}]` : ''}${project.order_no ? `(原厂工单-${project.order_no})` : ''}</td>
          <td align="right" style="font-size:13px;">报告日期：${latestDate}</td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- ====== 项目信息头 ====== -->
  <tr>
    <td style="padding:12px 20px 0;">
      <table cellpadding="4" cellspacing="0" border="1" style="width:100%;border-collapse:collapse;border-color:#d0d0d0;font-size:12px;">
        <tr>
          <td style="background:#f2f2f2;font-weight:600;width:15%;padding:4px 8px;">客户名称</td>
          <td style="width:35%;padding:4px 8px;">${escapeHtml(project.customer || '')}</td>
          <td style="background:#f2f2f2;font-weight:600;width:15%;padding:4px 8px;">项目整体进度</td>
          <td style="width:35%;padding:4px 8px;">${(latestProgress / 100).toFixed(2)}</td>
        </tr>
        <tr>
          <td style="background:#f2f2f2;font-weight:600;padding:4px 8px;">客户决策人</td>
          <td style="padding:4px 8px;">/</td>
          <td style="background:#f2f2f2;font-weight:600;padding:4px 8px;">客户联系人</td>
          <td style="padding:4px 8px;">${escapeHtml(project.contact_name || '/')}${project.contact_phone ? '/' + project.contact_phone : ''}</td>
        </tr>
        <tr>
          <td style="background:#f2f2f2;font-weight:600;padding:4px 8px;">厂商名称</td>
          <td style="padding:4px 8px;">${escapeHtml(project.manufacturer || '')}</td>
          <td style="background:#f2f2f2;font-weight:600;padding:4px 8px;">技术经理</td>
          <td style="padding:4px 8px;">${escapeHtml(techLeadName)}</td>
        </tr>
        <tr>
          <td style="background:#f2f2f2;font-weight:600;padding:4px 8px;">实施技术负责人</td>
          <td style="padding:4px 8px;">${escapeHtml(techLeadName)}</td>
          <td style="background:#f2f2f2;font-weight:600;padding:4px 8px;">实施工程师</td>
          <td style="padding:4px 8px;">${escapeHtml(engineerInfo)}</td>
        </tr>
        <tr>
          <td style="background:#f2f2f2;font-weight:600;padding:4px 8px;">服务经理</td>
          <td style="padding:4px 8px;">${escapeHtml(project.service_manager || '/')}</td>
          <td style="background:#f2f2f2;font-weight:600;padding:4px 8px;">代理商</td>
          <td style="padding:4px 8px;">${escapeHtml(project.agent || '/')}</td>
        </tr>
        <tr>
          <td style="background:#f2f2f2;font-weight:600;padding:4px 8px;">交付模式</td>
          <td colspan="3" style="padding:4px 8px;">任务工单</td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- ====== 项目基本信息 ====== -->
  <tr>
    <td style="padding:16px 20px 0;">
      <div style="font-size:13px;font-weight:700;color:#4472c4;margin-bottom:6px;">项目基本信息</div>
      <table cellpadding="4" cellspacing="0" border="1" style="width:100%;border-collapse:collapse;border-color:#d0d0d0;font-size:12px;">
        <tr>
          <td style="background:#f2f2f2;font-weight:600;width:12%;padding:4px 8px;">安装地址</td>
          <td style="width:23%;padding:4px 8px;">${escapeHtml(project.install_address || '')}</td>
          <td style="background:#f2f2f2;font-weight:600;width:12%;padding:4px 8px;">合同号</td>
          <td style="width:23%;padding:4px 8px;">${escapeHtml(project.order_no || '/')}</td>
          <td style="background:#f2f2f2;font-weight:600;width:10%;padding:4px 8px;">版本</td>
          <td style="width:20%;padding:4px 8px;">${escapeHtml(project.product_version || '/')}</td>
        </tr>
        <tr>
          <td style="background:#f2f2f2;font-weight:600;padding:4px 8px;">设备型号</td>
          <td style="padding:4px 8px;">/</td>
          <td style="background:#f2f2f2;font-weight:600;padding:4px 8px;">序列号</td>
          <td style="padding:4px 8px;">/</td>
          <td style="background:#f2f2f2;font-weight:600;padding:4px 8px;">进度</td>
          <td style="padding:4px 8px;">${(latestProgress / 100).toFixed(2)}</td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- ====== 项目整体计划 ====== -->
  <tr>
    <td style="padding:12px 20px 0;">
      <div style="font-size:13px;font-weight:700;color:#4472c4;margin-bottom:6px;">项目整体计划</div>
      <table cellpadding="4" cellspacing="0" border="1" style="width:100%;border-collapse:collapse;border-color:#d0d0d0;font-size:12px;">
        <tr>
          <td style="background:#f2f2f2;font-weight:600;width:12%;padding:4px 8px;">项目需求说明</td>
          <td style="width:23%;padding:4px 8px;">${escapeHtml(latest.plan_title || '技术支持')}</td>
          <td style="background:#f2f2f2;font-weight:600;width:12%;padding:4px 8px;">设备用途</td>
          <td style="width:23%;padding:4px 8px;">${escapeHtml(project.project_name || '')}</td>
          <td style="background:#f2f2f2;font-weight:600;width:10%;padding:4px 8px;">实施天数</td>
          <td style="width:20%;padding:4px 8px;">第 ${reports.length} 天</td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- ====== 每日工作计划及完成情况（全部历史记录） ====== -->
  <tr>
    <td style="padding:16px 20px 0;">
      <div style="font-size:13px;font-weight:700;color:#4472c4;margin-bottom:6px;">每日工作计划及完成情况</div>
      <table cellpadding="5" cellspacing="0" border="1" style="width:100%;border-collapse:collapse;border-color:#d0d0d0;font-size:12px;">
        <tr style="background:#4472c4;color:#fff;">
          <th style="padding:5px 8px;text-align:center;width:10%;font-weight:600;">日期</th>
          <th style="padding:5px 8px;text-align:center;width:22%;font-weight:600;">工作计划</th>
          <th style="padding:5px 8px;text-align:center;width:30%;font-weight:600;">工作内容</th>
          <th style="padding:5px 8px;text-align:center;font-weight:600;">计划完成情况及遗留问题</th>
          <th style="padding:5px 8px;text-align:center;width:10%;font-weight:600;">完成比例</th>
        </tr>
        ${historyRows}
      </table>
    </td>
  </tr>

  <!-- ====== 底部 ====== -->
  <tr>
    <td style="padding:14px 20px;text-align:center;border-top:1px solid #d0d0d0;font-size:11px;color:#888;margin-top:16px;">
      本邮件由日报系统自动生成 · 仅供内部查阅
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

module.exports = { buildDailyEmailHtml, buildSingleReportEmailHtml };
