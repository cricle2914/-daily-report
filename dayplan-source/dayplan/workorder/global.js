/* ======= 全局设置 & 消息遮罩层 ======= */

(function() {
  // 等待 DOM 就绪
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  var _globalMsgCount = 0;

  function init() {
    initTheme();
    injectButtons();
    createMessagesModal();
    fetchUnreadCount();
    startMessagePolling();
    listenForThemeChanges();
  }

  function initTheme() {
    // 优先从 DayPlan 设置读取（保证同步），降级到 localStorage
    var theme = 'dark';

    if (window.electronAPI && window.electronAPI.loadSettings) {
      window.electronAPI.loadSettings().then(function(settings) {
        if (settings && settings.theme) {
          theme = settings.theme;
          applyTheme(theme);
          try { localStorage.setItem('app-theme', theme); } catch(e) {}
        }
      }).catch(function() {
        // 降级：localStorage
        theme = localStorage.getItem('app-theme') || 'dark';
        applyTheme(theme);
      });
    } else {
      // 浏览器环境：只用 localStorage
      theme = localStorage.getItem('app-theme') || 'dark';
      applyTheme(theme);
    }
  }

  function applyTheme(theme) {
    if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }

  function listenForThemeChanges() {
    // 监听来自主窗口的主题变更事件
    window.addEventListener('theme-changed', function(e) {
      if (e.detail && e.detail.theme) {
        applyTheme(e.detail.theme);
      }
    });
  }

  function injectButtons() {
    var footer = document.querySelector('.sidebar-footer');
    if (!footer) return;
    var logoutBtn = footer.querySelector('button');
    if (!logoutBtn) return;

    // 消息按钮
    var msgBtn = document.createElement('button');
    msgBtn.id = 'globalMsgBtn';
    msgBtn.innerHTML = '<i class="fa-solid fa-bell"></i><span> 消息</span>';
    msgBtn.onclick = openMessages;
    // 未读角标
    var badge = document.createElement('span');
    badge.id = 'msgBadge';
    badge.style.cssText = 'display:none;position:absolute;top:2px;right:2px;width:16px;height:16px;background:#f87171;border-radius:50%;font-size:9px;color:#fff;font-weight:700;align-items:center;justify-content:center;line-height:1';
    msgBtn.style.position = 'relative';
    msgBtn.appendChild(badge);

    footer.insertBefore(msgBtn, logoutBtn);
  }

  // ===== 设置不再放侧边栏，服务器地址配置仅在登录界面 =====

  // ===== 消息遮罩层 =====
  function createMessagesModal() {
    var div = document.createElement('div');
    div.className = 'modal-overlay';
    div.id = 'globalMessagesModal';
    div.style.display = 'none';
    div.innerHTML =
      '<div class="modal" style="max-width:520px;max-height:80vh;display:flex;flex-direction:column;overflow:hidden;padding:0">' +
      '<div class="modal-header" style="margin-bottom:0;flex-shrink:0;padding:28px 28px 0 28px"><span>消息</span><button onclick="closeGlobalMessages()"><i class="fa-solid fa-xmark"></i></button></div>' +
      '<div class="modal-body" id="globalMsgList" style="flex:1;overflow-y:auto;padding:14px 28px 28px 28px;gap:0"></div>' +
      '<div style="flex-shrink:0;display:flex;justify-content:space-between;align-items:center;padding:12px 28px;border-top:1px solid var(--border);background:var(--bg2)">' +
      '<div id="markAllBtn" style="display:none"><button class="btn-secondary btn-sm" onclick="markAllRead()"><i class="fa-solid fa-check-double"></i> 全部已读</button></div>' +
      '<button class="btn-secondary btn-sm" onclick="closeGlobalMessages()">关闭</button>' +
      '</div>' +
      '</div>';
    document.body.appendChild(div);
  }

  // ===== 全部已读 =====
  function updateMarkAllBtn() {
    var btn = document.getElementById('markAllBtn');
    if (!btn) return;
    var list = document.getElementById('globalMsgList');
    var hasUnread = list && list.querySelector('[style*="background:#f87171"]');
    btn.style.display = hasUnread ? '' : 'none';
  }

  window.markAllRead = function() {
    if (typeof API === 'undefined') return;
    // 1. 立即清除所有小红点（不依赖 API 返回）
    updateBadge(0);
    var list = document.getElementById('globalMsgList');
    if (list) {
      [].slice.call(list.children).forEach(function(item) {
        if (item.tagName !== 'DIV') return;
        item.style.opacity = '0.5';
        var dot = item.querySelector('span[style*="background:#f87171"]');
        if (dot) dot.remove();
        var title = item.querySelector('div[style*="font-weight"]');
        if (title) { title.style.fontWeight = '400'; title.style.color = 'var(--text3)'; }
      });
      updateMarkAllBtn();
    }
    // 2. 后台标记已读并同步服务器计数
    fetch(API + '/api/messages/read-all', { method: 'PUT', credentials: 'include' })
      .then(function(r) {
        if (!r.ok) { fetchUnreadCount(); return; }
        fetchUnreadCount();
        showGlobalToast('已全部标记为已读');
      })
      .catch(function() { fetchUnreadCount(); });
  };

  // ===== 未读计数 =====
  function updateBadge(count) {
    _globalMsgCount = count;
    var badge = document.getElementById('msgBadge');
    if (!badge) return;
    if (count > 0) {
      badge.style.display = 'flex';
      badge.textContent = count > 99 ? '99+' : count;
    } else {
      badge.style.display = 'none';
    }
  }

  function fetchUnreadCount() {
    if (typeof API === 'undefined') return;
    fetch(API + '/api/messages/unread-count', { credentials: 'include' })
      .then(function(r) { if (!r.ok) throw new Error(); return r.json(); })
      .then(function(d) {
        var count = (d.data || d).count || 0;
        updateBadge(count);
      })
      .catch(function() {});
  }

  // ===== 消息实时推送（1秒轮询） =====
  var _lastUnreadCount = (function() {
    try { return parseInt(sessionStorage.getItem('msg_last_unread') || '-1', 10); } catch(e) { return -1; }
  })();
  function startMessagePolling() {
    if (typeof API === 'undefined') return;
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    var _firstPoll = true;
    function showNotify(title, body) {
      // 优先走 Electron IPC（来源名正确）
      if (window.api && window.api.showNotification) {
        window.api.showNotification({ title: title, content: body });
        return;
      }
      // 降级：浏览器 Notification（来源名可能不对）
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body: body, silent: false });
      }
    }
    function poll() {
      fetch(API + '/api/messages/unread-count', { credentials: 'include' })
        .then(function(r) { if (!r.ok) throw new Error(); return r.json(); })
        .then(function(d) {
          var count = (d.data || d).count || 0;
          if (_firstPoll) {
            _firstPoll = false;
            // 本页面的第一次轮询：有未读且比上次记录的更多 → 汇总展示
            if (count > 0 && count > _lastUnreadCount) {
              showNotify('日报系统', '您有 ' + count + ' 条未读消息');
            }
          } else if (count > _lastUnreadCount) {
            // 页面使用中有新消息到达 → 展示具体内容
            fetch(API + '/api/messages', { credentials: 'include' })
              .then(function(r) { return r.json(); })
              .then(function(data) {
                var msgs = data.data || data || [];
                if (msgs.length > 0) {
                  var latest = msgs[0];
                  showNotify(latest.title || '日报系统', latest.content || '');
                }
              }).catch(function() {});
          }
          _lastUnreadCount = count;
          try { sessionStorage.setItem('msg_last_unread', count); } catch(e) {}
          updateBadge(count);
        }).catch(function() {});
    }
    poll();
    setInterval(poll, 1000);
  }

  // ===== 打开/关闭消息 =====
  window.openMessages = function() {
    var modal = document.getElementById('globalMessagesModal');
    var list = document.getElementById('globalMsgList');
    modal.style.display = 'flex';
    list.innerHTML = '<div style="text-align:center;padding:20px 0;color:var(--text3);font-size:13px">加载中...</div>';

    if (typeof API === 'undefined') { list.innerHTML = '<div style="text-align:center;padding:20px 0;color:var(--text3);font-size:13px">API 未配置</div>'; return; }

    fetch(API + '/api/messages', { credentials: 'include' })
      .then(function(r) { if (!r.ok) throw new Error(); return r.json(); })
      .then(function(d) {
        var msgs = d.data || d || [];
        if (!Array.isArray(msgs) || msgs.length === 0) {
          list.innerHTML = '<div style="text-align:center;padding:30px 0;color:var(--text3);font-size:13px"><i class="fa-solid fa-inbox" style="font-size:28px;opacity:0.3;margin-bottom:10px;display:block"></i>暂无消息</div>';
          return;
        }
        list.innerHTML = '';
        msgs.forEach(function(m) {
          var item = document.createElement('div');
          var isRead = m.is_read === 1 || m.is_read === true;
          var typeIcon = { info: 'fa-circle-info', warning: 'fa-triangle-exclamation', notice: 'fa-bell' }[m.type] || 'fa-circle-info';
          var typeColor = { info: '#60a5fa', warning: '#fbbf24', notice: '#4ade80' }[m.type] || '#60a5fa';
          item.style.cssText = 'padding:14px 0;border-bottom:1px solid var(--border2);cursor:pointer;transition:background 0.1s;border-radius:4px;padding-left:8px;padding-right:8px' + (isRead ? ';opacity:0.5' : '');
          item.onmouseenter = function() { item.style.background = 'var(--bg3)'; };
          item.onmouseleave = function() { item.style.background = 'transparent'; };
          item.onclick = function() { markAsRead(m.id, item); };
          item.innerHTML =
            '<div style="display:flex;align-items:flex-start;gap:10px">' +
            '<i class="fa-solid ' + typeIcon + '" style="color:' + typeColor + ';font-size:14px;margin-top:2px;flex-shrink:0"></i>' +
            '<div style="flex:1;min-width:0">' +
            '<div style="font-size:13px;font-weight:' + (isRead ? '400' : '600') + ';color:' + (isRead ? 'var(--text2)' : 'var(--text)') + '">' + (m.title || '') + '</div>' +
            (m.content ? '<div style="font-size:12px;color:var(--text2);margin-top:4px;line-height:1.4">' + m.content + '</div>' : '') +
            '<div style="font-size:10px;color:var(--text3);margin-top:4px">' + formatDate(m.created_at) + '</div>' +
            '</div>' +
            (!isRead ? '<span style="background:#f87171;width:6px;height:6px;border-radius:50%;flex-shrink:0;margin-top:6px"></span>' : '') +
            '</div>';
          list.appendChild(item);
        });
        updateMarkAllBtn();
      })
      .catch(function() {
        list.innerHTML = '<div style="text-align:center;padding:20px 0;color:var(--text3);font-size:13px">加载失败</div>';
      });
  };

  window.closeGlobalMessages = function() {
    document.getElementById('globalMessagesModal').style.display = 'none';
  };

  function markAsRead(id, item) {
    if (typeof API === 'undefined') return;
    fetch(API + '/api/messages/' + id + '/read', { method: 'PUT', credentials: 'include' })
      .then(function(r) { if (!r.ok) throw new Error(); return r.json(); })
      .then(function() {
        item.style.opacity = '0.5';
        var dot = item.querySelector('span[style*="background:#f87171"]');
        if (dot) dot.remove();
        var title = item.querySelector('div[style*="font-weight"]');
        if (title) { title.style.fontWeight = '400'; title.style.color = 'var(--text3)'; }
        fetchUnreadCount();
        updateMarkAllBtn();
      })
      .catch(function() {});
  }

  function formatDate(d) {
    if (!d) return '-';
    var date = new Date(d);
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  }

  // 点击遮罩层外部关闭
  document.addEventListener('click', function(e) {
    var msgModal = document.getElementById('globalMessagesModal');
    if (msgModal && msgModal.style.display === 'flex' && e.target === msgModal) {
      msgModal.style.display = 'none';
    }
  });

  // 全局 Toast（设置保存反馈）
  function showGlobalToast(msg) {
    var container = document.querySelector('.toast-container');
    if (!container) { container = document.createElement('div'); container.className = 'toast-container'; document.body.appendChild(container); }
    var toast = document.createElement('div'); toast.className = 'toast toast-success';
    toast.textContent = msg; container.appendChild(toast);
    setTimeout(function() { toast.style.opacity = '0'; setTimeout(function() { toast.remove(); }, 200); }, 3000);
  }
})();
