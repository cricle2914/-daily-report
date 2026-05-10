// ====== 全局状态 ======
let state = {
  engineer: null,
  project: null,
  projects: [],
  destination: null,
  tomorrowDate: '',
  lastProgress: 0,
  customReportDate: null,
  lastReportId: null
};

// ====== 工具函数 ======

async function request(url, options = {}) {
  const config = {
    headers: { 'Content-Type': 'application/json' },
    ...options
  };
  if (config.body && typeof config.body === 'object') {
    config.body = JSON.stringify(config.body);
  }
  try {
    const res = await fetch(url, config);
    const data = await res.json();
    if (!data.success) {
      showToast(data.error || '请求失败');
      return null;
    }
    return data.data;
  } catch (err) {
    showToast('网络错误: ' + err.message);
    return null;
  }
}

function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById(pageId);
  if (page) page.classList.add('active');

  // 更新进度条（5 步）
  const steps = document.querySelectorAll('.top-bar-prog-step');
  steps.forEach(s => s.classList.remove('active'));
  if (pageId === 'page-1') {
    steps[0]?.classList.add('active');
  } else if (pageId === 'page-2') {
    steps[0]?.classList.add('active');
    steps[1]?.classList.add('active');
  } else if (pageId === 'page-3') {
    steps[0]?.classList.add('active');
    steps[1]?.classList.add('active');
    steps[2]?.classList.add('active');
  } else if (pageId === 'page-4') {
    steps[0]?.classList.add('active');
    steps[1]?.classList.add('active');
    steps[2]?.classList.add('active');
    steps[3]?.classList.add('active');
  } else if (pageId === 'page-5') {
    steps.forEach(s => s.classList.add('active'));
  }
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), 2000);
}

// ====== 打字动画 ======
let _stopTyping = null;

function startTypingAnimation() {
  const l1 = document.getElementById('typingLine1');
  const l2 = document.getElementById('typingLine2');
  if (!l1 || !l2) return;

  // 第一行常驻
  l1.textContent = '今天辛苦啦，';
  // 第二行循环打字
  const line2 = '让我帮你提交日报吧。';
  const bs = 4, be = 8;
  let stopped = false, timer = null;

  function build2(len) {
    if (len <= 0) return '';
    let h = '', ib = false;
    for (let i = 0; i < len && i < line2.length; i++) {
      if (i === bs) { h += '<b>'; ib = true; }
      h += line2[i];
    }
    if (ib && len < be) h += '</b>';
    if (len >= be) h += '</b>';
    return h;
  }

  function t2(idx, cb) {
    if (stopped) return;
    l2.innerHTML = build2(idx);
    if (idx < line2.length) timer = setTimeout(() => t2(idx + 1, cb), 65);
    else timer = setTimeout(cb, 2000);
  }

  function d2(idx, cb) {
    if (stopped) return;
    l2.innerHTML = build2(idx);
    if (idx > bs) timer = setTimeout(() => d2(idx - 1, cb), 40);
    else timer = setTimeout(cb, 500);
  }

  function loop() {
    if (stopped) return;
    t2(0, () => {
      d2(line2.length, () => {
        t2(bs, () => {
          timer = setTimeout(loop, 2000);
        });
      });
    });
  }

  timer = setTimeout(loop, 1000);
  _stopTyping = () => { stopped = true; if (timer) clearTimeout(timer); };
}

// 工程师选中后的打字：两行，姓名放大
function typeHelloWithName(name) {
  const l1 = document.getElementById('typingLine1');
  const l2 = document.getElementById('typingLine2');
  if (!l1 || !l2) return;
  const prefix = '今天辛苦啦！';
  const text1 = prefix + name;
  const text2 = '请选择项目。';
  l1.textContent = '';
  l2.textContent = '';
  let phase = 0, idx1 = 0, idx2 = 0;
  function type() {
    if (phase === 0) {
      if (idx1 < text1.length) {
        l1.textContent = text1.substring(0, idx1 + 1);
        idx1++;
        setTimeout(type, 50);
      } else {
        // 替换为带样式的 HTML（姓名放大）
        l1.innerHTML = `今天辛苦啦！<span style="font-size:24px;font-weight:900;color:#fff">${name}</span>`;
        phase = 1;
        setTimeout(type, 400);
      }
    } else if (phase === 1) {
      if (idx2 < text2.length) {
        l2.textContent = text2.substring(0, idx2 + 1);
        idx2++;
        setTimeout(type, 50);
      } else {
        phase = 2;
      }
    }
  }
  setTimeout(type, 300);
}

document.addEventListener('DOMContentLoaded', startTypingAnimation);

// ====== Page 1: 搜索工程师 ======

