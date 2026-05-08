// ====== 管理侧公共 JS ======

// 页面加载时验证登录
async function initAdmin() {
  const res = await fetch('/api/auth/me');
  if (!res.ok) {
    window.location.href = '/login';
    return;
  }
  const data = await res.json();
  if (!data.success) {
    window.location.href = '/login';
    return;
  }

  const user = data.data;
  const userEl = document.getElementById('topbarUser');
  if (userEl) userEl.textContent = user.username;
  const roleEl = document.getElementById('topbarRole');
  if (roleEl) {
    const roleMap = { admin: '管理员', leader: '领导', viewer: '查看者', engineer: '员工' };
    roleEl.textContent = roleMap[user.role] || user.role;
  }

  // 存储用户角色到 body 供页面使用
  document.body.dataset.role = user.role;
  document.body.dataset.engineerId = user.engineer_id || '';

  // 高亮当前导航
  const currentPage = window.location.pathname.replace('/admin/', '').split('?')[0] || 'index.html';
  document.querySelectorAll('.nav-item').forEach(item => {
    const href = item.getAttribute('href');
    if (href === currentPage || (currentPage === 'index.html' && href === 'index.html')) {
      item.classList.add('active');
    }
  });
}

// 退出
async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/login';
}

// Toast 提示
function showToast(msg, type) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.style.cssText = `
      position: fixed; bottom: 32px; left: 50%; transform: translateX(-50%);
      padding: 10px 20px; border-radius: 8px;
      font-size: 13px; font-weight: 600; z-index: 999;
      transition: all 0.25s; opacity: 0;
      pointer-events: none;
    `;
    document.body.appendChild(el);
  }
  el.style.background = type === 'error' ? 'rgba(255,68,68,0.9)' : 'rgba(255,255,255,0.9)';
  el.style.color = type === 'error' ? '#fff' : '#000';
  el.textContent = msg;
  el.style.opacity = '1';
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.style.opacity = '0'; }, 2500);
}

// 格式化日期
function formatDate(d) {
  if (!d) return '-';
  const date = new Date(d);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDateTime(d) {
  if (!d) return '-';
  const date = new Date(d);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${h}:${min}`;
}

// 状态标签
function statusBadge(status) {
  const map = {
    complete: '<span class="badge badge-complete">完成</span>',
    ongoing: '<span class="badge badge-ongoing">进行中</span>',
    blocked: '<span class="badge badge-blocked">受阻</span>'
  };
  return map[status] || status;
}

// 加载中按钮
function setLoading(btn, loading) {
  if (loading) {
    btn._orig = btn.textContent;
    btn.textContent = '处理中...';
    btn.disabled = true;
  } else {
    btn.textContent = btn._orig || btn.textContent;
    btn.disabled = false;
  }
}

// fetch 封装
async function api(url, options) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await res.json();
  if (!data.success) {
    throw new Error(data.message || '请求失败');
  }
  return data;
}

// ====== 统计面板访问（密码弹窗） ======
function openStatsPanel() {
  // 检查是否已有 viewer session（直接用 ajax 检测）
  fetch('/api/leader/me')
    .then(r => r.json())
    .then(d => {
      if (d.success) {
        window.location.href = '/leader/';
        return;
      }
      // 未认证，显示密码弹窗
      showStatsPasswordModal();
    })
    .catch(() => showStatsPasswordModal());
}

function showStatsPasswordModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show';
  overlay.style.display = 'flex';
  overlay.innerHTML = `
    <div class="modal" style="max-width:360px">
      <div class="modal-title">统计面板访问</div>
      <div class="form-group">
        <label class="form-label">请输入查看密码</label>
        <input class="form-input" id="statsPassword" type="password" placeholder="请输入密码"
          style="width:100%" autofocus>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">取消</button>
        <button class="btn btn-primary" id="statsLoginBtn" onclick="doStatsLogin()">确认</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', function(e) {
    if (e.target === this) this.remove();
  });
  setTimeout(() => document.getElementById('statsPassword')?.focus(), 100);
}

async function doStatsLogin() {
  const password = document.getElementById('statsPassword').value;
  if (!password) { alert('请输入密码'); return; }
  const btn = document.getElementById('statsLoginBtn');
  setLoading(btn, true);
  try {
    const res = await fetch('/api/leader/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    const data = await res.json();
    if (!data.success) {
      alert(data.message || '密码错误');
      setLoading(btn, false);
      return;
    }
    // 清理弹窗
    document.querySelector('.modal-overlay.show')?.remove();
    window.location.href = '/leader/';
  } catch (err) {
    alert('请求失败');
    setLoading(btn, false);
  }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', initAdmin);
