# 实施工程师日报系统

实施工程师每日工作汇报系统，支持移动端浏览器访问。

## 架构

```
Windows(CC 开发) → GitHub → Tekton(CI build 镜像) → ArgoCD(CD 部署) → K8s 集群
```

## 第一步：Windows 本地开发

### 前置条件
- Node.js 18+
- Git

### 本地测试（需要本地 MySQL）

```bash
cp .env.example .env    # 配置本地数据库
npm install
npm run dev             # 启动开发服务器 http://localhost:3000
```

## 第二步：推送到 GitHub

```bash
git init
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/daily-report
git add .
git commit -m "init: 实施工程师日报系统"
git push -u origin main
```

## 第三步：K8s 集群初始化

### 3.1 安装 Tekton

```bash
kubectl apply -f https://storage.googleapis.com/tekton-releases/pipeline/latest/release.yaml
kubectl apply -f https://storage.googleapis.com/tekton-releases/triggers/latest/release.yaml
kubectl apply -f https://api.hub.tekton.dev/v1/resource/tekton/task/git-clone/0.9/raw
```

### 3.2 安装 ArgoCD

```bash
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# 获取 ArgoCD 初始密码
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d

# 暴露 ArgoCD UI
kubectl patch svc argocd-server -n argocd -p '{"spec": {"type": "NodePort"}}'
```

### 3.3 部署应用

```bash
# 1. 配置密钥
cp k8s/secret.yaml.example k8s/secret.yaml
# 修改 k8s/secret.yaml 中的 base64 值为实际密码

# 2. 部署
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/secret.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/mysql.yaml
kubectl apply -f k8s/app-deployment.yaml
kubectl apply -f k8s/app-service.yaml
kubectl apply -f k8s/ingress.yaml
```

### 3.4 配置 Tekton

```bash
# 修改 tekton/pipeline.yaml 中的 registry 地址和 GitHub 仓库地址
kubectl apply -f tekton/
```

### 3.5 配置 ArgoCD 监听 GitHub

在 ArgoCD UI 中创建 Application：

- **Source**: https://github.com/YOUR_GITHUB_USERNAME/daily-report
- **Path**: k8s/
- **Destination**: namespace: daily-report
- **Sync Policy**: Automatic

## 日常开发流程

```
修改代码 → git push → Tekton 自动 build → ArgoCD 自动部署 → 完成
```

## 查看状态

```bash
kubectl get all -n daily-report
kubectl logs -n daily-report -l app=daily-report
kubectl get pods -n tekton-pipelines
```

## 需要手动替换的占位符

| 文件 | 占位符 | 替换为 |
|------|--------|--------|
| k8s/app-deployment.yaml | 11.0.1.128:5000/daily-report:latest | 你的内网 registry 地址 |
| k8s/ingress.yaml | report.local | 实际域名或 hosts 配置 |
| k8s/secret.yaml | base64 值 | 实际密码的 base64 |
| tekton/pipeline.yaml | 11.0.1.128:5000/daily-report | 你的内网 registry 地址 |
| tekton/pipeline.yaml | YOUR_GITHUB_USERNAME | 你的 GitHub 用户名 |
| tekton/trigger.yaml | github-webhook-secret | 自定义 webhook secret |
| README.md | YOUR_GITHUB_USERNAME | 你的 GitHub 用户名 |
