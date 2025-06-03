# 截图服务快速开始指南

## 概述

本指南将帮助你快速部署和使用截图服务。服务基于Docker容器化部署，使用自定义构建流程确保稳定性。

## 前置要求

- Docker 20.10+
- Docker Compose 2.0+
- 2GB+ 可用内存
- Git（用于代码同步）

## 部署步骤

### 1. 获取代码
```bash
# 克隆或同步代码到服务器
git clone <repository-url> screenshot
cd screenshot

# 或者如果已存在，拉取最新代码
git pull
```

### 2. 配置环境
```bash
# 复制环境配置文件
cp env.example .env

# 编辑配置文件
nano .env
```

必要的配置项：
```bash
# API密钥（必须设置）
API_KEY=your-secret-api-key-here

# 允许访问的IP（可选，逗号分隔）
ALLOWED_IPS=192.168.1.100,10.0.0.50

# CORS源（可选）
CORS_ORIGINS=https://yourdomain.com

# 日志级别
LOG_LEVEL=info
```

### 3. 部署服务

#### 方法1：使用部署脚本（推荐）
```bash
# 一键部署
./scripts/deploy.sh deploy

# 查看部署状态
./scripts/deploy.sh status

# 查看日志
./scripts/deploy.sh logs
```

#### 方法2：手动部署
```bash
# 构建镜像
docker-compose -f docker/docker-compose.yml build

# 启动服务
docker-compose -f docker/docker-compose.yml up -d

# 查看状态
docker-compose -f docker/docker-compose.yml ps
```

### 4. 验证部署
```bash
# 健康检查
curl http://127.0.0.1:3002/health

# 预期响应
{
  "status": "ok",
  "service": "screenshot-service",
  "browser": "connected"
}
```

## 常用操作

### 服务管理
```bash
# 启动服务
./scripts/deploy.sh deploy

# 停止服务
./scripts/deploy.sh stop

# 重启服务
./scripts/deploy.sh restart

# 查看状态
./scripts/deploy.sh status

# 查看日志
./scripts/deploy.sh logs

# 健康检查
./scripts/deploy.sh health
```

### 更新服务
```bash
# 拉取最新代码并更新
git pull
./scripts/deploy.sh update

# 或者重新部署
./scripts/deploy.sh restart
```

### 清理资源
```bash
# 清理未使用的Docker资源
./scripts/deploy.sh cleanup

# 完全重置
docker-compose -f docker/docker-compose.yml down --volumes
docker system prune -f
```

## API使用示例

### 基础截图
```bash
curl -X POST http://127.0.0.1:3002/screenshot \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "htmlContent": "<h1 style=\"color: blue;\">Hello World</h1>",
    "width": 800,
    "height": 600
  }' \
  --output screenshot.png
```

### 智能裁剪截图
```bash
curl -X POST http://127.0.0.1:3002/screenshot \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "htmlContent": "<div style=\"padding: 50px; background: white;\"><h1>Content</h1></div>",
    "width": 1200,
    "height": 800,
    "options": {
      "smartCrop": true,
      "cropPadding": 20,
      "format": "png",
      "quality": 90
    }
  }' \
  --output smart-screenshot.png
```

## 故障排查

### 常见问题

1. **服务无法启动**
```bash
# 查看详细日志
docker logs screenshot-service

# 检查端口占用
netstat -tlnp | grep 3002

# 检查Docker状态
docker info
```

2. **健康检查失败**
```bash
# 手动测试
curl -v http://127.0.0.1:3002/health

# 进入容器调试
docker exec -it screenshot-service /bin/bash
ps aux | grep node
```

3. **构建失败**
```bash
# 清理并重新构建
docker-compose -f docker/docker-compose.yml down
docker system prune -f
docker-compose -f docker/docker-compose.yml build --no-cache
```

4. **内存不足**
```bash
# 检查内存使用
free -h
docker stats screenshot-service

# 调整内存限制（编辑docker-compose.yml）
memory: 4G  # 增加内存限制
```

### 性能优化

1. **调整资源限制**
编辑 `docker/docker-compose.yml`：
```yaml
deploy:
  resources:
    limits:
      memory: 4G      # 根据服务器配置调整
      cpus: '2.0'     # 根据CPU核心数调整
```

2. **监控资源使用**
```bash
# 实时监控
docker stats screenshot-service

# 查看系统资源
htop
df -h
```

## 安全配置

### 1. API密钥设置
```bash
# 生成强密钥
openssl rand -hex 32

# 在.env中设置
API_KEY=your-generated-strong-key
```

### 2. IP访问控制
```bash
# 限制访问IP
ALLOWED_IPS=192.168.1.100,10.0.0.50,172.16.0.0/16
```

### 3. 防火墙配置
```bash
# 只允许特定IP访问3002端口
iptables -A INPUT -p tcp --dport 3002 -s 192.168.1.100 -j ACCEPT
iptables -A INPUT -p tcp --dport 3002 -j DROP
```

## 监控和日志

### 查看日志
```bash
# 实时日志
docker logs -f screenshot-service

# 最近日志
docker logs --tail 100 screenshot-service

# 日志文件位置
ls -la /var/lib/docker/volumes/docker_screenshot-logs/_data/
```

### 性能监控
```bash
# 容器资源使用
docker stats screenshot-service

# 服务健康状态
curl http://127.0.0.1:3002/health | jq
```

## 备份和恢复

### 备份配置
```bash
# 备份环境配置
cp .env .env.backup.$(date +%Y%m%d)

# 备份日志
tar -czf logs-backup-$(date +%Y%m%d).tar.gz logs/
```

### 恢复服务
```bash
# 从备份恢复配置
cp .env.backup.20250603 .env

# 重新部署
./scripts/deploy.sh restart
```

## 下一步

- 查看完整的 [README.md](README.md) 了解更多功能
- 阅读 [API文档](docs/README.md) 了解详细接口
- 配置监控和告警系统
- 设置自动备份策略 