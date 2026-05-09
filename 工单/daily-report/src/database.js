const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4'
});

// 启动时检查数据库连接
(async () => {
  try {
    await pool.query('SELECT 1');
    console.log('数据库连接成功');
  } catch (err) {
    console.error('数据库连接失败:', err.message);
    if (process.env.NODE_ENV === 'production') process.exit(1);
  }
})();

module.exports = pool;
