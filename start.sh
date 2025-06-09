#!/bin/bash

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 项目配置
PROJECT_NAME="screenshot"
SERVICE_NAME="screenshot-service"
IMAGE_NAME="${PROJECT_NAME}-${SERVICE_NAME}"

# Docker Compose 配置文件路径
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker/docker-compose.yml"

echo -e "${BLUE}🚀 Screenshot Service 启动脚本${NC}"
echo "=================================="

# 检查Docker是否运行
if ! docker info >/dev/null 2>&1; then
    echo -e "${RED}❌ Docker 未运行，请先启动 Docker${NC}"
    exit 1
fi

# 检查docker-compose.yml文件是否存在
if [ ! -f "$COMPOSE_FILE" ]; then
    echo -e "${RED}❌ Docker Compose 配置文件不存在: $COMPOSE_FILE${NC}"
    exit 1
fi

# 检查镜像是否存在
check_image() {
    if docker images --format "table {{.Repository}}:{{.Tag}}" | grep -q "${IMAGE_NAME}"; then
        echo -e "${GREEN}✅ 镜像 ${IMAGE_NAME} 已存在${NC}"
        return 0
    else
        echo -e "${YELLOW}⚠️  镜像 ${IMAGE_NAME} 不存在${NC}"
        return 1
    fi
}

# 构建镜像
build_image() {
    echo -e "${BLUE}🔨 开始构建镜像...${NC}"
    if docker-compose -f "$COMPOSE_FILE" build; then
        echo -e "${GREEN}✅ 镜像构建成功${NC}"
        return 0
    else
        echo -e "${RED}❌ 镜像构建失败${NC}"
        return 1
    fi
}

# 启动单个服务
start_service() {
    echo -e "${BLUE}🚀 启动服务...${NC}"
    if docker-compose -f "$COMPOSE_FILE" up -d --no-build; then
        echo -e "${GREEN}✅ 服务启动成功${NC}"
        echo -e "${BLUE}📊 服务状态:${NC}"
        docker-compose -f "$COMPOSE_FILE" ps
        echo ""
        echo -e "${GREEN}🌐 服务地址: http://localhost:3002${NC}"
        echo -e "${GREEN}🏥 健康检查: http://localhost:3002/health${NC}"
        return 0
    else
        echo -e "${RED}❌ 服务启动失败${NC}"
        return 1
    fi
}

