# 实施工程师日报系统 — 完整开发与部署文档 v4

> 供 Claude Code 在 Windows 本地直接实现。请完整实现所有模块，不要省略。

---

## 整体架构

```
┌─────────────────────────────────────────────────────┐
│  Windows 本地                                        │
│  Claude Code 写代码 ──► git push ──► GitHub          │
└─────────────────────────────────────────────────────┘
                              │
                    GitHub Webhook / Tekton Trigger
                              │
┌─────────────────────────────────────────────────────┐
│  K8s 集群（虚拟机 kubeadm）                           │
│                                                      │
│  Tekton Pipeline                                     │
│    └─ 拉代码 → docker build → push 到内网 registry   │
│                                                      │
│  ArgoCD                                              │
│    └─ 监听 GitHub k8s/ 目录 → 自动 apply 到集群       │
│                                                      │
│  namespace: daily-report                             │
│    ├─ Deployment: daily-report-app (Node.js)         │
│    └─ StatefulSet: mysql                             │
└─────────────────────────────────────────────────────┘
```

---

## 目录结构（CC 需要创建的完整结构）

```
daily-report/
├── src/
│   ├── server.js
│   ├── database.js
│   └── routes/
│       ├── engineers.js
│       ├── projects.js
│       └── reports.js
├── public/
│   ├── index.html
│   ├── style.css
│   └── app.js
├── k8s/
│   ├── namespace.yaml
│   ├── configmap.yaml
│   ├── secret.yaml.example
│   ├── mysql.yaml
│   ├── app-deployment.yaml
│   ├── app-service.yaml
│   └── ingress.yaml
├── tekton/
│   ├── pipeline.yaml
│   ├── task-clone.yaml
│   ├── task-build-push.yaml
│   └── trigger.yaml
├── init.sql
├── Dockerfile
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

---

## 一、应用代码

### `.gitignore`
```
node_modules/
.env
*.log
```

### `.env.example`
```env
PORT=3000
NODE_ENV=development
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=reporter
DB_PASSWORD=reporter123
DB_NAME=daily_report
```

### `package.json`
```json
{
  "name": "daily-report",
  "version": "1.0.0",
  "main": "src/server.js",
  "scripts": {
    "start": "node src/server.js",
    "dev": "nodemon src/server.js"
  },
  "dependencies": {
    "express": "^4.18.0",
    "mysql2": "^3.6.0",
    "cors": "^2.8.5",
    "dotenv": "^16.0.0"
  },
  "devDependencies": {
    "nodemon": "^3.0.0"
  }
}
```

### `Dockerfile`
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY src/ ./src/
COPY public/ ./public/

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "src/server.js"]
```

---

## 二、数据库

### `init.sql`

在 K8s 中由 MySQL 的 initContainer 或启动后手动执行。

