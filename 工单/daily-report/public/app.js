// ====== 全局状态 ======
let state = {
  engineer: null,
  project: null,
  projects: [],
  destination: null,
  tomorrowDate: ''
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

  // 更新步骤标签
  document.querySelectorAll('.step').forEach((s, i) => {
    s.classList.remove('active', 'done');
    if (pageId === 'page-1') {
      if (i === 0) s.classList.add('active');
    } else if (pageId === 'page-2') {
      if (i === 0) s.classList.add('done');
      else if (i === 1) s.classList.add('active');
    } else if (pageId === 'page-3' || pageId === 'page-complete') {
      if (i < 2) s.classList.add('done');
      else if (i === 2) s.classList.add('active');
    }
  });
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), 2000);
}

// ====== 打字动画 ======
function startTypingAnimation() {
  const el = document.getElementById('typingSub');
  if (!el) return;
  const text = '今天辛苦啦，让我帮你提交日报吧。';
  const boldStart = 9, boldEnd = 13; // "提交日报" 范围
  let stopped = false, timer = null;

  function buildHtml(len) {
    let html = '';
    for (let i = 0; i < len && i < text.length; i++) {
      if (i === boldStart) html += '<b>';
      html += text[i];
      if (i === boldEnd - 1) html += '</b>';
    }
    return html;
  }

  function typeStep(idx, cb) {
    if (stopped) return;
    el.innerHTML = buildHtml(idx);
    if (idx < text.length) timer = setTimeout(() => typeStep(idx + 1, cb), 65);
    else timer = setTimeout(cb, 2000);
  }

  function deleteStep(idx, target, cb) {
    if (stopped) return;
    el.innerHTML = buildHtml(idx);
    if (idx > target) timer = setTimeout(() => deleteStep(idx - 1, target, cb), 40);
    else timer = setTimeout(cb, 500);
  }

  function loop() {
    if (stopped) return;
    typeStep(0, () => {
      deleteStep(text.length, boldStart, () => {
        typeStep(boldStart, () => {
          timer = setTimeout(loop, 2000);
        });
      });
    });
  }

  // 启动先等 1 秒
  timer = setTimeout(loop, 1000);

  return () => { stopped = true; if (timer) clearTimeout(timer); };
}

// 页面加载后启动打字动画
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

function selectEngineer(eng) {
  state.engineer = eng;
  state.project = null;
  searchInput.value = eng.name;
  document.getElementById('searchDropdown').classList.remove('show');
  document.getElementById('avatar').textContent = eng.abbr;
  document.getElementById('engineerName').textContent = eng.name;
  document.getElementById('selectedEngineerInfo').classList.remove('hidden');
  document.getElementById('selectedEngineerName').textContent = eng.name;

  // 添加 has-selection 隐藏 Good day!，露出项目列表
  document.getElementById('page-1').classList.add('has-selection');
  // 退出搜索展开状态
  document.getElementById('page-1').classList.remove('search-expanded');

  // 明确显示已选择的工程师样式
  document.querySelectorAll('.dropdown-item').forEach(el => el.style.display = 'none');

  loadProjects(eng.id);
}

