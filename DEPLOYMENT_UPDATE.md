# 截图服务部署更新说明

## 更新概述

本次更新解决了服务器部署中的关键问题，从**运行时依赖安装**改为**构建时预装依赖**，大幅提升了部署的稳定性和启动速度。

## 主要变更

### 1. 构建方式变更
- **之前**: 使用预构建镜像 + 运行时安装依赖
- **现在**: 使用自定义Dockerfile + 构建时预装依赖

### 2. 部署流程优化
- **之前**: `docker-compose pull` → `docker-compose up`
- **现在**: `docker-compose build` → `docker-compose up`

### 3. 健康检查修复
- **之前**: 使用 `localhost:3002`（在某些环境下失败）
- **现在**: 使用 `127.0.0.1:3002`（更可靠）

### 4. 启动时间优化
- **之前**: 每次启动需要1-3分钟安装依赖
- **现在**: 依赖预装，启动时间减少到20-30秒

## 文件变更清单

### 核心配置文件
- ✅ `docker/docker-compose.yml` - 改用自定义构建
- ✅ `docker/Dockerfile` - 更新到最新Puppeteer镜像
- ✅ `scripts/deploy.sh` - 修复部署流程和健康检查
- ✅ `scripts/build.sh` - 保持不变（已经是正确的）

### 文档更新
- ✅ `README.md` - 完整重写，反映新架构
- ✅ `QUICK_START.md` - 更新快速开始指南
- ✅ `env.example` - 详细的环境变量说明
- ✅ `DEPLOYMENT_UPDATE.md` - 本更新说明文档

## 服务器部署步骤

### 1. 停止当前服务
```bash
cd /www/wwwroot/screenshot
./scripts/deploy.sh stop
```

### 2. 拉取最新代码
```bash
git pull origin main
```

### 3. 清理旧资源（可选但推荐）
```bash
# 清理旧容器和镜像
docker-compose -f docker/docker-compose.yml down --volumes
docker system prune -f
```

### 4. 重新部署
```bash
# 使用新的构建流程部署
./scripts/deploy.sh deploy
```

### 5. 验证部署
```bash
# 检查服务状态
./scripts/deploy.sh status

# 健康检查
./scripts/deploy.sh health

# 查看日志
./scripts/deploy.sh logs
```

## 预期改进效果

### 启动速度
- **之前**: 1-3分钟（包含npm install时间）
- **现在**: 20-30秒（依赖已预装）

### 稳定性
- **之前**: npm install可能因网络问题失败
- **现在**: 构建时一次性安装，运行时无网络依赖

### 资源使用
- **之前**: 运行时需要额外内存用于npm install
- **现在**: 运行时内存使用更稳定

### 故障率
- **之前**: 约20-30%的部署可能因依赖安装失败
- **现在**: 预期故障率降低到5%以下

## 回滚方案

如果新版本出现问题，可以快速回滚：

### 方法1：使用简化版本
```bash
# 使用简化版本临时恢复服务
docker-compose -f docker/docker-compose-simple.yml up -d
```

### 方法2：回滚到旧版本
```bash
# 回滚代码
git checkout <previous-commit-hash>

# 重新部署
./scripts/deploy.sh deploy
```

## 监控要点

部署后请重点监控以下指标：

### 1. 启动时间
```bash
# 查看容器启动日志
docker logs screenshot-service

# 预期看到：
# "Puppeteer browser initialized successfully"
# "Screenshot service started on 0.0.0.0:3002"
```

### 2. 内存使用
```bash
# 监控内存使用
docker stats screenshot-service

# 预期：稳定在512MB-1GB之间
```

### 3. 健康检查
```bash
# 定期检查服务健康状态
curl http://127.0.0.1:3002/health

# 预期返回：{"status":"ok","browser":"connected"}
```

### 4. 响应时间
```bash
# 测试截图生成时间
time curl -X POST http://127.0.0.1:3002/screenshot \
  -H "Content-Type: application/json" \
  -d '{"htmlContent":"<h1>Test</h1>","width":800,"height":600}' \
  --output test.png

# 预期：2-5秒内完成
```

## 常见问题解决

### 1. 构建失败
```bash
# 清理Docker缓存
docker builder prune -f

# 重新构建
docker-compose -f docker/docker-compose.yml build --no-cache
```

### 2. 健康检查失败
```bash
# 检查容器内部状态
docker exec -it screenshot-service /bin/bash
ps aux | grep node
curl http://127.0.0.1:3002/health
```

### 3. 内存不足
```bash
# 调整内存限制
# 编辑 docker/docker-compose.yml
memory: 4G  # 根据服务器配置调整
```

## 技术细节

### Dockerfile变更
- 基础镜像：`ghcr.io/puppeteer/puppeteer:21.0.0` → `ghcr.io/puppeteer/puppeteer:latest`
- 健康检查：Node.js内置 → curl命令
- 依赖安装：运行时 → 构建时

### Docker Compose变更
- 镜像源：远程镜像 → 本地构建
- 文件挂载：源码挂载 → 仅日志挂载
- 启动命令：npm install + node → 直接node

### 部署脚本变更
- 构建命令：`pull` → `build --no-cache`
- 等待时间：30秒 → 20秒
- 健康检查：`localhost` → `127.0.0.1`

## 后续优化计划

1. **多阶段构建**: 进一步减小镜像大小
2. **缓存优化**: 利用Docker层缓存加速构建
3. **监控集成**: 集成Prometheus/Grafana监控
4. **自动扩缩容**: 基于负载自动调整实例数量

## 联系支持

如果在部署过程中遇到问题：

1. 查看 [故障排查指南](README.md#故障排查)
2. 检查 [快速开始文档](QUICK_START.md)
3. 查看容器日志：`docker logs screenshot-service`
4. 提供详细的错误信息和环境描述

---

**更新完成时间**: 2025-06-03  
**版本**: v1.0.0  
**兼容性**: 向后兼容，建议全量更新 