const searchInput = document.getElementById('searchInput');
let searchTimer = null;

searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  const val = searchInput.value.trim();
  if (!val) {
    document.getElementById('searchDropdown').classList.remove('show');
    return;
  }
  // 输入的姓名与已选工程师不同时，重置选择
  if (state.engineer && searchInput.value !== state.engineer.name) {
    resetEngineerSelection();
  }
  searchTimer = setTimeout(() => searchEngineers(val), 300);
});

// 搜索框聚焦：展开动画 + 磨玻璃背景
searchInput.addEventListener('focus', function() {
  const page1 = document.getElementById('page-1');
  page1.classList.add('search-expanded');
  // 移动端：键盘弹出时 visualViewport 缩小，用 JS 确保搜索框在可视区
  if (window.visualViewport) {
    const adjustPos = () => {
      const wrap = document.querySelector('#page-1 .search-wrap');
      if (!wrap) return;
      const vh = window.visualViewport.height;
      const wrapRect = wrap.getBoundingClientRect();
      if (wrapRect.bottom > vh || wrapRect.top < 0) {
        wrap.style.top = Math.max(20, (vh - wrapRect.height) / 2) + 'px';
      }
    };
    window.visualViewport.addEventListener('resize', adjustPos);
    // 聚焦 400ms 后再检查一次（键盘完全弹出后）
    setTimeout(adjustPos, 400);
  }
});

// 搜索框失焦：延迟收起，让点击事件先触发
searchInput.addEventListener('blur', function() {
  setTimeout(() => {
    document.getElementById('page-1').classList.remove('search-expanded');
  }, 200);
});

// 点击背景遮罩关闭搜索展开
document.getElementById('searchBackdrop').addEventListener('click', function() {
  document.getElementById('page-1').classList.remove('search-expanded');
  searchInput.blur();
});

async function searchEngineers(name) {
  const data = await request(`/api/engineers/search?name=${encodeURIComponent(name)}`);
  if (!data) return;
  const dropdown = document.getElementById('searchDropdown');
  dropdown.innerHTML = '';
  if (data.length === 0) {
    dropdown.classList.remove('show');
    return;
  }
  data.forEach(eng => {
    const item = document.createElement('div');
    item.className = 'dropdown-item';
    item.innerHTML = `<div class="dropdown-avatar">${eng.abbr}</div>
      <div>
        <div class="dropdown-name">${eng.name}</div>
        <div class="dropdown-sub">${eng.project_count} 个项目</div>
      </div>`;
    item.onclick = () => selectEngineer(eng);
    dropdown.appendChild(item);
  });
  dropdown.classList.add('show');
}

async function selectEngineer(eng) {
  state.engineer = eng;
  state.project = null;
  searchInput.value = eng.name;
  document.getElementById('searchDropdown').classList.remove('show');
  document.getElementById('avatar').textContent = eng.abbr;
  document.getElementById('engineerName').textContent = eng.name;

  // 停止旧动画，修改问候语
  if (_stopTyping) _stopTyping();
  document.querySelector('.page1-greeting').innerHTML = '<span style="font-size:84px;font-weight:900;letter-spacing:-.04em">Hello!</span>';
  typeHelloWithName(eng.name);

  // 添加 has-selection，显示项目列表
  document.getElementById('page-1').classList.add('has-selection');
  document.getElementById('page-1').classList.remove('search-expanded');

  document.querySelectorAll('.dropdown-item').forEach(el => el.style.display = 'none');

  await loadProjects(eng.id);

  // 跳转到 page-2 选择项目
  showPage('page-2');
}

function resetEngineerSelection(navigateBack = true) {
  if (!state.engineer) return;
  state.engineer = null;
  state.project = null;
  state.customReportDate = null;
  document.getElementById('nextStepArea').classList.add('hidden');
  document.getElementById('projectList').innerHTML = '';
  document.getElementById('page-1').classList.remove('has-selection');

  // 恢复初始问候语 + 打字动画
  if (_stopTyping) _stopTyping();
  const greeting = document.querySelector('.page1-greeting');
  greeting.innerHTML = '<span class="greeting-good">Good</span><br><span class="greeting-day">day!</span>';
  const l1 = document.getElementById('typingLine1');
  const l2 = document.getElementById('typingLine2');
  if (l1) l1.textContent = '';
  if (l2) l2.textContent = '';
  startTypingAnimation();

  searchInput.value = '';
  searchInput2.value = '';
  document.getElementById('searchDropdown2').classList.remove('show');
  document.querySelectorAll('.dropdown-item').forEach(el => el.style.display = '');
  if (navigateBack) showPage('page-1');
}

