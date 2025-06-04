require('dotenv').config();

const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');

// 导入配置和工具
const config = require('./config/default');
const { authenticate } = require('./middleware/auth');
const { screenshotRateLimit } = require('./middleware/rateLimit');

// 创建Express应用
const app = express();

// 信任代理（用于获取真实IP）
app.set('trust proxy', 1);

// 简化的CORS配置
app.use(cors({
  origin: config.security.corsOrigins,
  credentials: true
}));

// 请求解析中间件
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 全局变量和性能监控
let browser = null;
let activePagesCount = 0;
let totalRequestsProcessed = 0;
const performanceStats = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  averageProcessingTime: 0,
  totalProcessingTime: 0
};

/**
 * 性能监控中间件
 */
function performanceMiddleware(req, res, next) {
  req.startTime = Date.now();
  performanceStats.totalRequests++;
  
  const originalSend = res.send;
  res.send = function(data) {
    const processingTime = Date.now() - req.startTime;
    performanceStats.totalProcessingTime += processingTime;
    performanceStats.averageProcessingTime = performanceStats.totalProcessingTime / performanceStats.totalRequests;
    
    if (res.statusCode < 400) {
      performanceStats.successfulRequests++;
    } else {
      performanceStats.failedRequests++;
    }
    
    if (config.logging.logPerformance) {
      console.log(`[PERF] ${req.method} ${req.path} - ${processingTime}ms - Status: ${res.statusCode}`);
    }
    
    originalSend.call(this, data);
  };
  
  next();
}

app.use(performanceMiddleware);

/**
 * 并发控制中间件
 */
function concurrencyControl(req, res, next) {
  if (activePagesCount >= config.screenshot.performance.maxConcurrentPages) {
    return res.status(429).json({
      error: 'Service busy',
      message: 'Too many concurrent requests. Please try again later.',
      activePagesCount,
      maxConcurrentPages: config.screenshot.performance.maxConcurrentPages
    });
  }
  next();
}

/**
 * 优化后的浏览器初始化
 */
async function initializeBrowser() {
  try {
    console.log('Initializing optimized Puppeteer browser...');
    
    browser = await puppeteer.launch({
      ...config.puppeteer,
      defaultViewport: config.puppeteer.defaultViewport
    });
    
    console.log('Puppeteer browser initialized successfully with optimizations');
    
    // 浏览器健康检查
    setInterval(async () => {
      try {
        if (browser && browser.isConnected()) {
          const pages = await browser.pages();
          console.log(`[HEALTH] Browser healthy, ${pages.length} pages open, ${activePagesCount} active`);
          
          // 如果处理的请求数过多，重启浏览器实例
          if (totalRequestsProcessed > config.browserPool.restartThreshold) {
            console.log(`[HEALTH] Restarting browser after ${totalRequestsProcessed} requests`);
            await restartBrowser();
          }
        } else {
          console.warn('[HEALTH] Browser disconnected, reinitializing...');
          await initializeBrowser();
        }
      } catch (error) {
        console.error('[HEALTH] Browser health check failed:', error.message);
      }
    }, config.browserPool.healthCheckInterval);
    
  } catch (error) {
    console.error('Failed to initialize Puppeteer browser:', error.message);
    throw error;
  }
}

/**
 * 重启浏览器实例
 */
async function restartBrowser() {
  try {
    if (browser) {
      await browser.close();
    }
    totalRequestsProcessed = 0;
    await initializeBrowser();
  } catch (error) {
    console.error('Failed to restart browser:', error.message);
    throw error;
  }
}

/**
 * 检测并等待图片加载完成
 * @param {Object} page - Puppeteer页面对象
 * @param {number} maxWaitTime - 最大等待时间（毫秒）
 */
