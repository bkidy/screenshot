# 使用官方Puppeteer镜像作为基础
FROM ghcr.io/puppeteer/puppeteer:21.0.0

# 设置工作目录
WORKDIR /app

# 创建非root用户（如果不存在）
USER root

# 修复Google Chrome GPG密钥问题并安装必要依赖
RUN apt-get update && \
    apt-get install -y gnupg wget && \
    wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | apt-key add - && \
    apt-get update && \
    rm -rf /var/lib/apt/lists/*

# 创建日志目录
RUN mkdir -p /var/log/screenshot-service && \
    chown -R pptruser:pptruser /var/log/screenshot-service

# 切换到非root用户
USER pptruser

# 复制package.json和package-lock.json（如果存在）
COPY --chown=pptruser:pptruser package*.json ./

# 安装Node.js依赖
RUN npm ci --only=production && npm cache clean --force

# 复制应用代码
COPY --chown=pptruser:pptruser src/ ./src/

# 创建.env文件的占位符
RUN touch .env

# 暴露端口
EXPOSE 3002

# 简化健康检查，使用Node.js内置功能
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3002/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=3002

# 启动命令
CMD ["node", "src/app.js"] 