async function loadProjects(engineerId) {
  const data = await request(`/api/engineers/${engineerId}/projects`);
  if (!data) return;
  state.projects = data;
  renderProjectList(data);
}

function renderProjectList(projects) {
  const container = document.getElementById('projectList');
  container.innerHTML = '';

  if (projects.length === 0) {
    container.innerHTML = '<div style="text-align:center;color:#999;padding:20px">暂无项目</div>';
    return;
  }

  // 按最后填写时间降序排序
  projects.sort((a, b) => {
    if (!a.last_report_date) return 1;
    if (!b.last_report_date) return -1;
    return new Date(b.last_report_date) - new Date(a.last_report_date);
  });
  state.projects = projects;

  // 新建项目按钮 — 第一位
  const newBtn = document.createElement('div');
  newBtn.className = 'new-project-btn';
  newBtn.textContent = '＋ 新建项目';
  newBtn.onclick = openDrawer;
  container.appendChild(newBtn);

  // 构建所有卡片（默认只展示前5个，多余的折叠）
  projects.forEach((p, i) => {
    const card = buildProjectCard(p);
    if (i >= 5) {
      card.classList.add('project-card-folded');
      card.classList.add('hidden');
    }
    container.appendChild(card);
  });

  // 更新展开全部按钮状态
  updateExpandAllBtn();
}

function updateExpandAllBtn() {
  const btn = document.getElementById('expandAllBtn');
  const folded = document.querySelectorAll('.project-card-folded');
  if (folded.length === 0) {
    btn.style.display = 'none';
    return;
  }
  btn.style.display = '';
  const allVisible = Array.from(folded).every(c => !c.classList.contains('hidden'));
  btn.textContent = allVisible ? '收起部分 ▴' : '展开全部 ▾';
}

