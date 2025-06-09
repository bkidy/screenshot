#!/bin/bash

# 截图服务构建脚本
# 用于构建Docker镜像

set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 获取脚本目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# 配置变量
IMAGE_NAME="screenshot-service"
IMAGE_TAG="${1:-latest}"
DOCKERFILE_PATH="$PROJECT_DIR/docker/Dockerfile"

log_info "开始构建截图服务Docker镜像..."
log_info "项目目录: $PROJECT_DIR"
log_info "镜像名称: $IMAGE_NAME:$IMAGE_TAG"

# 检查必要文件
if [ ! -f "$PROJECT_DIR/package.json" ]; then
    log_error "package.json 文件不存在"
    exit 1
fi

if [ ! -f "$DOCKERFILE_PATH" ]; then
    log_error "Dockerfile 不存在: $DOCKERFILE_PATH"
    exit 1
fi

if [ ! -d "$PROJECT_DIR/src" ]; then
    log_error "src 目录不存在"
    exit 1
fi

# 创建必要的目录
log_info "创建必要的目录..."
mkdir -p "$PROJECT_DIR/logs"

# 检查Docker是否运行
if ! docker info >/dev/null 2>&1; then
    log_error "Docker 未运行或无法访问"
    exit 1
fi

# 构建镜像
log_info "构建Docker镜像..."
cd "$PROJECT_DIR"

docker build \
    -f "$DOCKERFILE_PATH" \
    -t "$IMAGE_NAME:$IMAGE_TAG" \
    --build-arg BUILD_DATE="$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
    --build-arg VCS_REF="$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')" \
    .

if [ $? -eq 0 ]; then
    log_success "Docker镜像构建成功: $IMAGE_NAME:$IMAGE_TAG"
else
    log_error "Docker镜像构建失败"
    exit 1
fi

# 显示镜像信息
log_info "镜像信息:"
docker images "$IMAGE_NAME:$IMAGE_TAG"

# 可选：运行安全扫描
if command -v docker-scan >/dev/null 2>&1; then
    log_info "运行安全扫描..."
    docker scan "$IMAGE_NAME:$IMAGE_TAG" || log_warning "安全扫描失败或发现问题"
fi

# 可选：测试镜像
log_info "测试镜像..."
CONTAINER_ID=$(docker run -d --rm -p 3003:3002 "$IMAGE_NAME:$IMAGE_TAG")

if [ $? -eq 0 ]; then
    log_info "等待服务启动..."
    sleep 10
    
    # 健康检查
    if curl -f http://localhost:3003/health >/dev/null 2>&1; then
        log_success "镜像测试通过"
    else
        log_warning "健康检查失败"
    fi
    
    # 停止测试容器
    docker stop "$CONTAINER_ID" >/dev/null 2>&1
else
    log_error "镜像测试失败"
fi

log_success "构建完成！"
log_info "使用以下命令运行服务:"
log_info "  cd $PROJECT_DIR && docker-compose -f docker/docker-compose.yml up -d" 