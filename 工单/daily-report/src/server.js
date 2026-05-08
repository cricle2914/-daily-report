require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');

// 数据库连接检查（触发 database.js 中的 ping）
require('./database');

const engineersRouter = require('./routes/engineers');
const projectsRouter = require('./routes/projects');
const reportsRouter = require('./routes/reports');
const authRouter = require('./routes/auth');
const adminRouter = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

// Session 配置
app.use(session({
  secret: process.env.SESSION_SECRET || 'daily-report-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000 } // 8小时
}));

// 中间件
app.use(cors());
app.use(express.json());

// 静态文件服务
app.use(express.static(path.join(__dirname, '../public')));

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date() });
});

// 路由
app.use('/api/engineers', engineersRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);

// 登录页路由
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/login.html'));
});

// 管理侧页面（需验证登录）
const authMiddleware = require('./middleware/authMiddleware');
app.use('/admin', authMiddleware(), express.static(path.join(__dirname, '../public/admin')));

// 全局错误处理
app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  res.status(500).json({
    success: false,
    error: err.message || '服务器内部错误'
  });
});

app.listen(PORT, () => {
  console.log(`服务已启动 http://localhost:${PORT}`);
});