```sql
SET NAMES utf8mb4;

CREATE DATABASE IF NOT EXISTS daily_report
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'reporter'@'%' IDENTIFIED BY 'reporter123';
GRANT ALL PRIVILEGES ON daily_report.* TO 'reporter'@'%';
FLUSH PRIVILEGES;

USE daily_report;

CREATE TABLE IF NOT EXISTS engineers (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(50) NOT NULL UNIQUE,
  abbr VARCHAR(10) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS projects (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(200) NOT NULL,
  order_no VARCHAR(50),
  customer VARCHAR(100) NOT NULL,
  contact_name VARCHAR(50),
  contact_phone VARCHAR(20),
  product_version VARCHAR(50),
  install_address VARCHAR(500),
  created_by INT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES engineers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS engineer_projects (
  id INT PRIMARY KEY AUTO_INCREMENT,
  engineer_id INT NOT NULL,
  project_id INT NOT NULL,
  impl_days INT DEFAULT 0,
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_eng_proj (engineer_id, project_id),
  FOREIGN KEY (engineer_id) REFERENCES engineers(id),
  FOREIGN KEY (project_id) REFERENCES projects(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS daily_reports (
  id INT PRIMARY KEY AUTO_INCREMENT,
  engineer_id INT NOT NULL,
  project_id INT NOT NULL,
  report_date DATE NOT NULL,
  impl_day INT NOT NULL,
  plan_title VARCHAR(500) NOT NULL,
  tasks JSON NOT NULL,
  progress TINYINT NOT NULL,
  status ENUM('complete','ongoing','blocked') NOT NULL,
  issues TEXT,
  submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_report (engineer_id, project_id, report_date),
  FOREIGN KEY (engineer_id) REFERENCES engineers(id),
  FOREIGN KEY (project_id) REFERENCES projects(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tomorrow_plans (
  id INT PRIMARY KEY AUTO_INCREMENT,
  engineer_id INT NOT NULL,
  report_date DATE NOT NULL,
  destination ENUM('existing_project','new_project','back_to_office','other') NOT NULL,
  project_id INT,
  new_project_customer VARCHAR(100),
  new_project_name VARCHAR(200),
  new_project_order VARCHAR(50),
  new_project_contact VARCHAR(50),
  new_project_phone VARCHAR(20),
  new_project_version VARCHAR(50),
  new_project_address VARCHAR(500),
  other_reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_tomorrow (engineer_id, report_date),
  FOREIGN KEY (engineer_id) REFERENCES engineers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 种子数据
INSERT IGNORE INTO engineers (name, abbr) VALUES
('王涛', '王'), ('张宏洋', '张'), ('周继成', '周'), ('张学龙', '张');

INSERT IGNORE INTO projects
  (name, order_no, customer, contact_name, contact_phone, product_version, install_address, created_by)
VALUES
  ('清科管理·AnyShare部署', '00725547', '清科管理', '张老师', '18612726926',
   'AS7066', '北京市朝阳区霄云路40号院1号楼国航世纪大厦21层', 1);

INSERT IGNORE INTO engineer_projects (engineer_id, project_id, impl_days)
SELECT e.id, p.id, 11
FROM engineers e, projects p
WHERE e.name IN ('王涛','张宏洋','周继成') AND p.order_no = '00725547';
```

---

## 三、后端 API

### `src/database.js`

使用 `mysql2/promise` 连接池，读取环境变量。
启动时执行 ping 测试，连接失败则打印错误并退出。

```js
// 连接池参考配置
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
// 导出 pool，供 routes 使用
```

### `src/server.js`

- 加载 dotenv
- 挂载路由：`/api/engineers`、`/api/projects`、`/api/reports`
- `GET /health` 返回 `{ status: 'ok', time: new Date() }`
- 静态文件：`public/` 目录
- 全局错误处理中间件
- 启动打印：`服务已启动 http://localhost:PORT`

### API 接口一览

统一返回：
```json
{ "success": true, "data": ... }
{ "success": false, "error": "描述" }
```

#### `GET /api/engineers/search?name=王`
模糊搜索，返回：
```json
[{ "id": 1, "name": "王涛", "abbr": "王", "project_count": 2 }]
```

#### `GET /api/engineers/:id/projects`
该工程师名下所有项目（含 impl_days）：
```json
[{
  "id": 1, "name": "清科管理·AnyShare部署",
  "order_no": "00725547", "customer": "清科管理",
  "contact_name": "张老师", "contact_phone": "18612726926",
  "product_version": "AS7066", "install_address": "...",
  "impl_days": 11
}]
```

#### `POST /api/projects`
新建项目并关联工程师。必填：`engineer_id`、`name`、`customer`。
后端自动写入 `engineer_projects`，impl_days=0。

#### `POST /api/reports`
提交日报。后端自动计算 `impl_day`（该工程师该项目历史条数+1），同步 +1 `engineer_projects.impl_days`。
同一工程师同一项目同一天重复提交返回 400。
```json
{
  "engineer_id": 1, "project_id": 1,
  "plan_title": "AS7升级验证", "tasks": ["任务1","任务2"],
  "progress": 80, "status": "complete", "issues": "无"
}
```

