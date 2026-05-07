require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

// 数据库连接检查（触发 database.js 中的 ping）
require('./database');

const engineersRouter = require('./routes/engineers');
const projectsRouter = require('./routes/projects');
const reportsRouter = require('./routes/reports');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date() });
});

// 路由
app.use('/api/engineers', engineersRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/reports', reportsRouter);

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
