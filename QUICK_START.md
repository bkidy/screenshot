# 🚀 快速开始指南（轻量化版本）

## 1️⃣ 环境准备

确保您的服务器已安装：
- Docker 20.10+
- Docker Compose 1.29+

## 2️⃣ 快速部署

```bash
# 1. 进入项目目录
cd screenshot-service

# 2. 复制环境变量文件
cp env.example .env

# 3. 一键部署（使用默认配置）
./scripts/deploy.sh deploy

# 4. 验证部署
./scripts/deploy.sh health
```

**默认配置说明：**
- ✅ **认证**: 默认关闭（内网环境）
- ✅ **CORS**: 允许所有源（内网环境）
- ✅ **速率限制**: 宽松限制
- ✅ **日志**: 基础日志记录

## 3️⃣ 主站项目集成

在您的主站项目中添加环境变量：

```bash
# 主站项目 .env 文件
SCREENSHOT_SERVICE_URL=http://localhost:3002/screenshot
# 由于默认关闭认证，不需要API_KEY
```

更新 `dockerScreenshotService.ts`：
```typescript
const SCREENSHOT_SERVICE_URL = process.env.SCREENSHOT_SERVICE_URL || 'http://localhost:3002/screenshot'

// 简化的请求，不需要认证头
const response = await axios.post(SCREENSHOT_SERVICE_URL, {
  htmlContent: request.htmlContent,
  width: request.width,
  height: request.height,
  options: processedOptions
}, {
  responseType: 'arraybuffer',
  timeout: processedOptions.timeout + 5000
})
```

## 4️⃣ 测试验证

```bash
# 测试截图服务（无需认证）
curl -X POST http://localhost:3002/screenshot \
  -H "Content-Type: application/json" \
  -d '{"htmlContent":"<h1>Test</h1>","width":800,"height":600}' \
  --output test.png

# 检查生成的图片
ls -la test.png
```

## 5️⃣ 常用命令

```bash
# 查看服务状态
./scripts/deploy.sh status

# 查看日志
./scripts/deploy.sh logs

# 重启服务
./scripts/deploy.sh restart

# 停止服务
./scripts/deploy.sh stop
```

## 🔧 可选的安全配置

如果您需要启用安全功能，编辑 `.env` 文件：

```bash
# 启用API密钥认证
API_KEY=your-secret-api-key-here

# 限制CORS源
CORS_ORIGINS=http://localhost:3000,https://yourdomain.com

# 增加日志详细程度
LOG_LEVEL=debug
```

然后重启服务：
```bash
./scripts/deploy.sh restart
```

## 🚨 故障排除

### 服务无法启动
```bash
# 检查Docker状态
sudo systemctl status docker

# 检查端口占用
lsof -i :3002

# 查看详细日志
./scripts/deploy.sh logs
```

### 截图生成失败
```bash
# 检查内存使用
docker stats screenshot-service

# 查看错误日志
./scripts/deploy.sh logs | grep -i error
```

### 性能优化
```bash
# 如果内存不足，编辑 docker/docker-compose.yml
# 增加内存限制：
memory: 4G
```

## 📞 获取帮助

- 📖 [完整文档](docs/README.md)
- 🔧 [集成指南](docs/INTEGRATION.md)

---

**🎉 恭喜！您的轻量化截图服务已成功部署！**

**特点：**
- ⚡ **即开即用**: 无需复杂配置
- 🔓 **内网友好**: 默认关闭认证
- 🪶 **轻量化**: 最小化依赖和配置
- 🚀 **高性能**: 专注核心截图功能 