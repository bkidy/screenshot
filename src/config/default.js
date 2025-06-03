module.exports = {
  // 服务配置
  server: {
    port: process.env.PORT || 3002,
    host: process.env.HOST || '0.0.0.0',
    timeout: 30000
  },

  // Puppeteer配置
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu'
    ],
    defaultViewport: {
      width: 1920,
      height: 1080
    }
  },

  // 截图默认配置
  screenshot: {
    defaultWidth: 1920,
    defaultHeight: 1080,
    defaultFormat: 'png',
    defaultScale: 2,
    defaultTimeout: 30000,
    maxWidth: 4096,
    maxHeight: 4096,
    supportedFormats: ['png', 'jpeg', 'webp'],
    // 智能裁剪配置
    smartCrop: {
      enabled: true,
      minContentSize: 50, // 最小内容尺寸（像素）
      padding: 10, // 内容周围的边距（像素）
      maxPadding: 50 // 最大边距限制
    }
  },

  // 简化的安全配置
  security: {
    // 设置为 'disabled' 可完全关闭认证
    apiKey: process.env.API_KEY || 'disabled',
    // 简化的CORS配置
    corsOrigins: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : ['*']
  },

  // 简化的日志配置
  logging: {
    level: process.env.LOG_LEVEL || 'info'
  }
} 