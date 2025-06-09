const winston = require('winston');
const config = require('../config/default');

// 自定义日志格式
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// 开发环境格式（更易读）
const devFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: 'HH:mm:ss'
  }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length > 0) {
      msg += ` ${JSON.stringify(meta)}`;
    }
    return msg;
  })
);

// 创建logger实例
const logger = winston.createLogger({
  level: config.logging.level,
  format: process.env.NODE_ENV === 'production' ? logFormat : devFormat,
  defaultMeta: { 
    service: 'screenshot-service',
    version: process.env.npm_package_version || '1.0.0'
  },
  transports: [
    // 控制台输出
    new winston.transports.Console({
      handleExceptions: true,
      handleRejections: true
    })
  ]
});

// 生产环境添加文件日志
if (process.env.NODE_ENV === 'production') {
  // 错误日志文件
  logger.add(new winston.transports.File({
    filename: '/var/log/screenshot-service/error.log',
    level: 'error',
    maxsize: 10485760, // 10MB
    maxFiles: 5,
    tailable: true
  }));

  // 所有日志文件
  logger.add(new winston.transports.File({
    filename: '/var/log/screenshot-service/combined.log',
    maxsize: 10485760, // 10MB
    maxFiles: 10,
    tailable: true
  }));
}

// 添加请求日志中间件
const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  // 记录请求开始
  logger.info('Request started', {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    contentLength: req.get('Content-Length')
  });

  // 监听响应结束
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logLevel = res.statusCode >= 400 ? 'warn' : 'info';
    
    logger.log(logLevel, 'Request completed', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      contentLength: res.get('Content-Length')
    });
  });

  next();
};

// 错误日志中间件
const errorLogger = (err, req, res, next) => {
  logger.error('Request error', {
    error: err.message,
    stack: err.stack,
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  
  next(err);
};

// 性能监控日志
const performanceLogger = {
  logScreenshotPerformance: (duration, width, height, format, success = true) => {
    logger.info('Screenshot performance', {
      duration: `${duration}ms`,
      width,
      height,
      format,
      success,
      type: 'performance'
    });
  },

  logMemoryUsage: () => {
    const memUsage = process.memoryUsage();
    logger.info('Memory usage', {
      rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
      external: `${Math.round(memUsage.external / 1024 / 1024)}MB`,
      type: 'memory'
    });
  }
};

module.exports = {
  logger,
  requestLogger,
  errorLogger,
  performanceLogger
};

// 导出默认logger
module.exports.default = logger; 