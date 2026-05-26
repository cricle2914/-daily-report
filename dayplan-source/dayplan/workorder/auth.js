/* ======= 共享认证模块 ======= */
/* 登录态缓存到 localStorage，页面切换时先读缓存立即渲染，后台静默验证 */

var AUTH_KEY = 'workorder-auth';
var SERVER_URL_KEY = 'workorder-server-url';
var DEFAULT_API = 'http://172.40.93.99:31663';

/* 服务器地址：优先读 localStorage，无则用默认值 */
var API = (function() {
  try {
    var saved = localStorage.getItem(SERVER_URL_KEY);
    if (saved) return saved.replace(/\/+$/, '');
  } catch(e) {}
  return DEFAULT_API;
})();

// 注意：不再从 DayPlan 设置读取 serverUrl，只认 localStorage（由登录界面设置）

/* 更新服务器地址并刷新页面 */
function setServerUrl(url) {
  if (!url) return;
  url = url.replace(/\/+$/, '');
  try {
    localStorage.setItem(SERVER_URL_KEY, url);
  } catch(e) {}
  // 注意：不再写入 DayPlan 设置，serverUrl 仅存 localStorage
  clearAuthCache();
  window.location.reload();
}

/* 默认角色映射 — 各页面可按需覆盖 */
var ROLE_LABEL = {
  admin: '管理员',
  leader: '查看者',
  viewer: '查看者',
  engineer: '工程师',
  team_lead: '组长'
};

function getInitials(name) { return name ? name.slice(0, 2).toUpperCase() : '?'; }

/* applyRole — 按角色控制侧边栏导航可见性 */
function applyRole(role) {
  var bs = document.querySelector('.brand-sub');
  if (bs) {
    var labels = { admin: '管理控制台', engineer: '工程师工作台', team_lead: '组长工作台' };
    bs.textContent = labels[role] || '管理控制台';
  }

  var roleNav = {
    admin: ['nav-engineers', 'nav-projects', 'nav-reports', 'nav-accounts', 'nav-email', 'nav-messages'],
    engineer: ['nav-projects', 'nav-reports', 'nav-submit-report'],
    team_lead: ['nav-engineers', 'nav-projects', 'nav-reports', 'nav-hours', 'nav-submit-report'],
    leader: ['nav-overview', 'nav-projects', 'nav-team', 'nav-hours', 'nav-distribution', 'nav-messages'],
    viewer: ['nav-overview', 'nav-projects', 'nav-team', 'nav-hours', 'nav-distribution', 'nav-messages'],
  };

  var show = roleNav[role] || [];
  var allNav = ['nav-engineers', 'nav-projects', 'nav-reports', 'nav-hours', 'nav-accounts', 'nav-email', 'nav-messages', 'nav-submit-report', 'nav-overview', 'nav-team', 'nav-distribution'];

  allNav.forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });

  show.forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.style.display = '';
  });

}

function renderUser(name, role) {
  var display = document.getElementById('userDisplay');
  var avatar = document.getElementById('userAvatar');
  var roleEl = document.getElementById('roleDisplay');
  if (display) display.textContent = name;
  if (avatar) avatar.textContent = getInitials(name);
  if (roleEl) roleEl.textContent = ROLE_LABEL[role] || role || '';
}

function cacheAuth(user) {
  try { localStorage.setItem(AUTH_KEY, JSON.stringify(user)); } catch(e) {}
}

function clearAuthCache() {
  try { localStorage.removeItem(AUTH_KEY); } catch(e) {}
}

function getCachedAuth() {
  try {
    var raw = localStorage.getItem(AUTH_KEY);
    if (raw) return JSON.parse(raw);
  } catch(e) {}
  return null;
}

async function checkAuth() {
  /* 1. 先读缓存立即渲染，消除白屏 */
  var cached = getCachedAuth();
  console.log('[checkAuth] 缓存数据:', JSON.stringify(cached));
  if (cached && cached.username) {
    console.log('[checkAuth] 使用缓存渲染用户');
    renderUser(cached.username, cached.role);
    applyRole(cached.role);
  }

  /* 2. 后台验证 API */
  try {
    var authUrl = API + '/api/auth/me';
    console.log('[checkAuth] 开始验证，URL:', authUrl);

    // 检查是否有保存的 token
    var token = null;
    try { token = localStorage.getItem('workorder-auth-token'); } catch(e) {}
    console.log('[checkAuth] 是否有token:', !!token);

    // 构建 fetch options，支持 token 认证
    var fetchOptions = { credentials: 'include' };
    if (token) {
      fetchOptions.headers = { 'Authorization': 'Bearer ' + token };
      console.log('[checkAuth] 使用 token 认证');
    }

    var res = await fetch(authUrl, fetchOptions);
    console.log('[checkAuth] 响应状态:', res.status, res.statusText);

    if (!res.ok) {
      console.error('[checkAuth] 验证失败，状态码:', res.status);
      var errText = await res.text();
      console.error('[checkAuth] 错误响应:', errText);

      // 如果有缓存数据，使用缓存而不是清除（Electron webview 中 cookies 可能有兼容性问题）
      if (cached && cached.username) {
        console.log('[checkAuth] API 验证失败但有缓存，使用缓存数据');
        return cached;
      }

      console.log('[checkAuth] 清除缓存并返回登录页');
      clearAuthCache();
      window.location.href = '../login.html';
      return null;
    }

    var data = await res.json();
    console.log('[checkAuth] 响应数据:', JSON.stringify(data));
    var inner = data.data || data;
    console.log('[checkAuth] 解析后inner:', JSON.stringify(inner));

    var user = {
      username: inner.username || inner.name || data.username || '用户',
      role: inner.role || data.role,
      engineer_id: inner.engineer_id
    };
    console.log('[checkAuth] 最终用户对象:', JSON.stringify(user));
    console.log('[checkAuth] 验证成功，缓存并渲染');

    cacheAuth(user);
    renderUser(user.username, user.role);
    applyRole(user.role);
    return user;
  } catch (e) {
    /* 网络异常时用缓存兜底 */
    console.error('[checkAuth] 异常:', e.message);
    console.error('[checkAuth] 异常堆栈:', e.stack);

    if (cached && cached.username) {
      console.log('[checkAuth] 网络异常，使用缓存兜底');
      return cached;
    }

    console.error('[checkAuth] 异常且无缓存，返回登录页');
    window.location.href = '../login.html';
    return null;
  }
}

async function logout() {
  clearAuthCache();
  try { sessionStorage.removeItem('msg_last_unread'); } catch(e) {}
  await fetch(API + '/api/auth/logout', { method: 'POST', credentials: 'include' });
  window.location.href = '../login.html';
}
