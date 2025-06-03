# 使用官方Puppeteer镜像作为基础
FROM ghcr.io/puppeteer/puppeteer:latest

# 设置工作目录
WORKDIR /app

# 创建非root用户（如果不存在）
USER root

# 安装必要的系统依赖
RUN apt-get update && \
    apt-get install -y curl && \
    rm -rf /var/lib/apt/lists/*

# 创建日志目录
RUN mkdir -p /var/log/screenshot-service && \
    chown -R pptruser:pptruser /var/log/screenshot-service && \
    chown -R pptruser:pptruser /app

# 切换到非root用户
USER pptruser

# 复制package.json和package-lock.json（如果存在）
COPY --chown=pptruser:pptruser package*.json ./

# 安装Node.js依赖（跳过Puppeteer Chrome下载）
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
RUN npm install --only=production --timeout=60000 && npm cache clean --force

# 复制应用代码
COPY --chown=pptruser:pptruser src/ ./src/

# 创建.env文件的占位符
RUN touch .env

# 暴露端口
EXPOSE 3002

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://127.0.0.1:3002/health || exit 1

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=3002

# 启动命令
CMD ["node", "src/app.js"] 