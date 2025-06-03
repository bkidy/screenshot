# Screenshot Service

一个基于Docker和Puppeteer的智能截图服务，支持智能内容区域检测和裁剪功能。

## 功能特性

- 🎯 **智能裁剪**: 自动检测内容边界，消除空白边框
- 🐳 **Docker化部署**: 容器化部署，环境一致性
- ⚡ **高性能**: Puppeteer实例池，支持并发处理
- 🔧 **可配置**: 支持多种格式、质量、尺寸配置
- 🛡️ **安全**: 内置认证和速率限制
- 📊 **监控**: 完整的日志和性能监控

## 快速开始

### 1. 环境准备

```bash
# 复制环境变量文件
cp env.example .env

# 编辑环境变量
nano .env
```

### 2. 启动服务

```bash
# 使用Docker Compose启动
cd docker
docker-compose up -d

# 查看服务状态
docker-compose ps
```

### 3. 测试服务

```bash
# 健康检查
curl http://localhost:3002/health

# 测试截图
curl -X POST http://localhost:3002/screenshot \
  -H "Content-Type: application/json" \
  -d '{"htmlContent":"<h1>Hello World</h1>","width":400,"height":300}' \
  --output test.png
```

## API文档

详细的API文档请参考 [docs/README.md](docs/README.md)

## 集成指南

如何集成到现有项目请参考 [docs/INTEGRATION.md](docs/INTEGRATION.md)

## Git仓库设置

### 设置远程仓库

```bash
# 添加远程仓库（替换为你的仓库URL）
git remote add origin https://github.com/your-username/screenshot-service.git

# 推送到远程仓库
git push -u origin master
```

### 在主项目中使用

```bash
# 在主项目中添加为子模块
cd /path/to/main-project
git submodule add https://github.com/your-username/screenshot-service.git screenshot

# 或者直接克隆到指定目录
git clone https://github.com/your-username/screenshot-service.git screenshot
```

## 开发

### 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

### 构建和部署

```bash
# 构建Docker镜像
./scripts/build.sh

# 部署到生产环境
./scripts/deploy.sh
```

## 配置说明

### 智能裁剪配置

```javascript
{
  "smartCrop": true,        // 启用智能裁剪
  "cropPadding": 10,        // 内容周围边距
  "backgroundColor": "#fff"  // 背景颜色
}
```

### 环境变量

- `PORT`: 服务端口 (默认: 3002)
- `NODE_ENV`: 运行环境 (development/production)
- `API_KEY`: API认证密钥 (设置为'disabled'可关闭认证)
- `CORS_ORIGINS`: 允许的CORS源

## 许可证

MIT License

## 贡献

欢迎提交Issue和Pull Request！ 