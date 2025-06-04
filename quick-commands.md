# Screenshot Service 快速命令

## 🚀 避免重复构建的方法

### 1. 智能启动脚本（推荐）
```bash
# 使用智能启动脚本
./start.sh          # 智能模式：自动检测是否需要构建
./start.sh start     # 快速启动：仅启动，不构建
./start.sh build     # 强制重新构建
./start.sh stop      # 停止服务
./start.sh restart   # 重启服务（不重新构建）
./start.sh logs      # 查看实时日志
./start.sh status    # 查看服务状态
```

### 2. 直接使用 docker-compose

#### 快速启动（不构建）
```bash
# 使用已有镜像启动，不构建
docker-compose up -d --no-build
```

#### 检查镜像是否存在
```bash
# 查看本地镜像
docker images | grep screenshot

# 查看服务状态
docker-compose ps
```

#### 分离构建和启动
```bash
# 仅构建（当需要更新时）
docker-compose build

# 仅启动（使用已有镜像）
docker-compose up -d --no-build

# 停止服务
docker-compose down
```

### 3. 常用组合命令

#### 开发模式
```bash
# 第一次或需要更新时
docker-compose up -d --build

# 后续启动（快速）
docker-compose up -d --no-build
```

#### 生产模式
```bash
# 构建生产镜像
docker-compose -f docker-compose.yml build

# 启动生产服务
docker-compose -f docker-compose.yml up -d --no-build
```

### 4. 便捷别名（可选）

在 `~/.bashrc` 或 `~/.zshrc` 中添加：

```bash
# Screenshot Service 别名
alias ss-start='docker-compose up -d --no-build'
alias ss-build='docker-compose build'
alias ss-restart='docker-compose restart'
alias ss-stop='docker-compose down'
alias ss-logs='docker-compose logs -f'
alias ss-status='docker-compose ps'
```

使用方法：
```bash
ss-start    # 快速启动
ss-build    # 重新构建
ss-logs     # 查看日志
```

## 🎯 推荐工作流

### 日常开发
1. **第一次启动**：`./start.sh` 或 `docker-compose up -d --build`
2. **后续启动**：`./start.sh start` 或 `docker-compose up -d --no-build`
3. **代码更改后**：`./start.sh build` 或 `docker-compose build && docker-compose up -d`

### 服务器部署
1. **初次部署**：`./start.sh build`
2. **日常启动**：`./start.sh start`
3. **更新代码**：`./start.sh build`

## 📊 性能对比

| 方式 | 构建时间 | 启动时间 | 适用场景 |
|------|----------|----------|----------|
| `docker-compose up -d --build` | 30-60s | 5-10s | 首次启动/代码更新 |
| `docker-compose up -d --no-build` | 0s | 2-5s | 日常启动 |
| `./start.sh start` | 0s | 2-5s | 快速启动 |
| `./start.sh` | 智能检测 | 2-60s | 智能模式 | 