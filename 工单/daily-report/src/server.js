require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);

// 数据库连接检查（触发 database.js 中的 ping）
require('./database');

const engineersRouter = require('./routes/engineers');
const projectsRouter = require('./routes/projects');
const reportsRouter = require('./routes/reports');
const authRouter = require('./routes/auth');
const adminRouter = require('./routes/admin');
const leaderRouter = require('./routes/leader');

const app = express();
const PORT = process.env.PORT || 3000;

// Session 配置（使用 MySQL 持久化存储，pod 重启不丢失）
const sessionStore = new MySQLStore({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  createDatabaseTable: true,
  schema: {
    tableName: 'sessions',
    columnNames: {
      session_id: 'session_id',
      expires: 'expires',
      data: 'data'
    }
  }
});

app.use(session({
  secret: process.env.SESSION_SECRET || 'daily-report-secret',
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000 } // 8小时
}));

// 中间件
app.use(cors());
app.use(express.json());

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
app.use('/api/leader', leaderRouter);

// 登录页路由
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/login.html'));
});

// 管理侧页面（需验证登录——必须在通用静态之前，防止未登录直接访问）
const authMiddleware = require('./middleware/authMiddleware');
app.use('/admin', authMiddleware(), express.static(path.join(__dirname, '../public/admin')));

// 通用静态文件服务（放在 admin 之后，确保 admin 静态文件受 auth 保护）
app.use(express.static(path.join(__dirname, '../public')));

// 领导侧页面（前端 JS 自行处理 viewer 认证）
app.use('/leader', express.static(path.join(__dirname, '../public/leader')));

// 日报概览（React + Tailwind SPA）
app.get('/leader/overview', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/leader/overview.html'));
});

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
