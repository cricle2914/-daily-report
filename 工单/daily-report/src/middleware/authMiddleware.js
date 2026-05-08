module.exports = (requiredRole) => (req, res, next) => {
  if (!req.session?.user) {
    return req.path.startsWith('/api/')
      ? res.status(401).json({ success: false, message: '未登录' })
      : res.redirect('/login');
  }
  if (requiredRole && req.session.user.role !== requiredRole && req.session.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: '权限不足' });
  }
  next();
};

// 检查 viewer session 中间件
module.exports.viewerOrUser = (req, res, next) => {
  if (req.session?.viewer?.authed || req.session?.user) {
    return next();
  }
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ success: false, message: '未登录' });
  }
  res.redirect('/login');
};
