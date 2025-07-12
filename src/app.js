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
 * 智能性能模式检测 - 基于图片资源优先原则
 */
function detectPerformanceMode(htmlContent) {
  const imgCount = (htmlContent.match(/<img[^>]*>/gi) || []).length;
  const backgroundImages = (htmlContent.match(/background-image\s*:\s*url/gi) || []).length;
  const totalImages = imgCount + backgroundImages;
  
  if (totalImages === 0) {
    return 'ultrafast';
  } else if (totalImages <= 2) {
    return 'fast'; 
  } else {
    return 'standard';
  }
}

/**
 * 优化后的浏览器初始化
 */
async function initializeBrowser() {
  try {
    console.log('[BROWSER] Initializing...');
    browser = await puppeteer.launch({
      ...config.puppeteer,
      defaultViewport: config.puppeteer.defaultViewport
    });
    console.log('[BROWSER] Initialized successfully');
    
    // 浏览器健康检查
    setInterval(async () => {
      try {
        if (browser && browser.isConnected()) {
          const pages = await browser.pages();
          if (config.logging.logPerformance) {
            console.log(`[HEALTH] Browser: ${pages.length} pages, ${activePagesCount} active`);
          }
          // 如果处理的请求数过多，重启浏览器实例
          if (totalRequestsProcessed > config.browserPool.restartThreshold) {
            console.log(`[BROWSER] Restarting after ${totalRequestsProcessed} requests`);
            await restartBrowser();
          }
        } else {
          console.warn('[BROWSER] Disconnected, reinitializing...');
          await initializeBrowser();
        }
      } catch (error) {
        console.error('[BROWSER] Health check failed:', error.message);
      }
    }, config.browserPool.healthCheckInterval);
    
  } catch (error) {
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
    throw error;
  }
}

/**
 * 官方推荐的图片等待函数 - 基于Puppeteer最佳实践
 * @param {Object} page - Puppeteer页面对象
 * @param {number} timeout - 超时时间（毫秒）
 */