#### `POST /api/reports/tomorrow`
提交明日去向，四种 destination：
- `existing_project`：需传 `project_id`
- `new_project`：需传 `new_project_customer`、`new_project_name`（后端自动创建项目并关联）
- `back_to_office`：无额外字段
- `other`：需传 `other_reason`

重复提交同一天返回 400。

#### `GET /api/reports/stats/tomorrow?date=2026-05-07`
返回次日人员分布统计：
```json
{
  "date": "2026-05-08",
  "total_engineers": 4,
  "in_project": 2,
  "back_to_office": 1,
  "unavailable": 0,
  "pending": 1,
  "details": {
    "in_project": [{ "engineer_name": "王涛", "project_name": "清科管理·AnyShare部署" }],
    "back_to_office": [{ "engineer_name": "张宏洋" }],
    "unavailable": [],
    "pending": [{ "engineer_name": "周继成" }]
  }
}
```

---

## 四、前端（`public/`）

单页应用，三页面 JS 切换，不刷新。

### 视觉规范
- 主色 `#534AB7`，移动端优先，最大宽度 480px 居中
- 顶部固定栏：头像（取姓）+ 工程师名 + 步骤标签
- 全部 font-size ≥ 16px，可点击区域 min-height 44px
- 圆角：组件 8px / 卡片 12px

### Page 1 — 选工程师 & 选项目
- 输入框实时搜索（`/api/engineers/search`），下拉列表
- 选中工程师后加载其项目列表（`/api/engineers/:id/projects`）
- 项目卡片：默认折叠（名称+工单+天数+折叠箭头），展开显示客户/联系人/版本/地址
- 单选项目，选中后卡片边框变紫色
- 列表底部：虚线"+ 新建项目"→ 底部抽屉 Modal（字段：客户名*、项目名*、工单、联系人、电话、版本、地址）
- 项目选中后出现"填写今日日报 →"按钮

### Page 2 — 填写日报
- 顶部折叠卡片：默认折叠显示项目名+天数，可展开查看详情
- 表单：今日计划（必填）/ 工作内容（动态列表，至少1条）/ 进度滑块0-100+三态按钮（完成绿/进行中橙/有阻碍红）/ 遗留问题
- 底部：← 返回 + 提交日报（调 `POST /api/reports`，成功跳 Page3）

### Page 3 — 明日去向
- 顶部绿色成功条（项目名·天数·进度摘要）
- 四选项 2×2 网格：已有项目（紫）/ 新项目（蓝）/ 回公司（绿）/ 其他（橙）
- 点击卡片高亮，展开对应面板：
  - 已有项目：列表单选
  - 新项目：表单（客户名*、项目名*、工单、联系人、电话、版本、地址）
  - 回公司：绿色提示条，无需填写
  - 其他：文本框填原因
- "确认提交并完成"→ 调 `POST /api/reports/tomorrow`
- 完成界面：四格统计（调 `GET /api/reports/stats/tomorrow`）+ "感谢提交，领导端已实时更新"

### 前端工具函数（必须封装）
```js
// 统一 fetch 处理：loading状态 + 错误alert
async function request(url, options = {}) { ... }

// 页面切换
function showPage(pageId) { ... }

// 短暂提示
function showToast(msg) { ... }
```

---

## 五、K8s 配置（`k8s/`）

### `k8s/namespace.yaml`
```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: daily-report
```

### `k8s/configmap.yaml`
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: daily-report-config
  namespace: daily-report
data:
  NODE_ENV: "production"
  PORT: "3000"
  DB_HOST: "mysql-service"
  DB_PORT: "3306"
  DB_NAME: "daily_report"
```

### `k8s/secret.yaml.example`
```yaml
# 复制为 secret.yaml，填入 base64 值后执行
# 生成方式：echo -n 'your_value' | base64
apiVersion: v1
kind: Secret
metadata:
  name: daily-report-secret
  namespace: daily-report
type: Opaque
data:
  DB_USER: cmVwb3J0ZXI=        # reporter
  DB_PASSWORD: cmVwb3J0ZXIxMjM=  # reporter123
  MYSQL_ROOT_PASSWORD: cm9vdDEyMw==  # root123
