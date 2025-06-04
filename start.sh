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

echo -e "${BLUE}🚀 Screenshot Service 启动脚本${NC}"
echo "=================================="

# 检查Docker是否运行
if ! docker info >/dev/null 2>&1; then
    echo -e "${RED}❌ Docker 未运行，请先启动 Docker${NC}"
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
    if docker-compose build; then
        echo -e "${GREEN}✅ 镜像构建成功${NC}"
        return 0
    else
        echo -e "${RED}❌ 镜像构建失败${NC}"
        return 1
    fi
}

# 启动服务
start_service() {
    echo -e "${BLUE}🚀 启动服务...${NC}"
    if docker-compose up -d --no-build; then
        echo -e "${GREEN}✅ 服务启动成功${NC}"
        echo -e "${BLUE}📊 服务状态:${NC}"
        docker-compose ps
        echo ""
        echo -e "${GREEN}🌐 服务地址: http://localhost:3002${NC}"
        echo -e "${GREEN}🏥 健康检查: http://localhost:3002/health${NC}"
        return 0
    else
        echo -e "${RED}❌ 服务启动失败${NC}"
        return 1
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
        "stop")
            echo -e "${YELLOW}🛑 停止服务...${NC}"
            docker-compose down
            echo -e "${GREEN}✅ 服务已停止${NC}"
            ;;
        "restart")
            echo -e "${YELLOW}🔄 重启服务...${NC}"
            docker-compose down
            start_service
            ;;
        "logs")
            echo -e "${BLUE}📋 查看日志...${NC}"
            docker-compose logs -f
            ;;
        "status")
            echo -e "${BLUE}📊 服务状态:${NC}"
            docker-compose ps
            ;;
        "help"|"-h"|"--help")
            echo -e "${BLUE}使用方法:${NC}"
            echo "  $0 [命令]"
            echo ""
            echo -e "${BLUE}命令:${NC}"
            echo "  auto    - 智能模式：自动检测镜像，需要时构建（默认）"
            echo "  start   - 仅启动：使用已有镜像启动，不构建"
            echo "  build   - 强制构建：重新构建镜像并启动"
            echo "  stop    - 停止服务"
            echo "  restart - 重启服务（不重新构建）"
            echo "  logs    - 查看实时日志"
            echo "  status  - 查看服务状态"
            echo "  help    - 显示此帮助信息"
            echo ""
            echo -e "${BLUE}示例:${NC}"
            echo "  $0          # 智能启动"
            echo "  $0 start    # 快速启动（不构建）"
            echo "  $0 build    # 强制重新构建"
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