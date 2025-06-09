module.exports = {
  // 生产环境服务配置
  server: {
    port: process.env.PORT || 3002,
    host: '0.0.0.0', // 监听所有接口
    timeout: 60000 // 生产环境增加超时时间
  },

  // 生产环境Puppeteer配置
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--memory-pressure-off', // 生产环境内存优化
      '--max_old_space_size=2048' // 限制内存使用
    ]
  },

  // 生产环境截图配置
  screenshot: {
    defaultTimeout: 45000, // 增加超时时间
    maxWidth: 3840, // 4K分辨率支持
    maxHeight: 2160
  },

  // 生产环境安全配置
  security: {
    apiKey: process.env.API_KEY, // 必须通过环境变量设置
    allowedIPs: process.env.ALLOWED_IPS ? process.env.ALLOWED_IPS.split(',') : [],
    corsOrigins: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : []
  },

  // 生产环境速率限制
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15分钟
    max: 200, // 生产环境允许更多请求
    message: {
      error: 'Rate limit exceeded',
      retryAfter: '15 minutes'
    }
  },

  // 生产环境日志配置
  logging: {
    level: process.env.LOG_LEVEL || 'warn', // 生产环境减少日志
    format: 'json' // 结构化日志便于分析
  },

  // 生产环境健康检查
  health: {
    timeout: 10000 // 增加健康检查超时
  }
} 