```

### `k8s/mysql.yaml`
```yaml
apiVersion: v1
kind: Service
metadata:
  name: mysql-service
  namespace: daily-report
spec:
  selector:
    app: mysql
  ports:
  - port: 3306
    targetPort: 3306
  clusterIP: None   # Headless service，StatefulSet 用
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: mysql
  namespace: daily-report
spec:
  serviceName: mysql-service
  replicas: 1
  selector:
    matchLabels:
      app: mysql
  template:
    metadata:
      labels:
        app: mysql
    spec:
      containers:
      - name: mysql
        image: mysql:8.0
        ports:
        - containerPort: 3306
        env:
        - name: MYSQL_ROOT_PASSWORD
          valueFrom:
            secretKeyRef:
              name: daily-report-secret
              key: MYSQL_ROOT_PASSWORD
        - name: MYSQL_DATABASE
          value: daily_report
        - name: MYSQL_USER
          valueFrom:
            secretKeyRef:
              name: daily-report-secret
              key: DB_USER
        - name: MYSQL_PASSWORD
          valueFrom:
            secretKeyRef:
              name: daily-report-secret
              key: DB_PASSWORD
        args:
        - --character-set-server=utf8mb4
        - --collation-server=utf8mb4_unicode_ci
        volumeMounts:
        - name: mysql-data
          mountPath: /var/lib/mysql
        - name: init-sql
          mountPath: /docker-entrypoint-initdb.d
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "500m"
        livenessProbe:
          exec:
            command: ["mysqladmin", "ping", "-h", "localhost"]
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          exec:
            command: ["mysql", "-u", "root", "-p$(MYSQL_ROOT_PASSWORD)", "-e", "SELECT 1"]
          initialDelaySeconds: 10
          periodSeconds: 5
      volumes:
      - name: mysql-data
        emptyDir: {}   # 注意：Pod 重启数据丢失，仅用于开发阶段
      - name: init-sql
        configMap:
          name: mysql-init-sql
---
# 把 init.sql 内容放入 ConfigMap，MySQL 启动时自动执行
apiVersion: v1
kind: ConfigMap
metadata:
  name: mysql-init-sql
  namespace: daily-report
data:
  init.sql: |
    # init.sql 的完整内容在此处内联
    # CC 实现时请将 init.sql 文件内容完整复制到这里
```

### `k8s/app-deployment.yaml`
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: daily-report-app
  namespace: daily-report
spec:
  replicas: 2
  selector:
    matchLabels:
      app: daily-report
  template:
    metadata:
      labels:
        app: daily-report
    spec:
      containers:
      - name: app
        image: YOUR_REGISTRY_IP:PORT/daily-report:latest  # 替换为实际地址
        ports:
        - containerPort: 3000
        envFrom:
        - configMapRef:
            name: daily-report-config
        - secretRef:
            name: daily-report-secret
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 15
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
        resources:
          requests:
            memory: "128Mi"
            cpu: "100m"
          limits:
            memory: "256Mi"
            cpu: "500m"
```

### `k8s/app-service.yaml`
```yaml
apiVersion: v1
kind: Service
metadata:
  name: daily-report-service
  namespace: daily-report
spec:
  selector:
    app: daily-report
  ports:
  - port: 80
    targetPort: 3000
  type: ClusterIP
```

### `k8s/ingress.yaml`
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: daily-report-ingress
  namespace: daily-report
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  ingressClassName: nginx
  rules:
  - host: report.local    # 替换为实际域名或在 hosts 文件中配置
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: daily-report-service
            port:
              number: 80
```

---

## 六、Tekton CI（`tekton/`）

> Tekton 安装：`kubectl apply -f https://storage.googleapis.com/tekton-releases/pipeline/latest/release.yaml`
> Tekton Triggers 安装：`kubectl apply -f https://storage.googleapis.com/tekton-releases/triggers/latest/release.yaml`

