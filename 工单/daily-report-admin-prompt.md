# 日报系统管理侧开发任务

## 你的角色
你是一个全栈开发工程师，负责在现有项目基础上新增管理后台。
**只写代码，不解释，不询问，遇到细节自己做合理判断。**

---

## 项目现状

技术栈：Node.js + Express + MySQL + 原生 HTML/CSS/JS（无任何框架）
数据库名：`daily_report`
已有文件结构：
```
daily-report/
  public/
    app.js          ← 工程师侧前端JS
    index.html      ← 工程师侧入口
    style.css       ← 工程师侧样式
  src/
    routes/         ← 现有路由文件夹
    database.js     ← 数据库连接
    server.js       ← Express 入口
  k8s/
  tekton/
  Dockerfile
  package.json
```

---

## 第一步：执行以下 SQL（在开始写代码前先确认已执行）

```sql
-- 补充 engineers 字段
ALTER TABLE engineers 
  ADD COLUMN `phone` varchar(20) DEFAULT NULL AFTER `abbr`,
  ADD COLUMN `email` varchar(100) DEFAULT NULL AFTER `phone`,
  ADD COLUMN `status` enum('active','inactive') DEFAULT 'active' AFTER `email`;

-- 账户表
CREATE TABLE `accounts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `username` varchar(50) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `role` enum('admin','leader') NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

## 第二步：安装依赖

```bash
npm install express-session bcrypt
```

---

## 第三步：生成初始管理员账户

运行以下命令生成密码 hash，然后插入数据库：

```bash
node -e "const b=require('bcrypt');b.hash('admin123',10).then(h=>console.log(h))"
```

```sql
INSERT INTO accounts (username, password_hash, role) 
VALUES ('admin', '上面生成的hash', 'admin');
```

---

## 需要新增的文件

```
public/
  login.html              ← 登录页（admin 和 leader 共用）
  login.css
  admin/
    index.html            ← 仪表盘
    engineers.html        ← 员工列表
    engineer-edit.html    ← 员工新建/编辑
    projects.html         ← 项目列表
    project-edit.html     ← 项目新建/编辑
    reports.html          ← 日报列表
    report-edit.html      ← 日报编辑
    accounts.html         ← 账户管理
    admin.css             ← 管理侧样式
    admin.js              ← 管理侧公共JS
src/
  routes/
    auth.js               ← 登录/登出路由
    admin.js              ← 所有 /admin/* API 路由
  middleware/
    authMiddleware.js     ← session 验证中间件
```

---

## 数据库完整表结构（供参考）

```sql
engineers(id, name, abbr, phone, email, status, created_at)
projects(id, name, order_no, customer, contact_name, contact_phone,
         product_version, install_address, manufacturer, agent,
         tech_lead, service_manager, created_by, created_at)
engineer_projects(id, engineer_id, project_id, impl_days, joined_at)
daily_reports(id, engineer_id, project_id, report_date, impl_day,
              plan_title, tasks[json], progress, status[complete/ongoing/blocked],
              issues, next_plan, submitted_at)
tomorrow_plans(id, engineer_id, report_date,
               destination[existing_project/new_project/back_to_office/other],
               project_id, new_project_customer, new_project_name,
               new_project_order, new_project_contact, new_project_phone,
               new_project_version, new_project_address, other_reason, created_at)
work_hours(id, engineer_id, project_id, report_date, hours, created_at)
accounts(id, username, password_hash, role[admin/leader], created_at)
```

---

## 路由规划

### 认证路由（auth.js）
```
GET  /login              → 返回 login.html
POST /api/auth/login     → 验证账户，写 session，按 role 返回跳转地址
POST /api/auth/logout    → 销毁 session
GET  /api/auth/me        → 返回当前登录用户信息
```

### 管理侧页面路由（server.js 里加，静态文件服务）
```
GET /admin/              → public/admin/index.html
GET /admin/*             → public/admin/ 下对应文件
```
所有 `/admin/*` 页面请求在 server.js 中加中间件验证 session，未登录重定向到 /login

### 管理侧 API 路由（admin.js）

**员工**
```
GET    /api/admin/engineers              → 员工列表
GET    /api/admin/engineers/:id          → 员工详情（含项目列表、最近5条日报）
POST   /api/admin/engineers              → 新建员工
PUT    /api/admin/engineers/:id          → 更新员工
DELETE /api/admin/engineers/:id          → 软删除（status=inactive）
```

**项目**
```
GET    /api/admin/projects               → 项目列表（含当前实施工程师）
GET    /api/admin/projects/:id           → 项目详情
POST   /api/admin/projects               → 新建项目
PUT    /api/admin/projects/:id           → 更新项目
POST   /api/admin/projects/:id/engineers → 给项目添加工程师
DELETE /api/admin/projects/:id/engineers/:eid → 移除工程师
```

**日报**
```
GET    /api/admin/reports                → 日报列表，支持参数：engineer_id, project_id, date_from, date_to
GET    /api/admin/reports/:id            → 日报详情
PUT    /api/admin/reports/:id            → 更新日报（plan_title/tasks/progress/status/issues/next_plan）
```

