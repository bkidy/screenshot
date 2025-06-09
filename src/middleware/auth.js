const config = require('../config/default');

/**
 * 简化的API密钥认证中间件（可选）
 */
function simpleAuth(req, res, next) {
  // 健康检查端点跳过认证
  if (req.path === '/health') {
    return next();
  }

  // 如果没有配置API密钥，则跳过认证
  if (!config.security.apiKey || config.security.apiKey === 'disabled') {
    return next();
  }

  const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
  
  if (!apiKey) {
    return res.status(401).json({ 
      error: 'API key required',
      message: 'Please provide API key in X-API-Key header'
    });
  }

  if (apiKey !== config.security.apiKey) {
    return res.status(403).json({ 
      error: 'Invalid API key'
    });
  }

  next();
}

/**
 * 无认证模式（内网环境）
 */
function noAuth(req, res, next) {
  next();
}

module.exports = {
  simpleAuth,
  noAuth,
  // 默认导出简化认证
  authenticate: simpleAuth
}; 