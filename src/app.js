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
 * 检测并等待所有图片（包括背景图片）加载完成
 * @param {Object} page - Puppeteer页面对象
 * @param {number} maxWaitTime - 最大等待时间（毫秒）
 */
async function waitForAllImagesIfNeeded(page, maxWaitTime = 8000) {
  try {
    // 检测页面中的所有图片（包括背景图片）
    const imageInfo = await page.evaluate(() => {
      const images = document.querySelectorAll('img');
      const imageCount = images.length;
      
      // 检查CSS背景图片
      const elementsWithBgImages = [];
      const allElements = document.querySelectorAll('*');
      
      for (const element of allElements) {
        const style = window.getComputedStyle(element);
        const bgImage = style.backgroundImage;
        
        if (bgImage && bgImage !== 'none' && bgImage.includes('url(')) {
          // 提取背景图片URL
          const urlMatch = bgImage.match(/url\(['"]?([^'"]+)['"]?\)/);
          if (urlMatch && urlMatch[1]) {
            elementsWithBgImages.push({
              element,
              url: urlMatch[1],
              loaded: false
            });
          }
        }
      }
      
      console.log(`[ImageDetection] 发现 ${imageCount} 个img标签, ${elementsWithBgImages.length} 个背景图片`);
      
      if (imageCount === 0 && elementsWithBgImages.length === 0) {
        return { 
          hasImages: false, 
          totalImages: 0,
          totalBgImages: 0
        };
      }

      // 检查img标签加载状态
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
      
      // 检查背景图片加载状态
      let bgLoadedCount = 0;
      const bgImagePromises = [];
      
      for (const bgInfo of elementsWithBgImages) {
        const testImg = new Image();
        const promise = new Promise((resolve) => {
          testImg.onload = () => {
            bgInfo.loaded = true;
            bgLoadedCount++;
            resolve(true);
          };
          testImg.onerror = () => {
            resolve(false);
          };
          testImg.src = bgInfo.url;
        });
        bgImagePromises.push(promise);
      }
      
      return {
        hasImages: true,
        totalImages: imageCount,
        totalBgImages: elementsWithBgImages.length,
        loadedImages: loadedCount,
        failedImages: failedCount,
        bgImagePromises,
        bgImageUrls: elementsWithBgImages.map(bg => bg.url),
        needsWaiting: (loadedCount + failedCount) < imageCount || elementsWithBgImages.length > 0
      };
    });

    // 如果没有图片，直接返回
    if (!imageInfo.hasImages) {
      console.log('[ImageCheck] 页面无图片，跳过等待');
      return { success: true, message: 'No images found' };
    }

    console.log(`[ImageCheck] 发现 ${imageInfo.totalImages} 个img标签, ${imageInfo.totalBgImages} 个背景图片`);
    console.log(`[ImageCheck] 背景图片URLs: ${imageInfo.bgImageUrls.join(', ')}`);

    // 如果有背景图片，需要特别处理
    if (imageInfo.totalBgImages > 0) {
      console.log(`[ImageCheck] 检测到背景图片，开始等待加载...`);
      
      const startTime = Date.now();
      const checkInterval = 300; // 每300ms检查一次
      let allBgImagesLoaded = false;
      
      // 等待背景图片加载
      while (Date.now() - startTime < maxWaitTime && !allBgImagesLoaded) {
        const bgLoadStatus = await page.evaluate((bgUrls) => {
          let loadedCount = 0;
          const promises = bgUrls.map(url => {
            return new Promise((resolve) => {
              const testImg = new Image();
              testImg.onload = () => resolve(true);
              testImg.onerror = () => resolve(false);
              testImg.src = url;
              
              // 如果图片已经在缓存中，立即触发onload
              if (testImg.complete) {
                if (testImg.naturalWidth > 0) {
                  resolve(true);
                } else {
                  resolve(false);
                }
              }
            });
          });
          
          return Promise.all(promises).then(results => {
            const loaded = results.filter(r => r).length;
            return {
              loadedBgImages: loaded,
              totalBgImages: bgUrls.length,
              allLoaded: loaded === bgUrls.length
            };
          });
        }, imageInfo.bgImageUrls);
        
        console.log(`[ImageCheck] 背景图片加载状态: ${bgLoadStatus.loadedBgImages}/${bgLoadStatus.totalBgImages}`);
        
        if (bgLoadStatus.allLoaded) {
          allBgImagesLoaded = true;
          const waitTime = Date.now() - startTime;
          console.log(`[ImageCheck] 所有背景图片加载完成 - 耗时: ${waitTime}ms`);
          break;
        }
        
        // 等待一小段时间后再次检查
        await new Promise(resolve => setTimeout(resolve, checkInterval));
      }
      
      if (!allBgImagesLoaded) {
        const waitTime = Date.now() - startTime;
        console.log(`[ImageCheck] 背景图片等待超时 - 耗时: ${waitTime}ms，继续截图流程`);
      }
    }

    // 检查常规img标签
    if (imageInfo.totalImages > 0) {
      const startTime = Date.now();
      const checkInterval = 200;
      
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

        // 如果所有img标签都处理完成，退出等待
        if (currentStatus.totalProcessed >= currentStatus.totalImages) {
          const waitTime = Date.now() - startTime;
          console.log(`[ImageCheck] img标签加载完成 - 耗时: ${waitTime}ms, 成功: ${currentStatus.loadedImages}, 失败: ${currentStatus.failedImages}`);
          break;
        }

        await new Promise(resolve => setTimeout(resolve, checkInterval));
      }
    }

    return { 
      success: true, 
      message: 'All images processed',
      stats: {
        totalImages: imageInfo.totalImages,
        totalBgImages: imageInfo.totalBgImages
      }
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

    // 智能性能模式选择
    const isCompleteHtml = htmlContent.includes('<!DOCTYPE') || htmlContent.includes('<html');
    const ultraFastMode = config.screenshot.performance.ultraFastMode;
    const fastMode = config.screenshot.performance.fastMode;
    const enableSmartDetection = config.screenshot.performance.enableSmartDetection;
    
    // 超快速模式：对完整HTML文档使用简化检测
    if (ultraFastMode && isCompleteHtml) {
      console.log('[Screenshot] 超快速模式：简化检测，快速截图');
      
      // 使用快速的页面设置策略
      await page.setContent(processedHtmlContent, {
        waitUntil: config.screenshot.performance.ultraFastWaitStrategy || 'domcontentloaded',
        timeout: 8000
      });
      
      // 检测img标签和背景图片
      const hasImages = await page.evaluate(() => {
        const images = document.querySelectorAll('img');
        const bgImages = Array.from(document.querySelectorAll('*')).some(el => {
          const style = window.getComputedStyle(el);
          return style.backgroundImage && style.backgroundImage !== 'none' && style.backgroundImage.includes('url(');
        });
        return { 
          hasImgTags: images.length > 0, 
          hasBgImages: bgImages,
          total: images.length + (bgImages ? 1 : 0)
        };
      });
      
      if (hasImages.hasImgTags || hasImages.hasBgImages) {
        const waitTime = config.screenshot.performance.ultraFastWaitTime || 2000;
        const imageType = hasImages.hasImgTags && hasImages.hasBgImages ? 'img标签和背景图片' : 
                         hasImages.hasImgTags ? 'img标签' : '背景图片';
        console.log(`[Screenshot] 超快速模式：检测到${imageType}，等待 ${waitTime}ms`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      } else {
        const baseWaitTime = 500; // 基本等待时间
        console.log(`[Screenshot] 超快速模式：无图片内容，基本等待 ${baseWaitTime}ms`);
        await new Promise(resolve => setTimeout(resolve, baseWaitTime));
      }
      
    } else {
      // 标准/快速模式：使用原有逻辑
      await page.setContent(processedHtmlContent, {
        waitUntil: config.screenshot.performance.waitStrategy,
        timeout: config.screenshot.performance.navigationTimeout
      });

      // 智能图片检测 - 根据内容类型选择策略
      let imageResult = { success: true, message: 'Skipped', stats: { totalImages: 0, totalBgImages: 0 } };
      
      if (enableSmartDetection && isCompleteHtml && config.screenshot.performance.skipImageDetectionForCompleteHtml) {
        // 对于完整HTML文档，使用快速检测
        console.log('[Screenshot] 完整HTML文档，使用快速模式，跳过复杂图片检测');
        
        // 简单的图片存在性检查
        const hasImages = await page.evaluate(() => {
          const images = document.querySelectorAll('img');
          const bgImages = Array.from(document.querySelectorAll('*')).some(el => {
            const style = window.getComputedStyle(el);
            return style.backgroundImage && style.backgroundImage !== 'none' && style.backgroundImage.includes('url(');
          });
          return { hasImages: images.length > 0, hasBgImages: bgImages };
        });
        
        if (hasImages.hasImages || hasImages.hasBgImages) {
          // 如果有图片，给一个较短的等待时间
          const quickWaitTime = fastMode ? 500 : 1000; // 进一步减少等待时间
          console.log(`[Screenshot] 检测到图片，快速等待 ${quickWaitTime}ms`);
          await new Promise(resolve => setTimeout(resolve, quickWaitTime));
        }
        
        imageResult = { 
          success: true, 
          message: 'Fast mode', 
          stats: { 
            totalImages: hasImages.hasImages ? 1 : 0, 
            totalBgImages: hasImages.hasBgImages ? 1 : 0 
          } 
        };
      } else {
        // 使用完整的图片检测逻辑（保留原有功能）
        const imageWaitTime = options.imageWaitTime || config.screenshot.performance.imageWaitTime || 2000;
        imageResult = await waitForAllImagesIfNeeded(page, imageWaitTime);
        
        if (!imageResult.success) {
          console.warn('[Screenshot] 图片检测失败，继续截图流程');
        }
      }

      // 优化后的额外等待时间逻辑
      let additionalWait;
      
      if (fastMode) {
        additionalWait = config.screenshot.performance.fastModeWaitTime || 100;
        console.log(`[Screenshot] 快速模式，等待时间 ${additionalWait}ms`);
      } else if (imageResult.stats && imageResult.stats.totalBgImages > 0) {
        additionalWait = config.screenshot.performance.renderCompletionWaitTime || 200;
        console.log(`[Screenshot] 检测到背景图片，等待时间 ${additionalWait}ms`);
      } else {
        additionalWait = Math.min(config.screenshot.performance.additionalWaitTime || 300, 100);
      }
      
      if (additionalWait > 0) {
        await new Promise(resolve => setTimeout(resolve, additionalWait));
      }

      // 简化的渲染完成检查 - 仅在标准模式下执行
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
          console.log('[Screenshot] 渲染完成检查通过');
        } catch (error) {
          console.warn('[Screenshot] 渲染完成检查失败，继续截图:', error.message);
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

    // 超快速模式或快速模式下禁用Smart Crop
    const shouldSkipSmartCrop = ultraFastMode || 
      (fastMode && config.screenshot.performance.disableSmartCropInFastMode);

    if (!shouldSkipSmartCrop && options.smartCrop !== false && config.screenshot.smartCrop.enabled) {
      try {
        console.log('[Screenshot] 执行智能裁剪检测');
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
    } else {
      console.log('[Screenshot] 跳过智能裁剪（性能优化）');
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