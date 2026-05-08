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
  if (roleEl) roleEl.textContent = user.role === 'admin' ? '管理员' : '领导';

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

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', initAdmin);