async function waitForImagesIfNeeded(page, maxWaitTime = 5000) {
  try {
    // 首先检测页面是否包含图片
    const imageInfo = await page.evaluate(() => {
      const images = document.querySelectorAll('img');
      const imageCount = images.length;
      
      if (imageCount === 0) {
        return { hasImages: false, totalImages: 0 };
      }

      // 检查图片加载状态
      let loadedCount = 0;
      let failedCount = 0;
      
      for (const img of images) {
        if (img.complete) {
          if (img.naturalWidth > 0) {
            loadedCount++;
          } else {
            failedCount++;
          }
        }
      }
      
      return {
        hasImages: true,
        totalImages: imageCount,
        loadedImages: loadedCount,
        failedImages: failedCount,
        needsWaiting: (loadedCount + failedCount) < imageCount
      };
    });

    // 如果没有图片，直接返回
    if (!imageInfo.hasImages) {
      console.log('[ImageCheck] 页面无图片，跳过等待');
      return { success: true, message: 'No images found' };
    }

    console.log(`[ImageCheck] 发现 ${imageInfo.totalImages} 个图片，已加载 ${imageInfo.loadedImages} 个`);

    // 如果所有图片都已加载完成，直接返回
    if (!imageInfo.needsWaiting) {
      console.log('[ImageCheck] 所有图片已加载完成');
      return { success: true, message: 'All images loaded' };
    }

    // 等待剩余图片加载，最多等待指定时间
    console.log(`[ImageCheck] 等待剩余图片加载，最多等待 ${maxWaitTime}ms`);
    
    const startTime = Date.now();
    const checkInterval = 200; // 每200ms检查一次
    
    while (Date.now() - startTime < maxWaitTime) {
      const currentStatus = await page.evaluate(() => {
        const images = document.querySelectorAll('img');
        let loaded = 0;
        let failed = 0;
        
        for (const img of images) {
          if (img.complete) {
            if (img.naturalWidth > 0) {
              loaded++;
            } else {
              failed++;
            }
          }
        }
        
        return {
          loadedImages: loaded,
          failedImages: failed,
          totalProcessed: loaded + failed,
          totalImages: images.length
        };
      });

      // 如果所有图片都处理完成（加载成功或失败），退出等待
      if (currentStatus.totalProcessed >= currentStatus.totalImages) {
        const waitTime = Date.now() - startTime;
        console.log(`[ImageCheck] 图片加载完成 - 耗时: ${waitTime}ms, 成功: ${currentStatus.loadedImages}, 失败: ${currentStatus.failedImages}`);
        return { 
          success: true, 
          message: 'Images loaded',
          stats: currentStatus,
          waitTime
        };
      }

      // 等待一小段时间后再次检查
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }

    // 超时处理
    const finalStatus = await page.evaluate(() => {
      const images = document.querySelectorAll('img');
      let loaded = 0;
      let failed = 0;
      
      for (const img of images) {
        if (img.complete && img.naturalWidth > 0) {
          loaded++;
        } else {
          failed++;
        }
      }
      
      return { loadedImages: loaded, failedImages: failed, totalImages: images.length };
    });

    console.log(`[ImageCheck] 等待超时 - 成功: ${finalStatus.loadedImages}, 失败/未完成: ${finalStatus.totalImages - finalStatus.loadedImages}`);
    return { 
      success: true, 
      message: 'Timeout reached',
      stats: finalStatus,
      waitTime: maxWaitTime
    };

  } catch (error) {
    console.error('[ImageCheck] 图片检测失败:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * 验证截图参数
 */
function validateScreenshotParams(params) {
  const { htmlContent, width, height, options = {} } = params;
  const errors = [];

  if (!htmlContent || typeof htmlContent !== 'string') {
    errors.push('htmlContent is required and must be a string');
  }

  if (width && (typeof width !== 'number' || width <= 0 || width > config.screenshot.maxWidth)) {
    errors.push(`width must be a positive number not exceeding ${config.screenshot.maxWidth}`);
  }

  if (height && (typeof height !== 'number' || height <= 0 || height > config.screenshot.maxHeight)) {
    errors.push(`height must be a positive number not exceeding ${config.screenshot.maxHeight}`);
  }

  if (options.format && !config.screenshot.supportedFormats.includes(options.format)) {
    errors.push(`format must be one of: ${config.screenshot.supportedFormats.join(', ')}`);
  }

  return errors;
}

/**
 * 健康检查端点
 */
app.get('/health', (req, res) => {
  const healthStatus = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'screenshot-service',
    version: '1.1.2',
    uptime: process.uptime(),
    browser: browser ? 'connected' : 'disconnected',
    performance: {
      activePagesCount,
      totalRequestsProcessed,
      ...performanceStats
    },
    memory: process.memoryUsage()
  };

  // 检查浏览器连接状态
  if (!browser || !browser.isConnected()) {
    healthStatus.status = 'degraded';
    healthStatus.browser = 'disconnected';
    return res.status(503).json(healthStatus);
  }

  res.json(healthStatus);
});

/**
 * 优化后的截图端点
 */
app.post('/screenshot', authenticate, screenshotRateLimit, concurrencyControl, async (req, res) => {
  const startTime = Date.now();
  let page = null;

  try {
    activePagesCount++;
    
    // 参数验证
    const validationErrors = validateScreenshotParams(req.body);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: 'Invalid parameters',
        details: validationErrors
      });
    }

    const { 
      htmlContent, 
      width = config.screenshot.defaultWidth, 
      height = config.screenshot.defaultHeight, 
      options = {} 
    } = req.body;

    const {
      format = config.screenshot.defaultFormat,
      scale = config.screenshot.defaultScale,
      timeout = config.screenshot.performance.pageTimeout,
      quality,
      enableResourceBlocking = config.screenshot.performance.enableResourceBlocking
    } = options;

    console.log(`[REQ] Screenshot: ${width}x${height}, format: ${format}, blocking: ${enableResourceBlocking}`);

    // 检查浏览器状态
    if (!browser || !browser.isConnected()) {
      console.log('Browser not available, reinitializing...');
      await initializeBrowser();
    }

    // 创建新页面
    page = await browser.newPage();
    
    // 资源阻止优化（可选）
    if (enableResourceBlocking) {
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        const resourceType = request.resourceType();
        if (config.screenshot.performance.blockResources.includes(resourceType)) {
          request.abort();
        } else {
          request.continue();
        }
      });
    }
    
    // 设置视口
    await page.setViewport({
      width,
      height,
      deviceScaleFactor: scale
    });

    // 设置超时
    page.setDefaultTimeout(timeout);
    page.setDefaultNavigationTimeout(config.screenshot.performance.navigationTimeout);

    // 预处理HTML内容
    const processedHtmlContent = preprocessHtmlForScreenshot(htmlContent, options);

    // 优化后的内容设置 - 使用更快的等待策略
    await page.setContent(processedHtmlContent, {
      waitUntil: config.screenshot.performance.waitStrategy,
      timeout: config.screenshot.performance.navigationTimeout
    });

    // 智能图片加载检测 - 替换固定等待时间
    const imageWaitTime = options.imageWaitTime || 5000; // 默认最多等待5秒
    const imageResult = await waitForImagesIfNeeded(page, imageWaitTime);
    
    if (!imageResult.success) {
      console.warn('[Screenshot] 图片检测失败，继续截图流程');
    }

    // 如果没有图片或图片已加载完成，仍然保留少量等待时间确保渲染完成
    const additionalWait = imageResult.message === 'No images found' ? 
      Math.min(config.screenshot.performance.additionalWaitTime, 200) : // 无图片时最多等待200ms
      config.screenshot.performance.additionalWaitTime; // 有图片时使用配置的等待时间
    
    if (additionalWait > 0) {
      await new Promise(resolve => setTimeout(resolve, additionalWait));
    }

    // 简化的智能内容区域检测
    let clipRegion = {
      x: 0,
      y: 0,
      width,
      height
    };

    if (options.smartCrop !== false && config.screenshot.smartCrop.enabled) {
      try {
        // 简化的内容边界检测
        const contentBounds = await page.evaluate((cropConfig) => {
          const elements = Array.from(document.querySelectorAll('*')).slice(0, cropConfig.maxElementsToCheck);
          let minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
          let hasContent = false;

          for (const element of elements) {
            const rect = element.getBoundingClientRect();
            const style = window.getComputedStyle(element);
            
            // 简化的可见性检查
            if (rect.width === 0 || rect.height === 0 || 
                style.display === 'none' || 
                style.visibility === 'hidden') {
              continue;
            }

            // 跳过复杂元素（性能优化）
            if (cropConfig.skipComplexElements && 
                (element.children.length > 10 || element.tagName === 'SVG')) {
              continue;
            }

            if (rect.left < minX) minX = rect.left;
            if (rect.top < minY) minY = rect.top;
            if (rect.right > maxX) maxX = rect.right;
            if (rect.bottom > maxY) maxY = rect.bottom;
            hasContent = true;
          }

          if (!hasContent || minX === Infinity) {
            return null;
          }

          const padding = Math.min(cropConfig.padding, cropConfig.maxPadding);
          return {
            x: Math.max(0, minX - padding),
            y: Math.max(0, minY - padding),
            width: Math.min(window.innerWidth, maxX - minX + padding * 2),
            height: Math.min(window.innerHeight, maxY - minY + padding * 2)
          };
        }, config.screenshot.smartCrop);

        const minSize = config.screenshot.smartCrop.minContentSize;
        if (contentBounds && contentBounds.width > minSize && contentBounds.height > minSize) {
          clipRegion = contentBounds;
          console.log(`[CROP] Smart crop: ${clipRegion.width}x${clipRegion.height} at (${clipRegion.x}, ${clipRegion.y})`);
        }
      } catch (error) {
        console.warn('[CROP] Smart crop failed, using full viewport:', error.message);
      }
    }

    // 构建截图选项
    const screenshotOptions = {
      type: format,
      clip: clipRegion
    };

    // 只有JPEG和WebP格式支持quality参数
    if ((format === 'jpeg' || format === 'webp') && quality) {
      screenshotOptions.quality = quality;
    }

    // 生成截图
    const buffer = await page.screenshot(screenshotOptions);
    
    const duration = Date.now() - startTime;
    totalRequestsProcessed++;
    
    console.log(`[SUCCESS] Screenshot generated in ${duration}ms, size: ${buffer.length} bytes`);

    // 设置响应头
    res.set({
      'Content-Type': `image/${format}`,
      'Content-Length': buffer.length,
      'X-Processing-Time': `${duration}ms`,
      'X-Total-Processed': totalRequestsProcessed
    });

    res.send(buffer);

  } catch (error) {
    const duration = Date.now() - startTime;
    
    console.error(`[ERROR] Screenshot failed in ${duration}ms:`, error.message);

    res.status(500).json({
      error: 'Screenshot generation failed',
      message: error.message,
      duration: `${duration}ms`
    });
  } finally {
    activePagesCount--;
    
    // 清理页面资源
    if (page) {
      try {
        await page.close();
      } catch (error) {
        console.warn('[CLEANUP] Failed to close page:', error.message);
      }
    }
  }
});