function resetEngineerSelection() {
  if (!state.engineer) return;
  state.engineer = null;
  state.project = null;
  document.getElementById('selectedEngineerInfo').classList.add('hidden');
  document.getElementById('nextStepArea').classList.add('hidden');
  document.getElementById('newProjectArea').classList.add('hidden');
  document.getElementById('projectList').innerHTML = '';
  document.getElementById('page-1').classList.remove('has-selection');
  searchInput.value = '';
  document.querySelectorAll('.dropdown-item').forEach(el => el.style.display = '');
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
  }

  projects.forEach(p => {
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
        <button class="expand-btn">▼</button>
      </div>
      <div class="project-detail">
        <div><span class="label">客户</span>${p.customer}</div>
        <div><span class="label">联系人</span>${p.contact_name || '-'} ${p.contact_phone || ''}</div>
        <div><span class="label">版本</span>${p.product_version || '-'}</div>
        <div><span class="label">地址</span>${p.install_address || '-'}</div>
        <div><span class="label">厂商</span>${p.manufacturer || '-'}</div>
        <div><span class="label">代理商</span>${p.agent || '-'}</div>
        <div><span class="label">技术负责人</span>${p.tech_lead || '-'}</div>
        <div><span class="label">服务经理</span>${p.service_manager || '-'}</div>
      </div>`;
    card.onclick = (e) => {
      // 点击展开按钮时切换详情
      if (e.target.classList.contains('expand-btn')) {
        const detail = card.querySelector('.project-detail');
        detail.classList.toggle('open');
        card.querySelector('.expand-btn').classList.toggle('open');
        return;
      }
      // 切换选中
      document.querySelectorAll('.project-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      state.project = { id: p.id, name: p.name, impl_days: p.impl_days, detail: p };
      document.getElementById('nextStepArea').classList.remove('hidden');
    };
    container.appendChild(card);
  });

  document.getElementById('newProjectArea').classList.remove('hidden');
}

// ====== 新建项目抽屉 ======

function openDrawer() {
  document.getElementById('drawerOverlay').classList.add('show');
  document.getElementById('drawer').classList.add('show');
}

document.getElementById('newProjectBtn').onclick = openDrawer;

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
       <div>地址：${state.project.detail.install_address || '-'}</div>
       <div>厂商：${state.project.detail.manufacturer || '-'}</div>
       <div>代理商：${state.project.detail.agent || '-'}</div>
       <div>技术负责人：${state.project.detail.tech_lead || '-'}</div>
       <div>服务经理：${state.project.detail.service_manager || '-'}</div>`
    : '';
  // 从上次日报获取进度，没有则默认 0
  const lastData = await request(`/api/reports/last-progress?engineer_id=${state.engineer.id}&project_id=${state.project.id}`);
  const lastProgress = lastData ? lastData.progress : 0;
  progressSlider.value = lastProgress;
  progressValue.textContent = lastProgress + '%';
  progressSlider.style.background = `linear-gradient(to right, #534AB7 0%, #534AB7 ${lastProgress}%, var(--text-dim) ${lastProgress}%, var(--text-dim) 100%)`;
  showPage('page-2');
};

// ====== Page 2: 日报折叠卡片 ======

document.getElementById('projectSummary').onclick = function() {
  this.classList.toggle('open');
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

progressSlider.addEventListener('input', () => {
  progressValue.textContent = progressSlider.value + '%';
  progressSlider.style.background = `linear-gradient(to right, #534AB7 0%, #534AB7 ${progressSlider.value}%, #ddd ${progressSlider.value}%, #ddd 100%)`;
});

function selectStatus(btn) {
  document.querySelectorAll('.status-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  selectedStatus = btn.dataset.status;
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

  const issues = document.getElementById('issues').value.trim() || '';

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
    issues
  };
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

    // 设置成功标题
    document.getElementById('reportSuccessTitle').textContent =
      result.data && result.data.overwritten ? '日报已修改' : '日报已提交';

    // 跳转到 Page 3
    document.getElementById('reportSummary').textContent =
      `${state.project.name} · 实施第 ${state.project.impl_days} 天 · 进度 ${progressSlider.value}%`;
    showPage('page-3');
    initTomorrowPage();
  } catch (err) {
    btn.disabled = false;
    btn.textContent = '提交日报';
    showToast('网络错误: ' + err.message);
  }
}

// ====== Page 3: 明日去向 ======

function initTomorrowPage() {
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0];
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

// ====== 提交明日去向 ======

async function submitTomorrow() {
  if (!state.destination) {
    showToast('请选择明日去向');
    return;
  }

  const body = {
    engineer_id: state.engineer.id,
    report_date: state.tomorrowDate,
    destination: state.destination
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
  } else if (state.destination === 'other') {
    const reason = document.getElementById('otherReason').value.trim();
    if (!reason) {
      showToast('请填写原因');
      return;
    }
    body.other_reason = reason;
  }

  const btn = document.getElementById('submitTomorrowBtn');
  btn.disabled = true;
  btn.textContent = '提交中...';

  const data = await request('/api/reports/tomorrow', {
    method: 'POST',
    body
  });

  btn.disabled = false;
  btn.textContent = '确认提交并完成';

  if (!data) return;

  // 加载完成页统计
  await loadFinalStats();
  showPage('page-complete');
}

async function loadFinalStats() {
  // CSS 已隐藏 .stats-grid，无需渲染
}