### `tekton/task-clone.yaml`
```yaml
# 使用官方 git-clone Task，从 Tekton Hub 安装
# kubectl apply -f https://api.hub.tekton.dev/v1/resource/tekton/task/git-clone/0.9/raw
# 不需要手写，直接 apply 官方的
```

### `tekton/task-build-push.yaml`
```yaml
apiVersion: tekton.dev/v1beta1
kind: Task
metadata:
  name: build-and-push
  namespace: tekton-pipelines
spec:
  params:
  - name: image
    description: 完整镜像地址，如 192.168.1.100:5000/daily-report
  - name: tag
    description: 镜像 tag
    default: latest
  workspaces:
  - name: source
    description: 代码目录
  steps:
  - name: build-push
    image: gcr.io/kaniko-project/executor:latest   # kaniko 不需要 Docker daemon
    args:
    - --dockerfile=Dockerfile
    - --context=$(workspaces.source.path)
    - --destination=$(params.image):$(params.tag)
    - --insecure          # 内网 registry 无 TLS 时加此参数
    - --skip-tls-verify   # 同上
```

### `tekton/pipeline.yaml`
```yaml
apiVersion: tekton.dev/v1beta1
kind: Pipeline
metadata:
  name: daily-report-pipeline
  namespace: tekton-pipelines
spec:
  params:
  - name: repo-url
    default: https://github.com/YOUR_USERNAME/daily-report   # 替换
  - name: image
    default: YOUR_REGISTRY_IP:PORT/daily-report              # 替换
  - name: tag
    default: latest
  workspaces:
  - name: shared-workspace
  tasks:
  - name: clone
    taskRef:
      name: git-clone
    workspaces:
    - name: output
      workspace: shared-workspace
    params:
    - name: url
      value: $(params.repo-url)
  - name: build-push
    taskRef:
      name: build-and-push
    runAfter: [clone]
    workspaces:
    - name: source
      workspace: shared-workspace
    params:
    - name: image
      value: $(params.image)
    - name: tag
      value: $(params.tag)
```

### `tekton/trigger.yaml`
```yaml
# GitHub Webhook → Tekton EventListener → 触发 Pipeline
apiVersion: triggers.tekton.dev/v1beta1
kind: EventListener
metadata:
  name: daily-report-listener
  namespace: tekton-pipelines
spec:
  triggers:
  - name: github-push
    interceptors:
    - ref:
        name: github
      params:
      - name: secretRef
        value:
          secretName: github-webhook-secret
          secretKey: secret
      - name: eventTypes
        value: [push]
    bindings:
    - ref: daily-report-binding
    template:
      ref: daily-report-template
---
apiVersion: triggers.tekton.dev/v1beta1
kind: TriggerBinding
metadata:
  name: daily-report-binding
  namespace: tekton-pipelines
spec:
  params:
  - name: git-repo-url
    value: $(body.repository.clone_url)
---
apiVersion: triggers.tekton.dev/v1beta1
kind: TriggerTemplate
metadata:
  name: daily-report-template
  namespace: tekton-pipelines
spec:
  params:
  - name: git-repo-url
  resourcetemplates:
  - apiVersion: tekton.dev/v1beta1
    kind: PipelineRun
    metadata:
      generateName: daily-report-run-
      namespace: tekton-pipelines
    spec:
      pipelineRef:
        name: daily-report-pipeline
      workspaces:
      - name: shared-workspace
        volumeClaimTemplate:
          spec:
            accessModes: [ReadWriteOnce]
            resources:
              requests:
                storage: 1Gi
      params:
      - name: repo-url
        value: $(tt.params.git-repo-url)
```

---

## 七、README.md（完整版）