# 生成多实例的 docker-compose 文件
generate_multi_compose() {
    local instance_count=$1
    local multi_compose_file="$SCRIPT_DIR/docker/docker-compose-multi.yml"
    
    echo -e "${BLUE}🔧 生成多实例配置文件 (${instance_count} 个实例)...${NC}"
    
    cat > "$multi_compose_file" << EOF
version: '3.8'

services:
EOF

    # 生成多个服务实例
    for ((i=1; i<=instance_count; i++)); do
        local port=$((3001 + i))
        local service_name="screenshot-service-$i"
        local container_name="screenshot-service-$i"
        
        cat >> "$multi_compose_file" << EOF
  ${service_name}:
    image: screenshot-service:latest
    build:
      context: ..
      dockerfile: docker/Dockerfile
    init: true
    cap_add:
      - SYS_ADMIN
    container_name: ${container_name}
    restart: unless-stopped
    
    # 共享内存配置
    shm_size: 2gb
    
    # 端口映射
    ports:
      - "${port}:3002"
    
    # 工作目录和用户
    working_dir: /app
    user: "pptruser"
    
    # 环境变量
    environment:
      - NODE_ENV=production
      - PORT=3002
      - LOG_LEVEL=info
      - API_KEY=\${API_KEY:-disabled}
      - CORS_ORIGINS=\${CORS_ORIGINS:-*}
      - NODE_OPTIONS=--max-old-space-size=1536
      - UV_THREADPOOL_SIZE=16
      - PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
      - LOG_PERFORMANCE=\${LOG_PERFORMANCE:-false}
      # 实例标识
      - INSTANCE_ID=${i}
      - INSTANCE_PORT=${port}
    
    # 环境变量文件
    env_file:
      - ../.env
    
    # 文件挂载
    volumes:
      - screenshot-logs-${i}:/var/log/screenshot-service
      - /etc/localtime:/etc/localtime:ro
      - /tmp:/tmp
    
    # 资源限制
    deploy:
      resources:
        limits:
          memory: 2G
          cpus: '1.0'
        reservations:
          memory: 768M
          cpus: '0.5'
    
    # 健康检查
    healthcheck:
      test: ["CMD", "curl", "-f", "http://127.0.0.1:3002/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s
    
    # 系统配置
    ulimits:
      nofile:
        soft: 65536
        hard: 65536
      memlock:
        soft: -1
        hard: -1
    
    # 标签
    labels:
      - "com.screenshot-service.description=Screenshot Service Instance ${i}"
      - "com.screenshot-service.version=1.1.0"
      - "com.screenshot-service.instance=${i}"
      - "com.screenshot-service.port=${port}"

EOF
    done

    # 添加卷配置
    cat >> "$multi_compose_file" << EOF

# 卷配置
volumes:
EOF

    for ((i=1; i<=instance_count; i++)); do
        cat >> "$multi_compose_file" << EOF
  screenshot-logs-${i}:
    driver: local
EOF
    done

    echo -e "${GREEN}✅ 多实例配置文件已生成: $multi_compose_file${NC}"
    return 0
}

# 启动多实例服务
start_multi_service() {
    local instance_count=$1
    local multi_compose_file="$SCRIPT_DIR/docker/docker-compose-multi.yml"
    
    echo -e "${BLUE}🚀 启动多实例服务 (${instance_count} 个实例)...${NC}"
    
    # 生成配置文件
    generate_multi_compose "$instance_count"
    
    # 启动服务
    if docker-compose -f "$multi_compose_file" up -d --no-build; then
        echo -e "${GREEN}✅ 多实例服务启动成功${NC}"
        echo -e "${BLUE}📊 服务状态:${NC}"
        docker-compose -f "$multi_compose_file" ps
        echo ""
        echo -e "${GREEN}🌐 服务地址:${NC}"
        for ((i=1; i<=instance_count; i++)); do
            local port=$((3001 + i))
            echo -e "${GREEN}  实例 $i: http://localhost:${port}${NC}"
            echo -e "${GREEN}  健康检查 $i: http://localhost:${port}/health${NC}"
        done
        return 0
    else
        echo -e "${RED}❌ 多实例服务启动失败${NC}"
        return 1
    fi
}

# 停止多实例服务
stop_multi_service() {
    local multi_compose_file="$SCRIPT_DIR/docker/docker-compose-multi.yml"
    
    if [ -f "$multi_compose_file" ]; then
        echo -e "${YELLOW}🛑 停止多实例服务...${NC}"
        docker-compose -f "$multi_compose_file" down
        echo -e "${GREEN}✅ 多实例服务已停止${NC}"
    else
        echo -e "${YELLOW}⚠️  多实例配置文件不存在${NC}"
    fi
}

# 主逻辑
main() {
    case "${1:-auto}" in
        "build")
            echo -e "${YELLOW}🔨 强制重新构建模式${NC}"
            build_image && start_service
            ;;
        "start")
            echo -e "${BLUE}🚀 仅启动模式（不构建）${NC}"
            if check_image; then
                start_service
            else
                echo -e "${RED}❌ 镜像不存在，请先运行: $0 build${NC}"
                exit 1
            fi
            ;;
        "auto"|"")
            echo -e "${BLUE}🤖 智能模式（自动检测）${NC}"
            if check_image; then
                echo -e "${GREEN}使用已有镜像启动...${NC}"
                start_service
            else
                echo -e "${YELLOW}镜像不存在，开始构建...${NC}"
                build_image && start_service
            fi
            ;;
        "multi")
            local instance_count="${2:-2}"
            if ! [[ "$instance_count" =~ ^[0-9]+$ ]] || [ "$instance_count" -lt 1 ] || [ "$instance_count" -gt 10 ]; then
                echo -e "${RED}❌ 实例数量必须是 1-10 之间的数字${NC}"
                exit 1
            fi
            
            echo -e "${BLUE}🔥 多实例模式（${instance_count} 个实例）${NC}"
            if check_image; then
                start_multi_service "$instance_count"
            else
                echo -e "${YELLOW}镜像不存在，开始构建...${NC}"
                build_image && start_multi_service "$instance_count"
            fi
            ;;
        "stop")
            echo -e "${YELLOW}🛑 停止服务...${NC}"
            docker-compose -f "$COMPOSE_FILE" down
            stop_multi_service
            echo -e "${GREEN}✅ 服务已停止${NC}"
            ;;
        "restart")
            echo -e "${YELLOW}🔄 重启服务...${NC}"
            docker-compose -f "$COMPOSE_FILE" down
            stop_multi_service
            start_service
            ;;
        "logs")
            echo -e "${BLUE}📋 查看日志...${NC}"
            docker-compose -f "$COMPOSE_FILE" logs -f
            ;;
        "status")
            echo -e "${BLUE}📊 服务状态:${NC}"
            docker-compose -f "$COMPOSE_FILE" ps
            
            local multi_compose_file="$SCRIPT_DIR/docker/docker-compose-multi.yml"
            if [ -f "$multi_compose_file" ]; then
                echo -e "${BLUE}📊 多实例服务状态:${NC}"
                docker-compose -f "$multi_compose_file" ps
            fi
            ;;
        "help"|"-h"|"--help")
            echo -e "${BLUE}使用方法:${NC}"
            echo "  $0 [命令] [参数]"
            echo ""
            echo -e "${BLUE}命令:${NC}"
            echo "  auto           - 智能模式：自动检测镜像，需要时构建（默认）"
            echo "  start          - 仅启动：使用已有镜像启动，不构建"
            echo "  build          - 强制构建：重新构建镜像并启动"
            echo "  multi <数量>   - 多实例模式：启动指定数量的服务实例（1-10个）"
            echo "  stop           - 停止所有服务（单实例和多实例）"
            echo "  restart        - 重启服务（不重新构建）"
            echo "  logs           - 查看实时日志"
            echo "  status         - 查看服务状态"
            echo "  help           - 显示此帮助信息"
            echo ""
            echo -e "${BLUE}示例:${NC}"
            echo "  $0             # 智能启动单实例"
            echo "  $0 start       # 快速启动单实例"
            echo "  $0 build       # 强制重新构建并启动"
            echo "  $0 multi 2     # 启动2个实例（端口3002,3003）"
            echo "  $0 multi 5     # 启动5个实例（端口3002-3006）"
            echo ""
            echo -e "${BLUE}多实例端口规则:${NC}"
            echo "  实例1: 端口3002, 实例2: 端口3003, 以此类推..."
            ;;
        *)
            echo -e "${RED}❌ 未知命令: $1${NC}"
            echo -e "${YELLOW}使用 '$0 help' 查看帮助${NC}"
            exit 1
            ;;
    esac
}

# 执行主函数
main "$@" 