**账户**
```
GET    /api/admin/accounts               → 账户列表
POST   /api/admin/accounts               → 新建账户
PUT    /api/admin/accounts/:id/password  → 重置密码
DELETE /api/admin/accounts/:id           → 删除账户（不能删自己）
```

**仪表盘**
```
GET    /api/admin/dashboard              → 返回：今日提交人数、应提交人数、在外实施人数、近7天提交数组
```

---

## 前端页面详细说明

### 通用布局（所有 admin 页面）
- 左侧固定导航栏，宽 220px，黑色背景
- 导航项：仪表盘 / 员工管理 / 项目管理 / 日报管理 / 账户管理
- 当前页导航项高亮
- 右上角显示登录用户名 + 退出按钮
- 主内容区右侧，带 padding

### login.html
- 居中卡片，用户名+密码输入框，登录按钮
- 登录失败显示错误提示
- 登录成功按返回的 redirect 地址跳转

### 仪表盘 index.html
- 顶部4个统计卡片：今日已提交 / 今日未提交 / 在外实施人数 / 本月累计工时
- 今日未提交工程师名单列表（红色标注）
- 近7天每日提交数量（纯数字+简单柱状，用 div 宽度模拟，不用图表库）

### 员工管理 engineers.html
- 表格列：姓名、缩写、电话、邮箱、状态、操作（编辑/删除）
- 顶部"新建员工"按钮
- 状态筛选：全部 / 在职 / 离职

### 员工编辑 engineer-edit.html
- 新建和编辑复用同一页面，通过 URL 参数 ?id=xxx 区分
- 字段：姓名、缩写、电话、邮箱、状态
- 页面下方展示该员工参与的项目列表（只读）
- 页面下方展示最近5条日报摘要（只读，点击跳到日报编辑页）

### 项目管理 projects.html
- 表格列：项目名、客户、工单号、当前工程师（头像缩写气泡）、操作
- 顶部"新建项目"按钮

### 项目编辑 project-edit.html
- 字段：项目名、工单号、客户名、联系人、联系电话、产品版本、
        安装地址、厂商、代理商、技术负责人、服务经理
- 下方：已分配工程师列表（可移除）+ 添加工程师下拉框

### 日报管理 reports.html
- 顶部筛选：工程师下拉、项目下拉、开始日期、结束日期、查询按钮
- 表格列：日期、工程师、项目、进度%、状态、提交时间、操作（编辑）
- 状态用色点标注：完成=绿、进行中=橙、受阻=红

### 日报编辑 report-edit.html
- 顶部只读显示：工程师、项目、日期
- 可编辑字段：
  - 今日计划标题（plan_title）
  - 工作内容（tasks，JSON数组，渲染为动态列表，可增删条目）
  - 进度（0-100 滑块）
  - 状态（完成/进行中/受阻，三个按钮选择）
  - 问题与风险（issues）
  - 下一步计划（next_plan）

### 账户管理 accounts.html
- 表格列：用户名、角色、创建时间、操作（删除/重置密码）
- 顶部"新建账户"按钮
- 新建表单：用户名、密码、角色（admin/leader）
- 重置密码：点击后弹出输入新密码的 inline 表单

---

## 前端视觉风格

与工程师侧保持一致的黑色主题：
```css
--bg: #000000;
--bg-card: #1a1a1a;
--bg-hover: #222222;
--text-primary: #ffffff;
--text-secondary: #888888;
--accent: #4f8ef7;
--danger: #ff4444;
--success: #44cc77;
--warning: #ffaa00;
--border: #333333;
--radius: 12px;
```
- 字体：`'SF Pro Display', 'PingFang SC', system-ui, sans-serif`
- 卡片：bg-card 背景，border 边框，radius 圆角
- 表格行 hover：bg-hover
- 主操作按钮：白底黑字，圆角
- 危险操作：红色边框透明背景
- 所有数据交互用 fetch + JSON，不用传统 form submit
- 加载状态：按钮变灰 + 文字改为"处理中..."

---

## 技术要求

- session 配置（server.js 里加）：
```javascript
const session = require('express-session');
app.use(session({
  secret: process.env.SESSION_SECRET || 'daily-report-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000 } // 8小时
}));
```

- authMiddleware.js：
```javascript
module.exports = (requiredRole) => (req, res, next) => {
  if (!req.session?.user) {
    return req.path.startsWith('/api/') 
      ? res.status(401).json({ success: false, message: '未登录' })
      : res.redirect('/login');
  }
  if (requiredRole && req.session.user.role !== requiredRole) {
    return res.status(403).json({ success: false, message: '权限不足' });
  }
  next();
};
```

- 所有 API 统一响应格式：
```javascript
// 成功
{ success: true, data: ... }
// 失败
{ success: false, message: '错误描述' }
```

- tasks 字段格式：
```json
[{"content": "任务描述1"}, {"content": "任务描述2"}]
```

- 密码用 bcrypt，saltRounds = 10

---

## 注意事项

1. 不要动现有工程师侧的任何文件（public/index.html、public/app.js、public/style.css、现有路由）
2. database.js 已有数据库连接，直接 require 复用，不要重新创建连接
3. 软删除员工时检查：该工程师是否有进行中的项目，如有则提示不能删除
4. 日报的 impl_day 字段管理侧编辑时不修改
5. 删除账户时检查：不能删除当前登录账户自己
