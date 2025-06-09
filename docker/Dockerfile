# 使用官方Puppeteer镜像作为基础，但进行优化配置
FROM ghcr.io/puppeteer/puppeteer:latest

# 设置工作目录
WORKDIR /app

# 创建非root用户（如果不存在）
USER root

# 优化系统依赖安装，添加字体支持
RUN apt-get update && \
    apt-get install -y \
        curl \
        dumb-init \
        # 基础字体包
        fonts-liberation \
        fonts-dejavu-core \
        # 中文字体
        fonts-noto-cjk \
        fonts-wqy-zenhei \
        fonts-wqy-microhei \
        fonts-arphic-ukai \
        fonts-arphic-uming \
        # 表情符号和符号字体
        fonts-noto-color-emoji \
        fonts-symbola \
        fonts-noto-mono \
        # 其他语言字体
        fonts-noto-core \
        # 系统字体
        fonts-droid-fallback \
        # 字体配置
        fontconfig \
        && \
    # 更新字体缓存
    fc-cache -fv && \
    # 清理缓存以减小镜像大小
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# 创建优化的日志目录结构
RUN mkdir -p /var/log/screenshot-service /tmp/screenshot-cache && \
    chown -R pptruser:pptruser /var/log/screenshot-service /tmp/screenshot-cache && \
    chown -R pptruser:pptruser /app

# 切换到非root用户
USER pptruser

# 复制package.json和package-lock.json（如果存在）
COPY --chown=pptruser:pptruser package*.json ./

# 优化的npm配置和依赖安装
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV NODE_ENV=production

RUN npm config set registry https://registry.npmmirror.com && \
    npm config set maxsockets 20 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    # 安装依赖并清理缓存 - 使用npm install而不是npm ci
    npm install --only=production --no-audit --no-fund --timeout=300000 && \
    npm cache clean --force && \
    # 清理不必要的文件
    rm -rf ~/.npm /tmp/*

# 复制应用代码
COPY --chown=pptruser:pptruser src/ ./src/

# 创建.env文件的占位符
RUN touch .env

# 暴露端口
EXPOSE 3002

# 优化的健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://127.0.0.1:3002/health || exit 1

# 性能优化的环境变量
ENV NODE_ENV=production
ENV PORT=3002
ENV NODE_OPTIONS="--max-old-space-size=1536 --max-semi-space-size=128"
ENV UV_THREADPOOL_SIZE=16

# 使用dumb-init作为PID 1以正确处理信号
ENTRYPOINT ["dumb-init", "--"]

# 启动命令
CMD ["node", "src/app.js"] 