```markdown
# 实施工程师日报系统

## 架构
Windows(CC开发) → GitHub → Tekton(CI build镜像) → ArgoCD(CD部署) → K8s集群

## 第一步：Windows 本地开发

### 前置
- Node.js 18+
- Git

### 本地测试（需要本地 MySQL）
cp .env.example .env    # 配置本地数据库
npm install
npm run dev
# 访问 http://localhost:3000

## 第二步：推送到 GitHub
git init
git remote add origin https://github.com/YOUR_USERNAME/daily-report
git add .
git commit -m "init"
git push -u origin main

## 第三步：K8s 集群初始化（PowerShell + kubectl）

### 3.1 安装 Tekton
kubectl apply -f https://storage.googleapis.com/tekton-releases/pipeline/latest/release.yaml
kubectl apply -f https://storage.googleapis.com/tekton-releases/triggers/latest/release.yaml
kubectl apply -f https://api.hub.tekton.dev/v1/resource/tekton/task/git-clone/0.9/raw

### 3.2 安装 ArgoCD
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# 获取 ArgoCD 初始密码
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d

# 暴露 ArgoCD UI（NodePort）
kubectl patch svc argocd-server -n argocd -p '{"spec": {"type": "NodePort"}}'

### 3.3 部署应用
# 修改 k8s/secret.yaml.example → k8s/secret.yaml（填入真实 base64 值）
# 修改 k8s/app-deployment.yaml 中的镜像地址
# 修改 k8s/ingress.yaml 中的域名

kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/secret.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/mysql.yaml
kubectl apply -f k8s/app-deployment.yaml
kubectl apply -f k8s/app-service.yaml
kubectl apply -f k8s/ingress.yaml

### 3.4 配置 Tekton
# 修改 tekton/ 中的 registry 地址和 GitHub 仓库地址
kubectl apply -f tekton/

### 3.5 配置 ArgoCD 监听 GitHub
# 在 ArgoCD UI 中创建 Application：
# - Source: https://github.com/YOUR_USERNAME/daily-report  Path: k8s/
# - Destination: 集群内 namespace: daily-report
# - Sync Policy: Automatic

## 日常开发流程
CC 改代码 → git push → Tekton 自动 build → ArgoCD 自动部署 → 完成

## 查看状态（PowerShell）
kubectl get all -n daily-report
kubectl logs -n daily-report -l app=daily-report
kubectl get pods -n tekton-pipelines
```

---

## 八、给 Claude Code 的执行指令

**在 Windows PowerShell 中，进入项目目录后执行：**

```
claude "@daily-report-spec-v4.md 请按照这份文档完整实现工程师日报系统。

实现顺序：
1. 创建完整目录结构和所有文件
2. init.sql（数据库建表+种子数据）
3. package.json + Dockerfile + .gitignore + .env.example
4. src/database.js（mysql2连接池）
5. src/routes/engineers.js（搜索+项目列表）
6. src/routes/projects.js（新建项目）
7. src/routes/reports.js（提交日报+明日去向+统计）
8. src/server.js（组装+/health接口）
9. public/style.css（移动端样式，主色#534AB7）
10. public/index.html（三页面骨架）
11. public/app.js（完整交互逻辑）
12. k8s/ 目录所有 yaml 文件（注意把 init.sql 内容内联到 mysql-init-sql ConfigMap）
13. tekton/ 目录所有 yaml 文件
14. README.md

注意：
- 全程中文注释
- 前端纯原生JS，禁止任何框架
- k8s/app-deployment.yaml 镜像地址占位符写 YOUR_REGISTRY/daily-report:latest
- tekton/ 中 GitHub 仓库地址占位符写 YOUR_GITHUB_USERNAME"
```

---

## 九、部署后需要手动替换的占位符

| 文件 | 占位符 | 替换为 |
|------|--------|--------|
| `k8s/app-deployment.yaml` | `YOUR_REGISTRY_IP:PORT/daily-report:latest` | 你的内网 registry 地址 |
| `k8s/ingress.yaml` | `report.local` | 实际域名或IP |
| `k8s/secret.yaml` | base64 值 | 实际密码的 base64 |
| `tekton/pipeline.yaml` | `YOUR_REGISTRY_IP:PORT/daily-report` | 你的内网 registry 地址 |
| `tekton/trigger.yaml` | GitHub webhook secret | 自定义一个字符串 |
| `README.md` | `YOUR_USERNAME` | 你的 GitHub 用户名 |
