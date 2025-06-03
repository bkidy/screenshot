# 截图服务 (Screenshot Service)

一个基于 Puppeteer 的独立截图微服务，专为生产环境设计，支持内网部署和安全访问控制。

## 🚀 特性

- **高性能**: 基于 Puppeteer 的服务端渲染
- **安全可靠**: API 密钥认证 + IP 白名单
- **生产就绪**: Docker 容器化部署，完整的监控和日志
- **内网隔离**: 支持内网部署，只允许授权访问
- **资源控制**: 内存和 CPU 限制，防止资源滥用
- **健康检查**: 自动故障检测和恢复
- **速率限制**: 防止 API 滥用

## 📋 系统要求

- Docker 20.10+
- Docker Compose 1.29+
- Linux/macOS (推荐 Ubuntu 20.04+)
- 最小 2GB RAM, 1 CPU 核心

## 🏗️ 项目结构

```
screenshot-service/
├── src/                    # 源代码
│   ├── app.js             # 主应用
│   ├── config/            # 配置文件
│   ├── middleware/        # 中间件
│   └── utils/             # 工具函数
├── docker/                # Docker 配置
│   ├── Dockerfile         # 镜像构建
│   └── docker-compose.yml # 服务编排
├── scripts/               # 脚本工具
│   ├── build.sh          # 构建脚本
│   ├── deploy.sh         # 部署脚本
│   └── health-check.sh   # 健康检查
├── docs/                  # 文档
├── logs/                  # 日志目录
├── .env                   # 环境变量
└── package.json           # 依赖配置
```

## 🚀 快速开始

### 1. 克隆项目

```bash
git clone <repository-url>
cd screenshot-service
```

### 2. 配置环境变量

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑配置文件
nano .env
```

重要配置项：
```bash
# API密钥（必须修改）
API_KEY=your-secret-api-key-here

# 允许访问的IP地址
ALLOWED_IPS=192.168.1.100,10.0.0.50

# CORS允许的源
CORS_ORIGINS=http://localhost:3000,https://yourdomain.com
```

### 3. 构建和部署

```bash
# 构建镜像
./scripts/build.sh

# 部署服务
./scripts/deploy.sh deploy
```

### 4. 验证部署

```bash
# 检查服务状态
./scripts/deploy.sh status

# 健康检查
curl http://localhost:3002/health
```

## 📖 API 文档

### 健康检查

```http
GET /health
```

响应：
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "service": "screenshot-service",
  "version": "1.0.0",
  "uptime": 3600,
  "browser": "connected"
}
```

### 生成截图

```http
POST /screenshot
Content-Type: application/json
X-API-Key: your-api-key

{
  "htmlContent": "<html><body><h1>Hello World</h1></body></html>",
  "width": 1920,
  "height": 1080,
  "options": {
    "format": "png",
    "scale": 2,
    "timeout": 30000,
    "quality": 90
  }
}
```

响应：二进制图片数据

### 服务信息

```http
GET /info
X-API-Key: your-api-key
```

## 🔧 配置说明

### 环境变量

| 变量名 | 描述 | 默认值 | 必需 |
|--------|------|--------|------|
| `API_KEY` | API访问密钥 | - | ✅ |
| `ALLOWED_IPS` | 允许的IP地址列表 | - | ❌ |
| `CORS_ORIGINS` | CORS允许的源 | - | ❌ |
| `LOG_LEVEL` | 日志级别 | `warn` | ❌ |
| `PORT` | 服务端口 | `3002` | ❌ |

### 截图参数

| 参数 | 类型 | 描述 | 默认值 |
|------|------|------|--------|
| `htmlContent` | string | HTML内容 | - |
| `width` | number | 宽度 | 1920 |
| `height` | number | 高度 | 1080 |
| `format` | string | 格式 (png/jpeg/webp) | png |
| `scale` | number | 缩放比例 | 2 |
| `timeout` | number | 超时时间(ms) | 30000 |
| `quality` | number | 质量 (1-100, 仅jpeg/webp) | - |

## 🛠️ 运维管理

### 常用命令

```bash
# 部署服务
./scripts/deploy.sh deploy

# 查看状态
./scripts/deploy.sh status

# 查看日志
./scripts/deploy.sh logs

# 重启服务
./scripts/deploy.sh restart

# 更新服务
./scripts/deploy.sh update

# 停止服务
./scripts/deploy.sh stop

# 清理资源
./scripts/deploy.sh cleanup
```

### 监控指标

- 服务健康状态
- 内存使用情况
- CPU 使用率
- 请求响应时间
- 错误率统计

### 日志管理

日志文件位置：
- 容器内：`/var/log/screenshot-service/`
- 主机：`./logs/`

日志级别：
- `error`: 错误信息
- `warn`: 警告信息
- `info`: 一般信息
- `debug`: 调试信息

## 🔒 安全配置

### API 认证

支持两种认证方式：
1. `X-API-Key` 请求头
2. `Authorization: Bearer <token>` 请求头

### IP 白名单

在 `.env` 文件中配置：
```bash
ALLOWED_IPS=192.168.1.100,10.0.0.50,172.16.0.0/16
```

### 网络隔离

- 服务只绑定到 `127.0.0.1:3002`
- 使用内网 Docker 网络
- 防火墙规则限制外部访问

## 🚨 故障排除

### 常见问题

1. **服务无法启动**
   ```bash
   # 检查端口占用
   lsof -i :3002
   
   # 查看详细日志
   ./scripts/deploy.sh logs
   ```

2. **健康检查失败**
   ```bash
   # 检查容器状态
   docker ps -a
   
   # 进入容器调试
   docker exec -it screenshot-service sh
   ```

3. **截图生成失败**
   ```bash
   # 检查内存使用
   docker stats screenshot-service
   
   # 查看错误日志
   ./scripts/deploy.sh logs | grep ERROR
   ```

### 性能优化

1. **内存不足**
   - 增加容器内存限制
   - 优化 HTML 内容大小
   - 减少并发请求数量

2. **响应时间慢**
   - 检查网络延迟
   - 优化 HTML 渲染复杂度
   - 调整超时参数

## 📞 支持

如有问题，请：
1. 查看 [故障排除文档](./TROUBLESHOOTING.md)
2. 检查 [API 文档](./API.md)
3. 查看 [部署指南](./DEPLOYMENT.md)

## �� 许可证

MIT License 