async function waitForAllImages(page, timeout = 8000) {
  try {
    const startTime = Date.now();
    
    // 官方推荐的图片等待方法
    await page.evaluate(async () => {
      // 等待所有img标签加载完成
      const images = Array.from(document.querySelectorAll('img'));
      await Promise.all(images.map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise(resolve => {
          img.onload = resolve;
          img.onerror = resolve; // 重要：错误时也要resolve，避免无限等待
        });
      }));
      
      // 等待背景图片加载（如果有的话）
      const elementsWithBg = Array.from(document.querySelectorAll('*')).filter(el => {
        const style = window.getComputedStyle(el);
        return style.backgroundImage && style.backgroundImage !== 'none' && style.backgroundImage.includes('url(');
      });
      
      if (elementsWithBg.length > 0) {
        const bgImagePromises = elementsWithBg.map(el => {
          const style = window.getComputedStyle(el);
          const bgImage = style.backgroundImage;
          const urlMatch = bgImage.match(/url\(['"]?([^'"]+)['"]?\)/);
          
          if (urlMatch && urlMatch[1]) {
            return new Promise(resolve => {
              const img = new Image();
              img.onload = resolve;
              img.onerror = resolve; // 错误时也resolve
              img.src = urlMatch[1];
            });
          }
          return Promise.resolve();
        });
        
        await Promise.all(bgImagePromises);
      }
    });

    const duration = Date.now() - startTime;
    
    // 获取加载统计信息
    const stats = await page.evaluate(() => {
      const images = document.querySelectorAll('img');
      let loaded = 0, failed = 0;
      
      for (const img of images) {
        if (img.complete) {
          if (img.naturalWidth > 0) {
            loaded++;
          } else {
            failed++;
          }
        }
      }
      
      const bgElements = Array.from(document.querySelectorAll('*')).filter(el => {
        const style = window.getComputedStyle(el);
        return style.backgroundImage && style.backgroundImage !== 'none' && style.backgroundImage.includes('url(');
      });
      
      return {
        totalImages: images.length,
        loadedImages: loaded,
        failedImages: failed,
        backgroundImages: bgElements.length
      };
    });
    
    return { 
      success: true, 
      message: 'Official method completed',
      stats: stats,
      duration: duration
    };

  } catch (error) {
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
  const requestId = Math.random().toString(36).substr(2, 9);
  let page = null;

  try {
    activePagesCount++;
    
    // 参数验证
    const validationErrors = validateScreenshotParams(req.body);
    if (validationErrors.length > 0) {
      console.warn(`[REQ] Parameter validation failed:`, validationErrors);
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
    
    // 生产日志：请求开始
    console.log(`[REQ] ${width}x${height} ${format} - Active: ${activePagesCount}/${config.screenshot.performance.maxConcurrentPages}`);

    // 检查浏览器状态
    if (!browser || !browser.isConnected()) {
      await initializeBrowser();
    }

    // 创建新页面
    page = await browser.newPage();
    
    // 页面错误监听
    page.on('error', () => {});
    page.on('pageerror', () => {});
    page.on('requestfailed', () => {});
    
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

    // 智能性能模式选择 - 基于内容自动检测
    const detectedMode = detectPerformanceMode(htmlContent);
    const isCompleteHtml = htmlContent.includes('<!DOCTYPE') || htmlContent.includes('<html');
    
    // 生产日志：模式检测
    console.log(`[MODE] ${detectedMode} - Images: ${(htmlContent.match(/<img[^>]*>/gi) || []).length}`);
    
    // 根据检测结果设置模式
    const ultraFastMode = detectedMode === 'ultrafast';
    const fastMode = detectedMode === 'fast';
    const standardMode = detectedMode === 'standard';
    
    // 使用保守的load策略确保资源完全加载
    let waitStrategy = 'load'; // 改为load事件，等待所有资源
    let additionalConcurrencyWait = 0;
    
    if (activePagesCount >= 3) {
      additionalConcurrencyWait = activePagesCount * 300;
    }
    
    // 超快速模式
    if (ultraFastMode) {
      
      // 使用load事件等待所有资源
      await page.setContent(processedHtmlContent, {
        waitUntil: waitStrategy,
        timeout: 15000 + additionalConcurrencyWait // 增加超时时间适应load事件
      });
      
      // 等待字体渲染完成
      try {
        await Promise.race([
          page.evaluate(() => document.fonts.ready),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Font timeout')), 3000))
        ]);
        // Font loaded successfully
      } catch (error) {
        console.warn(`[FONT] Loading timeout in ultrafast mode`);
      }
      
      // 改进的图片检测逻辑
      const imageDetectionResult = await page.evaluate(() => {
        const images = document.querySelectorAll('img');
        const imageCount = images.length;
        
        // 检查所有img标签的加载状态
        let loadedImgs = 0;
        let failedImgs = 0;
        
        for (const img of images) {
          if (img.complete) {
            if (img.naturalWidth > 0) {
              loadedImgs++;
            } else {
              failedImgs++;
            }
          }
        }
        
        // 检查背景图片
        const elementsWithBg = Array.from(document.querySelectorAll('*')).filter(el => {
          const style = window.getComputedStyle(el);
          return style.backgroundImage && style.backgroundImage !== 'none' && style.backgroundImage.includes('url(');
        });
        
        return {
          totalImages: imageCount,
          loadedImages: loadedImgs,
          failedImages: failedImgs,
          pendingImages: imageCount - loadedImgs - failedImgs,
          backgroundImageCount: elementsWithBg.length,
          needsWaiting: (imageCount > 0 && loadedImgs + failedImgs < imageCount) || elementsWithBg.length > 0
        };
      });
      
      if (imageDetectionResult.needsWaiting) {
        // 根据图片数量动态调整等待时间
        const baseWaitTime = config.screenshot.performance.ultraFastWaitTime || 3000;
        const imageCount = imageDetectionResult.totalImages + imageDetectionResult.backgroundImageCount;
        const dynamicWaitTime = Math.min(baseWaitTime + (imageCount * 200), 8000); // 每个图片额外等200ms，最多8秒
        
        await new Promise(resolve => setTimeout(resolve, dynamicWaitTime + additionalConcurrencyWait));
      } else {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
    } else {
      // 标准/快速模式：使用load事件等待所有资源
      await page.setContent(processedHtmlContent, {
        waitUntil: waitStrategy,
        timeout: 20000 + additionalConcurrencyWait // 增加超时时间适应load事件
      });
      
      // 等待字体渲染完成
      try {
        await Promise.race([
          page.evaluate(() => document.fonts.ready),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Font timeout')), 5000))
        ]);
      } catch (error) {
        // Font loading failed, continue
      }

      // 智能图片检测 - 根据内容类型选择策略
      let imageResult = { success: true, message: 'Skipped', stats: { totalImages: 0, totalBgImages: 0 } };
      
      if (fastMode) {
        
        // 改进的图片检测 - 获取实际图片数量和状态
        const imageAnalysis = await page.evaluate(() => {
          const images = document.querySelectorAll('img');
          const imageCount = images.length;
          
          // 检查img标签加载状态
          let loadedImgs = 0;
          let pendingImgs = 0;
          
          for (const img of images) {
            if (img.complete && img.naturalWidth > 0) {
              loadedImgs++;
            } else if (!img.complete) {
              pendingImgs++;
            }
          }
          
          // 检查背景图片数量
          const bgElements = Array.from(document.querySelectorAll('*')).filter(el => {
            const style = window.getComputedStyle(el);
            return style.backgroundImage && style.backgroundImage !== 'none' && style.backgroundImage.includes('url(');
          });
          
          return { 
            totalImages: imageCount,
            loadedImages: loadedImgs,
            pendingImages: pendingImgs,
            backgroundImages: bgElements.length,
            hasImages: imageCount > 0,
            hasBgImages: bgElements.length > 0
          };
        });
        
        if (imageAnalysis.hasImages || imageAnalysis.hasBgImages) {
          // load事件后的最终图片检查等待
          const totalImageCount = imageAnalysis.totalImages + imageAnalysis.backgroundImages;
          const baseWaitTime = fastMode ? 300 : 500; // 减少等待时间，因为load事件已确保加载
          const dynamicWaitTime = Math.min(baseWaitTime + (totalImageCount * 100), 2000); // 每个图片100ms，最多2秒
          
          await new Promise(resolve => setTimeout(resolve, dynamicWaitTime));
        }
        
        imageResult = { 
          success: true, 
          message: 'Improved fast mode', 
          stats: { 
            totalImages: imageAnalysis.totalImages, 
            totalBgImages: imageAnalysis.backgroundImages,
            loadedImages: imageAnalysis.loadedImages
          } 
        };
      } else if (standardMode) {
        const imageWaitTime = options.imageWaitTime || 3000;
        imageResult = await waitForAllImages(page, imageWaitTime);
      }

      // 额外等待时间
      let additionalWait = fastMode ? 100 : 
        (imageResult.stats && imageResult.stats.totalBgImages > 0) ? 200 : 100;
      
      if (additionalWait > 0) {
        await new Promise(resolve => setTimeout(resolve, additionalWait));
      }

      // 渲染完成检查
      if (!fastMode) {
        try {
          await page.evaluate(() => {
            return new Promise((resolve) => {
              if (document.readyState === 'complete') {
                requestAnimationFrame(() => resolve());
              } else {
                window.addEventListener('load', () => {
                  requestAnimationFrame(() => resolve());
                });
              }
            });
          });
        } catch (error) {
          // Render check failed, continue
        }
      }
    }

    // 智能内容区域检测 - 根据性能模式决定是否启用
    let clipRegion = {
      x: 0,
      y: 0,
      width,
      height
    };

    // 智能裁剪检测
    const shouldSkipSmartCrop = ultraFastMode || 
      (fastMode && config.screenshot.performance.disableSmartCropInFastMode);

    if (!shouldSkipSmartCrop && options.smartCrop !== false && config.screenshot.smartCrop.enabled) {
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
        }
      } catch (error) {
        // Smart crop failed, use full viewport
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

    // 生产日志：请求成功
    console.log(`[SUCCESS] ${duration}ms - ${(buffer.length/1024).toFixed(1)}KB - Total: ${totalRequestsProcessed}`);

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

    // 生产日志：请求失败
    console.error(`[ERROR] ${duration}ms - ${error.message} - Active: ${activePagesCount}`);

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
        // Failed to close page
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
  // 如果已经是完整的HTML文档，使用最小化干预策略
  if (htmlContent.includes('<!DOCTYPE') || htmlContent.includes('<html')) {
    // 注入最小化的重置CSS，避免干扰原有布局
    const optimizationCSS = `
      <style>
        /* 最小化截图优化样式 - 仅重置必要的默认样式 */
        html, body {
          margin: 0 !important;
          padding: 0 !important;
          /* 移除强制的宽高限制，保持原有尺寸 */
          /* 移除强制的overflow hidden，让内容自然显示 */
          background: ${options.backgroundColor || 'transparent'} !important;
        }
        
        /* 移除强制的flex布局，保持原有布局系统 */
        
        /* 隐藏滚动条但不影响布局 */
        ::-webkit-scrollbar {
          display: none !important;
        }
        
        /* 移除对img标签的强制限制，保持原有样式 */
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
  
  // 如果不是完整的HTML文档，使用包装容器（保持原有逻辑）
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          /* 截图优化样式 - 仅用于HTML片段 */
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

// 错误处理
app.use((err, req, res, next) => {
  res.status(err.status || 500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' ? 'Something went wrong' : err.message
  });
});

/**
 * 优雅关闭处理
 */
async function gracefulShutdown() {
  console.log('[SERVER] Shutting down gracefully...');
  try {
    if (browser) {
      await browser.close();
      console.log('[BROWSER] Closed successfully');
    }
  } catch (error) {
    console.error('[BROWSER] Error closing:', error.message);
  }
  console.log('[SERVER] Shutdown complete');
  process.exit(0);
}

// 注册信号处理器
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

/**
 * 启动服务器
 */
async function startServer() {
  try {
    await initializeBrowser();
    const server = app.listen(config.server.port, config.server.host);
    server.timeout = config.server.timeout;
    console.log(`[SERVER] Screenshot service started on ${config.server.host}:${config.server.port}`);
  } catch (error) {
    console.error('[SERVER] Failed to start:', error.message);
    process.exit(1);
  }
}

// 启动服务器
startServer(); 