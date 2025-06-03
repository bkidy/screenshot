const rateLimit = require('express-rate-limit');

/**
 * 简化的速率限制中间件
 */
const simpleRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 200, // 每15分钟最多200个请求（相对宽松）
  message: {
    error: 'Too many requests',
    message: 'Please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * 截图专用速率限制（稍微严格一些）
 */
const screenshotRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5分钟
  max: 50, // 每5分钟最多50个截图请求
  message: {
    error: 'Screenshot rate limit exceeded',
    message: 'Please wait before making more screenshot requests'
  }
});

/**
 * 无限制模式（内网环境）
 */
const noRateLimit = (req, res, next) => {
  next();
};

module.exports = {
  simpleRateLimit,
  screenshotRateLimit,
  noRateLimit,
  // 默认导出简化限制
  generalRateLimit: simpleRateLimit,
  healthCheckRateLimit: noRateLimit
}; 