function buildProjectCard(p) {
  const card = document.createElement('div');
  card.className = 'project-card';
  card.dataset.projectId = p.id;
  card.innerHTML = `
    <div class="project-card-header">
      <div class="project-info">
        <div class="project-radio"></div>
        <div style="flex:1;min-width:0">
          <div class="project-name">${p.name}</div>
          <div class="project-meta">工单：${p.order_no || '-'} · 实施第 ${p.impl_days} 天</div>
        </div>
      </div>
      <button class="expand-btn">▶</button>
    </div>
    <div class="project-detail">
      <div class="project-detail-row"><span class="label">客户</span>${p.customer || '-'}</div>
      <div class="project-detail-row"><span class="label">工单</span>${p.order_no || '-'}</div>
      <div class="project-detail-row"><span class="label">联系人</span>${p.contact_name || '-'} ${p.contact_phone || ''}</div>
      <div class="project-detail-row"><span class="label">版本</span>${p.product_version || '-'}</div>
      <div class="project-detail-row"><span class="label">地址</span>${p.install_address || '-'}</div>
      <div class="project-detail-row"><span class="label">厂商</span>${p.manufacturer || '-'}</div>
      <div class="project-detail-row"><span class="label">代理商</span>${p.agent || '-'}</div>
      <div class="project-detail-row"><span class="label">技术负责人</span>${p.tech_lead || '-'}</div>
      <div class="project-detail-row"><span class="label">服务经理</span>${p.service_manager || '-'}</div>
      <div class="project-detail-row" style="margin-top:6px;padding-top:6px;border-top:1px solid var(--border)">
        <span class="label">实施天数</span>${p.impl_days} 天
      </div>
    </div>`;
  card.onclick = (e) => {
    const btn = e.target.closest('.expand-btn');
    if (btn) {
      const detail = card.querySelector('.project-detail');
      const isOpen = detail.classList.toggle('open');
      btn.textContent = isOpen ? '▼' : '▶';
      return;
    }
    document.querySelectorAll('.project-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    state.project = { id: p.id, name: p.name, impl_days: p.impl_days, detail: p };
    state.customReportDate = null;
    document.getElementById('nextStepArea').classList.remove('hidden');
  };
  return card;
}

// ====== Page 2: 搜索工程师（底部） ======

const searchInput2 = document.getElementById('searchInput2');
let searchTimer2 = null;

searchInput2.addEventListener('input', () => {
  clearTimeout(searchTimer2);
  const val = searchInput2.value.trim();
  if (!val) {
    document.getElementById('searchDropdown2').classList.remove('show');
    return;
  }
  if (state.engineer && searchInput2.value !== state.engineer.name) {
    resetEngineerSelection(false);
  }
  searchTimer2 = setTimeout(() => searchEngineers2(val), 300);
});

searchInput2.addEventListener('focus', function() {
  document.getElementById('page-2').classList.add('search-expanded');
  if (window.visualViewport) {
    const adjustPos = () => {
      const wrap = document.querySelector('#page-2 .search-wrap');
      if (!wrap) return;
      const vh = window.visualViewport.height;
      const wrapRect = wrap.getBoundingClientRect();
      if (wrapRect.bottom > vh || wrapRect.top < 0) {
        wrap.style.top = Math.max(20, (vh - wrapRect.height) / 2) + 'px';
      }
    };
    window.visualViewport.addEventListener('resize', adjustPos);
    setTimeout(adjustPos, 400);
  }
});

searchInput2.addEventListener('blur', function() {
  setTimeout(() => {
    document.getElementById('page-2').classList.remove('search-expanded');
  }, 200);
});

document.getElementById('searchBackdrop2').addEventListener('click', function() {
  document.getElementById('page-2').classList.remove('search-expanded');
  searchInput2.blur();
});

async function searchEngineers2(name) {
  const data = await request(`/api/engineers/search?name=${encodeURIComponent(name)}`);
  if (!data) return;
  const dropdown = document.getElementById('searchDropdown2');
  dropdown.innerHTML = '';
  if (data.length === 0) {
    dropdown.classList.remove('show');
    return;
  }
  data.forEach(eng => {
    const item = document.createElement('div');
    item.className = 'dropdown-item';
    item.innerHTML = `<div class="dropdown-avatar">${eng.abbr}</div>
      <div>
        <div class="dropdown-name">${eng.name}</div>
        <div class="dropdown-sub">${eng.project_count} 个项目</div>
      </div>`;
    item.onclick = () => selectEngineerOnPage2(eng);
    dropdown.appendChild(item);
  });
  dropdown.classList.add('show');
}

async function selectEngineerOnPage2(eng) {
  state.engineer = eng;
  state.project = null;
  searchInput2.value = eng.name;
  document.getElementById('searchDropdown2').classList.remove('show');
  document.getElementById('avatar').textContent = eng.abbr;
  document.getElementById('engineerName').textContent = eng.name;

  // 停止旧动画，修改问候语
  if (_stopTyping) _stopTyping();
  document.querySelector('.page1-greeting').innerHTML = '<span style="font-size:84px;font-weight:900;letter-spacing:-.04em">Hello!</span>';
  typeHelloWithName(eng.name);
  document.getElementById('page-1').classList.add('has-selection');

  // 同步 page-1 搜索框
  searchInput.value = eng.name;

  await loadProjects(eng.id);
  // 保持在 page-2
}

// ====== 新建项目抽屉 ======

function openDrawer() {
  document.getElementById('drawerOverlay').classList.add('show');
  document.getElementById('drawer').classList.add('show');
}

function closeDrawer() {
  document.getElementById('drawerOverlay').classList.remove('show');
  document.getElementById('drawer').classList.remove('show');
}

async function createProject() {
  const name = document.getElementById('drawerName').value.trim();
  const customer = document.getElementById('drawerCustomer').value.trim();
  if (!name || !customer) {
    showToast('请填写客户名和项目名');
    return;
  }
  const data = await request('/api/projects', {
    method: 'POST',
    body: {
      engineer_id: state.engineer.id,
      name,
      customer,
      order_no: document.getElementById('drawerOrder').value.trim() || undefined,
      contact_name: document.getElementById('drawerContact').value.trim() || undefined,
      contact_phone: document.getElementById('drawerPhone').value.trim() || undefined,
      product_version: document.getElementById('drawerVersion').value.trim() || undefined,
      install_address: document.getElementById('drawerAddress').value.trim() || undefined,
      manufacturer: document.getElementById('drawerManufacturer').value.trim() || undefined,
      agent: document.getElementById('drawerAgent').value.trim() || undefined,
      tech_lead: document.getElementById('drawerTechLead').value.trim() || undefined,
      service_manager: document.getElementById('drawerServiceManager').value.trim() || undefined
    }
  });
  if (!data) return;
  closeDrawer();
  showToast('项目创建成功');
  // 刷新项目列表
  await loadProjects(state.engineer.id);
  // 自动选中新项目
  setTimeout(() => {
    const cards = document.querySelectorAll('.project-card');
    const newCard = cards[cards.length - 1];
    if (newCard) {
      newCard.classList.add('selected');
      state.project = {
        id: data.id,
        name: data.name,
        impl_days: 0,
        detail: { customer: data.customer }
      };
      document.getElementById('nextStepArea').classList.remove('hidden');
    }
  }, 100);
}

// ====== 跳转到 Page 2 ======

document.getElementById('nextToReportBtn').onclick = async () => {
  if (!state.project) {
    showToast('请先选择项目');
    return;
  }
  // 填充日报页面信息
  document.getElementById('reportProjectName').textContent = state.project.name;
  document.getElementById('reportImplDays').textContent = `实施第 ${state.project.impl_days} 天`;
  document.getElementById('projectDetailBody').innerHTML = state.project.detail
    ? `<div>客户：${state.project.detail.customer || '-'}</div>
       <div>工单：${state.project.detail.order_no || '-'}</div>
       <div>版本：${state.project.detail.product_version || '-'}</div>
       <div>地址：${state.project.detail.install_address || '-'}</div>`
    : '';
  // 从上次日报获取进度，没有则默认 0
  const lastData = await request(`/api/reports/last-progress?engineer_id=${state.engineer.id}&project_id=${state.project.id}`);
  const lastProgress = lastData ? lastData.progress : 0;
  state.lastProgress = lastProgress;
  progressSlider.value = lastProgress;
  updateProgressUI(lastProgress);
  // 固定参考倒三角（显示上次进度位置，不随滑块移动）
  document.getElementById('progressMarker').style.left = lastProgress + '%';
  document.getElementById('progressMarkerLabel').textContent = lastProgress > 0 ? lastProgress + '%' : '';

  // 初始化条件卡片显示（默认进行中 → 下一步计划）
  document.querySelectorAll('.status-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.status-btn.ongoing').classList.add('active');
  selectedStatus = 'ongoing';
  document.getElementById('nextPlanCard').style.display = 'block';
  document.getElementById('issuesCard').style.display = 'none';
  showPage('page-3');
};

// ====== Page 3: 日报折叠卡片 ======

// 点击标题区域展开/收起项目详情
document.getElementById('collapseTitleArea').onclick = function(e) {
  document.getElementById('projectSummary').classList.toggle('open');
};
// 点击"编辑项目信息"编辑项目
document.getElementById('editProjBtnInline').onclick = function(e) {
  e.stopPropagation();
  enterP3Expand();
};

// ====== 工作内容动态列表 ======

function addTask(value = '') {
  const list = document.getElementById('taskList');
  const num = list.children.length + 1;
  const item = document.createElement('div');
  item.className = 'task-item';
  item.innerHTML = `
    <span class="task-num">${num}</span>
    <input class="form-input task-input" placeholder="输入工作任务" value="${value}">
    <button class="task-del-btn" onclick="removeTask(this)">删除</button>`;
  list.appendChild(item);
}

function removeTask(btn) {
  const items = document.querySelectorAll('.task-item');
  if (items.length <= 1) {
    showToast('至少保留一条工作内容');
    return;
  }
  btn.closest('.task-item').remove();
  // 重新编号
  document.querySelectorAll('.task-item .task-num').forEach((el, i) => {
    el.textContent = i + 1;
  });
}

// ====== 进度控制 ======

const progressSlider = document.getElementById('progressSlider');
const progressValue = document.getElementById('progressValue');
let selectedStatus = 'ongoing';

function updateProgressUI(val) {
  progressValue.textContent = val;
  progressSlider.style.background = `linear-gradient(to right, #534AB7 0%, #534AB7 ${val}%, #ddd ${val}%, #ddd 100%)`;
  // 倒三角是固定参考标记，不跟随滑块
}

progressSlider.addEventListener('input', () => {
  updateProgressUI(progressSlider.value);
});

function selectStatus(btn) {
  document.querySelectorAll('.status-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  selectedStatus = btn.dataset.status;

  // 根据状态切换下一步计划 / 遗留问题
  const nextPlanCard = document.getElementById('nextPlanCard');
  const issuesCard = document.getElementById('issuesCard');
  if (selectedStatus === 'ongoing') {
    nextPlanCard.style.display = 'block';
    issuesCard.style.display = 'none';
  } else if (selectedStatus === 'blocked') {
    nextPlanCard.style.display = 'none';
    issuesCard.style.display = 'block';
  } else {
    nextPlanCard.style.display = 'none';
    issuesCard.style.display = 'none';
  }
}

// 默认选中"进行中"
document.querySelector('.status-btn.ongoing').classList.add('active');

// ====== 提交日报 ======

async function submitReport(overwriteMode) {
  const planTitle = document.getElementById('planTitle').value.trim();
  if (!planTitle) {
    showToast('请填写今日计划');
    return;
  }

  const taskInputs = document.querySelectorAll('.task-input');
  const tasks = [];
  taskInputs.forEach(input => {
    const val = input.value.trim();
    if (val) tasks.push(val);
  });
  if (tasks.length === 0) {
    showToast('请填写至少一条工作内容');
    return;
  }

  const btn = document.getElementById('submitReportBtn');
  btn.disabled = true;
  btn.textContent = '提交中...';

  const body = {
    engineer_id: state.engineer.id,
    project_id: state.project.id,
    plan_title: planTitle,
    tasks,
    progress: parseInt(progressSlider.value),
    status: selectedStatus,
    report_date: state.customReportDate || undefined
  };

  if (selectedStatus === 'ongoing') {
    body.next_plan = document.getElementById('nextPlan').value.trim() || '';
  } else if (selectedStatus === 'blocked') {
    body.issues = document.getElementById('issues').value.trim() || '';
  }
  if (overwriteMode) body.overwrite = true;

  try {
    let res;
    if (overwriteMode) {
      // 修改模式走 PUT
      res = await fetch('/api/reports', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    } else {
      res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    }
    const result = await res.json();

    if (!result.success) {
      btn.disabled = false;
      btn.textContent = '提交日报';
      // 重复提交：询问是否修改
      if (result.data && result.data.existing) {
        if (confirm('今日已提交，是否修改？')) {
          submitReport(true);
        }
      } else {
        showToast(result.error || '提交失败');
      }
      return;
    }

    btn.disabled = false;
    btn.textContent = '提交日报';

    // 保存 report_id，page-4 提交后触发邮件发送
    state.lastReportId = result.data && result.data.report_id;

    // 设置成功标题（page-4 会用）
    document.getElementById('reportSuccessTitle').textContent =
      result.data && result.data.overwritten ? '日报已修改' : '日报已提交';
    document.getElementById('reportSummary').textContent =
      `${state.project.name} · 实施第 ${state.project.impl_days} 天 · 进度 ${progressSlider.value}%`;

    // 弹出工时填写
    showHoursOverlay();
  } catch (err) {
    btn.disabled = false;
    btn.textContent = '提交日报';
    showToast('网络错误: ' + err.message);
  }
}

// ====== 工时弹窗 ======

function showHoursOverlay() {
  const reportDate = state.customReportDate || new Date().toISOString().split('T')[0];
  const d = new Date(reportDate + 'T00:00:00');
  const label = `${d.getMonth()+1}月${d.getDate()}日`;
  document.getElementById('hoursModalTitle').textContent = label + ' 工时';
  document.getElementById('hoursModalDesc').textContent = '请填写 ' + label + ' 实际工时';
  document.getElementById('hoursError').classList.add('hidden');
  document.getElementById('hoursInput').value = '';
  document.getElementById('hoursOverlay').classList.remove('hidden');
  setTimeout(() => document.getElementById('hoursInput').focus(), 100);
}

document.getElementById('confirmHoursBtn').onclick = async function() {
  const input = document.getElementById('hoursInput');
  const val = parseFloat(input.value);
  if (isNaN(val) || val < 0 || val > 24) {
    document.getElementById('hoursError').classList.remove('hidden');
    return;
  }
  document.getElementById('hoursError').classList.add('hidden');

  const reportDate = state.customReportDate || new Date().toISOString().split('T')[0];
  const data = await request('/api/reports/hours', {
    method: 'POST',
    body: {
      engineer_id: state.engineer.id,
      project_id: state.project.id,
      report_date: reportDate,
      hours: val
    }
  });
  if (!data) return;

  document.getElementById('hoursOverlay').classList.add('hidden');
  showPage('page-4');
  initTomorrowPage();
};

// 回车键确认工时
document.getElementById('hoursInput').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') document.getElementById('confirmHoursBtn').click();
});

// ====== Page 4: 明日去向 ======

function initTomorrowPage() {
  const today = new Date();
  const dateStr = state.customReportDate || today.toISOString().split('T')[0];
  state.tomorrowDate = dateStr;
  state.destination = null;

  // 加载已有项目列表（用于"已有项目"面板）
  if (state.engineer) {
    loadProjectsForDest(state.engineer.id);
  }
}

async function loadProjectsForDest(engineerId) {
  const data = await request(`/api/engineers/${engineerId}/projects`);
  if (!data) return;
  const container = document.getElementById('destProjectList');
  container.innerHTML = '';
  // 包含当前项目
  const allProjects = data.filter(p => p.id === state.project.id).length > 0
    ? data
    : [{ id: state.project.id, name: state.project.name, impl_days: state.project.impl_days, ...state.project.detail }, ...data];

  allProjects.forEach(p => {
    const card = document.createElement('div');
    card.className = 'project-card';
    card.dataset.projectId = p.id;
    card.innerHTML = `
      <div class="project-card-header">
        <div class="project-info">
          <div class="project-radio"></div>
          <div style="flex:1;min-width:0">
            <div class="project-name">${p.name}</div>
            <div class="project-meta">实施第 ${p.impl_days || 0} 天</div>
          </div>
        </div>
      </div>`;
    card.onclick = () => {
      document.querySelectorAll('#destProjectList .project-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      state.destProjectId = p.id;
    };
    container.appendChild(card);
  });
}

function selectDestination(el) {
  document.querySelectorAll('.grid-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  state.destination = el.dataset.dest;

  // 隐藏所有面板
  document.querySelectorAll('.destination-panel').forEach(p => p.classList.remove('show'));

  if (state.destination === 'existing_project') {
    document.getElementById('panel-existing_project').classList.add('show');
    state.destProjectId = state.project.id;
    // 默认选中当前项目
    setTimeout(() => {
      const cards = document.querySelectorAll('#destProjectList .project-card');
      if (cards.length > 0) {
        cards.forEach(c => {
          if (parseInt(c.dataset.projectId) === state.project.id) {
            c.classList.add('selected');
          }
        });
      }
    }, 100);
  } else if (state.destination === 'new_project') {
    document.getElementById('panel-new_project').classList.add('show');
  } else if (state.destination === 'back_to_office') {
    document.getElementById('panel-back_to_office').classList.add('show');
  } else if (state.destination === 'other') {
    document.getElementById('panel-other').classList.add('show');
  }
}

// ====== Page 2: 展开全部（显示被折叠的更多项目） ======

document.getElementById('expandAllBtn').onclick = function() {
  const folded = document.querySelectorAll('.project-card-folded');
  if (folded.length === 0) return;
  const allVisible = Array.from(folded).every(c => !c.classList.contains('hidden'));
  folded.forEach(c => {
    if (allVisible) c.classList.add('hidden');
    else c.classList.remove('hidden');
  });
  this.textContent = allVisible ? '展开全部 ▾' : '收起部分 ▴';
};

// ====== Page 3: 项目信息编辑展开 ======

document.getElementById('p3ExpandBackdrop').onclick = exitP3Expand;
document.getElementById('p3ExpandClose').onclick = exitP3Expand;

function enterP3Expand() {
  document.getElementById('p3ExpandBackdrop').classList.remove('hidden');
  document.getElementById('p3ExpandBackdrop').classList.add('show');
  document.getElementById('p3ExpandContainer').classList.remove('hidden');
  document.getElementById('p3ExpandContainer').classList.add('show');

  const list = document.getElementById('p3ExpandList');
  list.innerHTML = '';

  // 实施日期选择（顶部，用于补填昨日日报）
  const today = new Date().toISOString().split('T')[0];
  const dateRow = document.createElement('div');
  dateRow.className = 'p3-expand-date-row';
  dateRow.innerHTML = `
    <div class="proj-expand-detail-row" style="border-bottom:1px solid var(--border);padding:12px 16px;margin:0">
      <span class="label">实施日期</span>
      <input type="date" class="proj-expand-detail-input" id="p3CustomDate" value="${state.customReportDate || today}">
    </div>`;
  list.appendChild(dateRow);

  // 日期变更时存入 state
  document.getElementById('p3CustomDate').addEventListener('change', function() {
    state.customReportDate = this.value || null;
  });

  // 只显示当前选中的项目
  const p = state.project && state.project.detail ? state.project.detail : state.project;
  if (!p) return;

  const card = document.createElement('div');
  card.className = 'proj-expand-card';
  card.innerHTML = `
    <div class="proj-expand-card-header">${p.name}</div>
    <div class="proj-expand-card-body">
      <div class="proj-expand-detail-row">
        <span class="label">客户</span>
        <input class="proj-expand-detail-input" value="${String(p.customer || '').replace(/"/g,'&quot;')}" data-field="customer">
      </div>
      <div class="proj-expand-detail-row">
        <span class="label">工单号</span>
        <input class="proj-expand-detail-input" value="${String(p.order_no || '').replace(/"/g,'&quot;')}" data-field="order_no">
      </div>
      <div class="proj-expand-detail-row">
        <span class="label">联系人</span>
        <input class="proj-expand-detail-input" value="${String(p.contact_name || '').replace(/"/g,'&quot;')}" data-field="contact_name">
      </div>
      <div class="proj-expand-detail-row">
        <span class="label">电话</span>
        <input class="proj-expand-detail-input" value="${String(p.contact_phone || '').replace(/"/g,'&quot;')}" data-field="contact_phone">
      </div>
      <div class="proj-expand-detail-row">
        <span class="label">版本</span>
        <input class="proj-expand-detail-input" value="${String(p.product_version || '').replace(/"/g,'&quot;')}" data-field="product_version">
      </div>
      <div class="proj-expand-detail-row">
        <span class="label">地址</span>
        <input class="proj-expand-detail-input" value="${String(p.install_address || '').replace(/"/g,'&quot;')}" data-field="install_address">
      </div>
      <div class="proj-expand-detail-row">
        <span class="label">厂商</span>
        <input class="proj-expand-detail-input" value="${String(p.manufacturer || '').replace(/"/g,'&quot;')}" data-field="manufacturer">
      </div>
      <div class="proj-expand-detail-row">
        <span class="label">代理商</span>
        <input class="proj-expand-detail-input" value="${String(p.agent || '').replace(/"/g,'&quot;')}" data-field="agent">
      </div>
      <div class="proj-expand-detail-row">
        <span class="label">技术负责人</span>
        <input class="proj-expand-detail-input" value="${String(p.tech_lead || '').replace(/"/g,'&quot;')}" data-field="tech_lead">
      </div>
      <div class="proj-expand-detail-row">
        <span class="label">服务经理</span>
        <input class="proj-expand-detail-input" value="${String(p.service_manager || '').replace(/"/g,'&quot;')}" data-field="service_manager">
      </div>
      <button class="btn btn-primary save-detail-btn" style="margin-top:10px;width:100%">保存修改</button>
    </div>`;
  card.querySelector('.save-detail-btn').onclick = async function() {
    const inputs = card.querySelectorAll('.proj-expand-detail-input');
    const body = {};
    inputs.forEach(inp => { body[inp.dataset.field] = inp.value.trim() || null; });
    const result = await request(`/api/projects/${p.id}`, { method: 'PUT', body });
    if (result) {
      showToast('项目信息已更新');
      if (p) Object.assign(p, body);
    }
  };
  list.appendChild(card);
}

function exitP3Expand() {
  document.getElementById('p3ExpandBackdrop').classList.remove('show');
  document.getElementById('p3ExpandBackdrop').classList.add('hidden');
  document.getElementById('p3ExpandContainer').classList.remove('show');
  document.getElementById('p3ExpandContainer').classList.add('hidden');
}

// ====== 提交明日去向 ======

async function submitTomorrow(overwriteMode) {
  if (!state.destination) {
    showToast('请选择明日去向');
    return;
  }

  const body = {
    engineer_id: state.engineer.id,
    report_date: state.tomorrowDate,
    destination: state.destination,
    report_id: state.lastReportId || null
  };

  if (state.destination === 'existing_project') {
    if (!state.destProjectId) {
      showToast('请选择项目');
      return;
    }
    body.project_id = state.destProjectId;
  } else if (state.destination === 'new_project') {
    const customer = document.getElementById('newProjCustomer').value.trim();
    const name = document.getElementById('newProjName').value.trim();
    if (!customer || !name) {
      showToast('请填写客户名和项目名');
      return;
    }
    body.new_project_customer = customer;
    body.new_project_name = name;
    body.new_project_order = document.getElementById('newProjOrder').value.trim() || undefined;
    body.new_project_contact = document.getElementById('newProjContact').value.trim() || undefined;
    body.new_project_phone = document.getElementById('newProjPhone').value.trim() || undefined;
    body.new_project_version = document.getElementById('newProjVersion').value.trim() || undefined;
    body.new_project_address = document.getElementById('newProjAddress').value.trim() || undefined;
    body.new_project_manufacturer = document.getElementById('newProjManufacturer').value.trim() || undefined;
    body.new_project_agent = document.getElementById('newProjAgent').value.trim() || undefined;
    body.new_project_tech_lead = document.getElementById('newProjTechLead').value.trim() || undefined;
    body.new_project_service_manager = document.getElementById('newProjServiceManager').value.trim() || undefined;
  } else if (state.destination === 'other') {
    const reason = document.getElementById('otherReason').value.trim();
    if (!reason) {
      showToast('请填写原因');
      return;
    }
    body.other_reason = reason;
  }
  if (overwriteMode) body.overwrite = true;

  const btn = document.getElementById('submitTomorrowBtn');
  btn.disabled = true;
  btn.textContent = '提交中...';

  try {
    const res = await fetch('/api/reports/tomorrow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const result = await res.json();

    btn.disabled = false;
    btn.textContent = '确认提交并完成';

    if (!result.success) {
      if (result.data && result.data.existing) {
        if (confirm('今日已提交过明日去向，是否修改？')) {
          submitTomorrow(true);
        }
      } else {
        showToast(result.error || '提交失败');
      }
      return;
    }

    await loadFinalStats();
    showPage('page-5');
  } catch (err) {
    btn.disabled = false;
    btn.textContent = '确认提交并完成';
    showToast('网络错误: ' + err.message);
  }
}

async function loadFinalStats() {
  // CSS 已隐藏 .stats-grid，无需渲染
}

// ====== 今日暂无项目，直接跳转明日去向 ======
function skipToTomorrow() {
  showPage('page-4');
  initTomorrowPage();
}
