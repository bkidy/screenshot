module.exports = {
  // 服务配置
  server: {
    port: process.env.PORT || 3002,
    host: process.env.HOST || '0.0.0.0',
    timeout: 30000
  },

  // 优化后的Puppeteer配置
  puppeteer: {
    headless: true,
    args: [
      // 必需的安全参数
      '--no-sandbox',
      '--disable-setuid-sandbox',
      
      // 内存和性能优化
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-accelerated-2d-canvas',
      '--disable-accelerated-jpeg-decoding',
      '--disable-accelerated-mjpeg-decode',
      '--disable-accelerated-video-decode',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      
      // 网络和资源优化
      '--disable-web-security',
      '--disable-features=TranslateUI,BlinkGenPropertyTrees',
      '--disable-ipc-flooding-protection',
      '--disable-default-apps',
      '--disable-extensions',
      '--disable-component-extensions-with-background-pages',
      '--disable-background-networking',
      '--disable-sync',
      
      // 渲染优化
      '--hide-scrollbars',
      '--mute-audio',
      '--no-default-browser-check',
      '--no-first-run',
      '--disable-infobars',
      '--disable-notifications',
      '--disable-popup-blocking',
      
      // 内存管理
      '--memory-pressure-off',
      '--max_old_space_size=4096',
      
      // 进程优化（谨慎使用）
      '--single-process', // 在容器环境中可以提升性能
      '--no-zygote'
    ],
    // 优化默认视口 - 减小默认尺寸以提升性能
    defaultViewport: {
      width: 1280,
      height: 720
    },
    // 连接超时优化
    timeout: 30000,
    // 禁用默认超时
    protocolTimeout: 30000
  },

  // 优化后的截图配置
  screenshot: {
    // 调整默认尺寸以平衡质量和性能
    defaultWidth: 1280,
    defaultHeight: 720,
    defaultFormat: 'png',
    defaultScale: 1, // 降低默认缩放以提升性能
    defaultTimeout: 15000, // 减少默认超时
    maxWidth: 4096,
    maxHeight: 4096,
    supportedFormats: ['png', 'jpeg', 'webp'],
    
    // 性能优化配置
    performance: {
      // 并发控制
      maxConcurrentPages: 3, // 限制同时处理的页面数
      pageTimeout: 15000, // 恢复到15秒，足够处理大部分内容
      navigationTimeout: 10000, // 恢复到10秒
      
      // 等待策略优化 - 提供多种性能模式
      waitStrategy: 'domcontentloaded', // 标准等待策略
      fastMode: true, // 启用快速模式
      ultraFastMode: true, // 启用超快速模式
      
      // 超快速模式配置
      ultraFastWaitStrategy: 'domcontentloaded', // 超快速模式等待DOM加载完成
      skipAllDetectionInUltraFast: false, // 超快速模式进行简单检测
      
      // 优化后的等待时间
      additionalWaitTime: 500, // 标准模式等待时间
      fastModeWaitTime: 200, // 快速模式等待时间
      ultraFastWaitTime: 3000, // 超快速模式图片等待时间
      
      // 图片加载配置
      imageWaitTime: 2000, // 标准模式图片等待时间
      backgroundImageWaitTime: 4000, // 标准模式背景图片等待时间
      renderCompletionWaitTime: 500, // 标准模式渲染完成等待时间
      
      // 智能检测配置
      enableSmartDetection: true, // 启用智能检测
      skipImageDetectionForCompleteHtml: false, // 对所有HTML都进行完整的图片检测
      disableSmartCropInFastMode: true, // 快速模式下禁用智能裁剪
      
      // 资源加载优化
      blockResources: [], // 保持清空，确保图片能正常加载
      enableResourceBlocking: false // 保持关闭
    },
    
    // 简化的智能裁剪配置
    smartCrop: {
      enabled: true,
      minContentSize: 50,
      padding: 10,
      maxPadding: 50,
      // 性能优化：限制智能裁剪的复杂度
      maxElementsToCheck: 100,
      skipComplexElements: true
    }
  },

  // 简化的安全配置
  security: {
    // 设置为 'disabled' 可完全关闭认证
    apiKey: process.env.API_KEY || 'disabled',
    // 简化的CORS配置
    corsOrigins: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : ['*']
  },

  // 日志配置
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    // 性能日志
    logPerformance: process.env.LOG_PERFORMANCE === 'true'
  },

  // 新增：浏览器实例池配置
  browserPool: {
    maxInstances: 2, // 最大浏览器实例数
    minInstances: 1, // 最小保持实例数
    idleTimeout: 300000, // 5分钟空闲超时
    healthCheckInterval: 60000, // 1分钟健康检查间隔
    restartThreshold: 100 // 处理100个请求后重启实例
  }
} 