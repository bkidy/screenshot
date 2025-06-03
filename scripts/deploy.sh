#!/bin/bash

# 截图服务部署脚本
# 用于在生产服务器上部署截图服务

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
COMPOSE_FILE="$PROJECT_DIR/docker/docker-compose.yml"
ENV_FILE="$PROJECT_DIR/.env"
SERVICE_NAME="screenshot-service"

# 解析命令行参数
ACTION="${1:-deploy}"
ENVIRONMENT="${2:-production}"

log_info "截图服务部署脚本"
log_info "操作: $ACTION"
log_info "环境: $ENVIRONMENT"
log_info "项目目录: $PROJECT_DIR"

# 检查必要文件
check_requirements() {
    log_info "检查部署要求..."
    
    if [ ! -f "$COMPOSE_FILE" ]; then
        log_error "docker-compose.yml 文件不存在: $COMPOSE_FILE"
        exit 1
    fi
    
    if [ ! -f "$ENV_FILE" ]; then
        log_warning ".env 文件不存在，将创建示例文件"
        create_env_file
    fi
    
    # 检查Docker和Docker Compose
    if ! command -v docker >/dev/null 2>&1; then
        log_error "Docker 未安装"
        exit 1
    fi
    
    if ! command -v docker-compose >/dev/null 2>&1; then
        log_error "Docker Compose 未安装"
        exit 1
    fi
    
    if ! docker info >/dev/null 2>&1; then
        log_error "Docker 未运行或无法访问"
        exit 1
    fi
}

# 创建环境变量文件
create_env_file() {
    log_info "创建 .env 文件..."
    cat > "$ENV_FILE" << EOF
# 截图服务环境变量配置

# API密钥（必须修改）
API_KEY=your-secret-api-key-$(openssl rand -hex 16)

# 允许访问的IP地址（逗号分隔）
# 示例: ALLOWED_IPS=192.168.1.100,10.0.0.50
ALLOWED_IPS=

# CORS允许的源（逗号分隔）
# 示例: CORS_ORIGINS=http://localhost:3000,https://yourdomain.com
CORS_ORIGINS=

# 日志级别
LOG_LEVEL=warn

# 其他配置
NODE_ENV=production
PORT=3002
EOF
    
    log_warning "请编辑 $ENV_FILE 文件，设置正确的配置值"
    log_warning "特别是 API_KEY 和 ALLOWED_IPS"
}

# 部署服务
deploy_service() {
    log_info "部署截图服务..."
    
    cd "$PROJECT_DIR"
    
    # 创建日志目录
    mkdir -p logs
    
    # 构建镜像（使用自定义Dockerfile）
    log_info "构建镜像..."
    docker-compose -f "$COMPOSE_FILE" build --no-cache
    
    # 启动服务
    log_info "启动服务..."
    docker-compose -f "$COMPOSE_FILE" up -d
    
    # 等待服务启动
    log_info "等待服务启动..."
    sleep 20  # 减少等待时间，因为依赖已预装
    
    # 健康检查
    check_health
}

# 停止服务
stop_service() {
    log_info "停止截图服务..."
    
    cd "$PROJECT_DIR"
    docker-compose -f "$COMPOSE_FILE" down
    
    log_success "服务已停止"
}

# 重启服务
restart_service() {
    log_info "重启截图服务..."
    stop_service
    deploy_service
}

# 健康检查
check_health() {
    log_info "执行健康检查..."
    
    local max_attempts=10
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -f http://127.0.0.1:3002/health >/dev/null 2>&1; then
            log_success "健康检查通过"
            return 0
        fi
        
        log_info "健康检查失败，重试 $attempt/$max_attempts..."
        sleep 5
        ((attempt++))
    done
    
    log_error "健康检查失败，服务可能未正常启动"
    show_logs
    return 1
}

# 显示日志
show_logs() {
    log_info "显示服务日志..."
    cd "$PROJECT_DIR"
    docker-compose -f "$COMPOSE_FILE" logs --tail=50 "$SERVICE_NAME"
}

# 显示状态
show_status() {
    log_info "服务状态:"
    cd "$PROJECT_DIR"
    docker-compose -f "$COMPOSE_FILE" ps
    
    log_info "容器资源使用:"
    docker stats --no-stream "$SERVICE_NAME" 2>/dev/null || log_warning "无法获取资源使用情况"
}

# 更新服务
update_service() {
    log_info "更新截图服务..."
    
    cd "$PROJECT_DIR"
    
    # 备份当前配置
    if [ -f "$ENV_FILE" ]; then
        cp "$ENV_FILE" "$ENV_FILE.backup.$(date +%Y%m%d_%H%M%S)"
        log_info "已备份环境配置文件"
    fi
    
    # 拉取最新代码（如果是git仓库）
    if [ -d ".git" ]; then
        log_info "拉取最新代码..."
        git pull
    fi
    
    # 重新构建和部署
    docker-compose -f "$COMPOSE_FILE" build --no-cache
    docker-compose -f "$COMPOSE_FILE" up -d
    
    # 清理旧镜像
    docker image prune -f
    
    log_success "服务更新完成"
    check_health
}

# 清理资源
cleanup() {
    log_info "清理资源..."
    
    cd "$PROJECT_DIR"
    
    # 停止并删除容器
    docker-compose -f "$COMPOSE_FILE" down --volumes --remove-orphans
    
    # 清理未使用的镜像
    docker image prune -f
    
    # 清理未使用的卷
    docker volume prune -f
    
    log_success "资源清理完成"
}

# 显示帮助信息
show_help() {
    echo "截图服务部署脚本"
    echo ""
    echo "用法: $0 [ACTION] [ENVIRONMENT]"
    echo ""
    echo "Actions:"
    echo "  deploy    - 部署服务（默认）"
    echo "  stop      - 停止服务"
    echo "  restart   - 重启服务"
    echo "  status    - 显示服务状态"
    echo "  logs      - 显示服务日志"
    echo "  health    - 执行健康检查"
    echo "  update    - 更新服务"
    echo "  cleanup   - 清理资源"
    echo "  help      - 显示帮助信息"
    echo ""
    echo "Environment:"
    echo "  production  - 生产环境（默认）"
    echo "  staging     - 测试环境"
    echo ""
    echo "示例:"
    echo "  $0 deploy production"
    echo "  $0 restart"
    echo "  $0 logs"
    echo "  $0 status"
}

# 主逻辑
main() {
    case "$ACTION" in
        "deploy")
            check_requirements
            deploy_service
            ;;
        "stop")
            stop_service
            ;;
        "restart")
            check_requirements
            restart_service
            ;;
        "status")
            show_status
            ;;
        "logs")
            show_logs
            ;;
        "health")
            check_health
            ;;
        "update")
            check_requirements
            update_service
            ;;
        "cleanup")
            cleanup
            ;;
        "help"|"-h"|"--help")
            show_help
            ;;
        *)
            log_error "未知操作: $ACTION"
            show_help
            exit 1
            ;;
    esac
}

# 执行主逻辑
main 