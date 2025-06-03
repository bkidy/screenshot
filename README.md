# 截图服务 (Screenshot Service)

基于Docker和Puppeteer的高性能截图服务，支持智能内容裁剪和多种输出格式。

## 特性

- 🚀 基于Puppeteer的高质量截图生成
- 🎯 智能内容区域检测和裁剪
- 🐳 Docker容器化部署
- 📊 健康检查和监控
- 🔒 API密钥认证
- 📝 详细的日志记录
- ⚡ 高性能并发处理

## 系统要求

- Docker 20.10+
- Docker Compose 2.0+
- 2GB+ 可用内存
- 1GB+ 可用磁盘空间

## 快速开始

### 1. 克隆项目
```bash
git clone <repository-url>
cd screenshot
```

### 2. 配置环境变量
```bash
cp env.example .env
# 编辑 .env 文件，设置API密钥等配置
```

### 3. 构建和部署
```bash
# 使用部署脚本（推荐）
./scripts/deploy.sh deploy

# 或手动构建部署
docker-compose -f docker/docker-compose.yml build
docker-compose -f docker/docker-compose.yml up -d
```

### 4. 验证服务
```bash
# 健康检查
curl http://127.0.0.1:3002/health

# 查看服务状态
./scripts/deploy.sh status
```

## 部署架构

### 构建方式
本服务使用**自定义Dockerfile构建**，基于官方Puppeteer镜像：

- **基础镜像**: `ghcr.io/puppeteer/puppeteer:latest`
- **依赖预装**: 构建时安装所有Node.js依赖
- **快速启动**: 运行时直接启动应用，无需安装依赖

### 部署流程
1. **构建阶段**: 使用Dockerfile构建包含所有依赖的镜像
2. **部署阶段**: 启动预构建的容器
3. **健康检查**: 自动验证服务可用性

## 部署脚本使用

### 基本命令
```bash
# 部署服务
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

# 更新服务
./scripts/deploy.sh update

# 清理资源
./scripts/deploy.sh cleanup
```

### 构建脚本
```bash
# 单独构建镜像
./scripts/build.sh

# 构建指定标签
./scripts/build.sh v1.0.0
```

## API 接口

### 健康检查
```bash
GET /health
```

响应示例：
```json
{
  "status": "ok",
  "timestamp": "2025-06-03T14:31:11.655Z",
  "service": "screenshot-service",
  "version": "1.0.0",
  "uptime": 2.472007142,
  "browser": "connected"
}
```

### 截图生成
```bash
POST /screenshot
Content-Type: application/json
Authorization: Bearer YOUR_API_KEY

{
  "htmlContent": "<html>...</html>",
  "width": 1200,
  "height": 800,
  "options": {
    "format": "png",
    "quality": 90,
    "smartCrop": true,
    "cropPadding": 10
  }
}
```

## 配置说明

### 环境变量
```bash
# API认证
API_KEY=your-secret-api-key

# 网络配置
PORT=3002
CORS_ORIGINS=*

# 日志配置
LOG_LEVEL=info
NODE_ENV=production

# IP访问控制
ALLOWED_IPS=192.168.1.100,10.0.0.50
```

### Docker配置
- **内存限制**: 2GB
- **CPU限制**: 1核心
- **端口映射**: 3002:3002
- **健康检查**: 每30秒检查一次

## 故障排查

### 常见问题

1. **容器启动失败**
```bash
# 查看详细日志
docker logs screenshot-service

# 检查资源使用
docker stats screenshot-service
```

2. **健康检查失败**
```bash
# 手动测试健康检查
curl -f http://127.0.0.1:3002/health

# 进入容器调试
docker exec -it screenshot-service /bin/bash
```

3. **构建失败**
```bash
# 清理并重新构建
docker-compose -f docker/docker-compose.yml down
docker system prune -f
./scripts/deploy.sh deploy
```

### 性能优化

1. **内存优化**
   - 调整Docker内存限制
   - 监控内存使用情况

2. **并发优化**
   - 配置Puppeteer实例池
   - 调整请求队列大小

## 开发指南

### 本地开发
```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 运行测试
npm test
```

### 代码结构
```
src/
├── app.js              # 主应用入口
├── config/             # 配置文件
├── middleware/         # 中间件
├── routes/             # 路由处理
└── utils/              # 工具函数
```

## 更新日志

### v1.0.0 (2025-06-03)
- ✅ 基于自定义Dockerfile的构建流程
- ✅ 修复健康检查地址问题
- ✅ 优化部署脚本
- ✅ 预装依赖，提升启动速度
- ✅ 完善文档和故障排查指南

## 许可证

MIT License

## 支持

如有问题，请查看：
1. [故障排查指南](#故障排查)
2. [API文档](#api-接口)
3. [配置说明](#配置说明) 