/**
 * 性能统计端点
 */
app.get('/stats', authenticate, (req, res) => {
  res.json({
    service: 'screenshot-service',
    version: '1.1.0',
    performance: {
      ...performanceStats,
      activePagesCount,
      totalRequestsProcessed,
      uptime: process.uptime()
    },
    memory: process.memoryUsage(),
    config: {
      maxConcurrentPages: config.screenshot.performance.maxConcurrentPages,
      waitStrategy: config.screenshot.performance.waitStrategy,
      resourceBlocking: config.screenshot.performance.enableResourceBlocking
    }
  });
});

/**
 * 服务信息端点
 */
app.get('/info', authenticate, (req, res) => {
  res.json({
    service: 'screenshot-service',
    version: '1.1.0',
    environment: process.env.NODE_ENV || 'development',
    config: {
      maxWidth: config.screenshot.maxWidth,
      maxHeight: config.screenshot.maxHeight,
      supportedFormats: config.screenshot.supportedFormats,
      defaultTimeout: config.screenshot.performance.pageTimeout,
      maxConcurrentPages: config.screenshot.performance.maxConcurrentPages
    }
  });
});

/**
 * 预处理HTML内容以优化截图效果
 */
function preprocessHtmlForScreenshot(htmlContent, options = {}) {
  // 如果已经是完整的HTML文档，直接处理
  if (htmlContent.includes('<!DOCTYPE') || htmlContent.includes('<html')) {
    // 注入优化CSS
    const optimizationCSS = `
      <style>
        /* 截图优化样式 */
        * {
          box-sizing: border-box;
        }
        
        html, body {
          margin: 0 !important;
          padding: 0 !important;
          width: 100% !important;
          height: 100% !important;
          overflow: hidden !important;
          background: ${options.backgroundColor || 'transparent'} !important;
        }
        
        /* 确保内容居中显示 */
        body {
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
        }
        
        /* 移除可能的默认边距 */
        body > * {
          max-width: 100% !important;
          max-height: 100% !important;
        }
        
        /* 隐藏滚动条 */
        ::-webkit-scrollbar {
          display: none !important;
        }
        
        /* 确保图片不会溢出 */
        img {
          max-width: 100% !important;
          height: auto !important;
        }
      </style>
    `;
    
    // 在head标签中注入CSS，如果没有head标签则在body前添加
    if (htmlContent.includes('<head>')) {
      return htmlContent.replace('<head>', `<head>${optimizationCSS}`);
    } else if (htmlContent.includes('<body>')) {
      return htmlContent.replace('<body>', `${optimizationCSS}<body>`);
    } else {
      return `${optimizationCSS}${htmlContent}`;
    }
  }
  
  // 如果不是完整的HTML文档，包装它
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          /* 截图优化样式 */
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          html, body {
            width: 100%;
            height: 100%;
            overflow: hidden;
            background: ${options.backgroundColor || 'transparent'};
            display: flex;
            align-items: center;
            justify-content: center;
          }
          
          /* 内容容器 */
          .screenshot-container {
            max-width: 100%;
            max-height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          
          /* 确保图片不会溢出 */
          img {
            max-width: 100%;
            height: auto;
          }
          
          /* 隐藏滚动条 */
          ::-webkit-scrollbar {
            display: none;
          }
        </style>
      </head>
      <body>
        <div class="screenshot-container">
          ${htmlContent}
        </div>
      </body>
    </html>
  `;
}

// 404处理
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: 'The requested endpoint does not exist'
  });
});

// 简化的错误处理
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(err.status || 500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' ? 'Something went wrong' : err.message
  });
});

/**
 * 优雅关闭处理
 */
async function gracefulShutdown(signal) {
  console.log(`Received ${signal}, starting graceful shutdown...`);
  
  try {
    if (browser) {
      await browser.close();
      console.log('Browser closed successfully');
    }
  } catch (error) {
    console.error('Error closing browser:', error.message);
  }
  
  process.exit(0);
}

// 注册信号处理器
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

/**
 * 启动服务器
 */
async function startServer() {
  try {
    // 初始化浏览器
    await initializeBrowser();
    
    // 启动HTTP服务器
    const server = app.listen(config.server.port, config.server.host, () => {
      console.log(`Screenshot service started on ${config.server.host}:${config.server.port}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`Authentication: ${config.security.apiKey === 'disabled' ? 'disabled' : 'enabled'}`);
    });

    // 设置服务器超时
    server.timeout = config.server.timeout;
    
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
}

// 启动服务器
startServer(); 