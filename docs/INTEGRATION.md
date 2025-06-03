# 主站项目集成指南（轻量化版本）

本文档说明如何在您的主站项目中集成轻量化的截图服务。

## 🪶 轻量化特性

此版本专为内网环境设计，具有以下特点：
- **默认关闭认证**: 内网环境无需复杂的API密钥验证
- **宽松的CORS策略**: 默认允许所有源访问
- **简化的速率限制**: 基础保护，不影响正常使用
- **最小化依赖**: 移除了复杂的安全中间件
- **即开即用**: 无需复杂配置即可部署

## 🔧 主站项目配置

### 1. 更新 dockerScreenshotService.ts（简化版本）

修改您主站项目中的 `app/src/server/dockerScreenshotService.ts` 文件：

```typescript
import axios from 'axios'
import { InternalScreenshotRequest } from '../shared/types/screenshot'

// 截图服务配置
const SCREENSHOT_SERVICE_URL = process.env.SCREENSHOT_SERVICE_URL || 'http://localhost:3002/screenshot'
const MAX_RETRIES = 3
const RETRY_DELAY = 2000

class DockerScreenshotService {
  private isInitialized: boolean = false

  async initialize(): Promise<void> {
    console.log('[DockerScreenshotService] 开始初始化...')
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        // 检查服务是否可用（无需认证）
        await axios.get(SCREENSHOT_SERVICE_URL.replace('/screenshot', '/health'), { 
          timeout: 5000
        })
        this.isInitialized = true
        console.log('[DockerScreenshotService] 初始化成功')
        return
      } catch (error) {
        console.error(`[DockerScreenshotService] 初始化失败 (尝试 ${attempt}/${MAX_RETRIES}):`, error instanceof Error ? error.message : error)
        
        if (attempt < MAX_RETRIES) {
          console.log(`[DockerScreenshotService] ${RETRY_DELAY}ms 后重试...`)
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY))
        }
      }
    }
    
    throw new Error('Docker截图服务初始化失败，请检查服务是否正常运行')
  }

  async generateScreenshot(request: InternalScreenshotRequest): Promise<Buffer> {
    if (!this.isInitialized) {
      await this.initialize()
    }

    console.log(`[DockerScreenshotService] 开始生成截图 - 尺寸: ${request.width}x${request.height}, 类型: ${request.type}`)

    try {
      // 预处理截图选项
      const format = request.options?.format || 'png'
      const processedOptions: any = {
        format,
        scale: request.options?.scale || 2,
        timeout: request.options?.timeout || 30000
      }

      // 只有当格式为jpeg时才添加quality参数
      if (format === 'jpeg' && request.options?.quality) {
        processedOptions.quality = request.options.quality
      }

      // 简化的请求，无需认证头
      const response = await axios.post(SCREENSHOT_SERVICE_URL, {
        htmlContent: request.htmlContent,
        width: request.width,
        height: request.height,
        options: processedOptions
      }, {
        responseType: 'arraybuffer',
        timeout: processedOptions.timeout + 5000,
        maxContentLength: 50 * 1024 * 1024,
        maxBodyLength: 10 * 1024 * 1024,
        headers: {
          'Content-Type': 'application/json'
        }
      })

      const buffer = Buffer.from(response.data)
      console.log(`[DockerScreenshotService] 截图生成成功 - 大小: ${buffer.length} bytes`)
      return buffer

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error(`[DockerScreenshotService] 截图生成失败:`, errorMessage)
      throw new Error(`截图生成失败: ${errorMessage}`)
    }
  }

  getStatus(): {
    isInitialized: boolean
    serviceUrl: string
  } {
    return {
      isInitialized: this.isInitialized,
      serviceUrl: SCREENSHOT_SERVICE_URL
    }
  }

  async reset(): Promise<void> {
    console.log('[DockerScreenshotService] 手动重置服务状态...')
    this.isInitialized = false
    await this.initialize()
  }
}

export const dockerScreenshotService = new DockerScreenshotService()
export default DockerScreenshotService
```

### 2. 更新环境变量（简化版本）

在您的主站项目中添加以下环境变量：

```bash
# .env 文件（轻量化版本）
SCREENSHOT_SERVICE_URL=http://localhost:3002/screenshot
# 注意：由于默认关闭认证，不需要 SCREENSHOT_API_KEY
```

对于生产环境，如果截图服务部署在同一台服务器：

```bash
# 生产环境配置
SCREENSHOT_SERVICE_URL=http://screenshot-service:3002/screenshot
```

### 3. Docker Compose 网络配置（简化版本）

如果您的主站项目也使用 Docker Compose：

```yaml
# 主站项目的 docker-compose.yml
version: '3.8'

services:
  main-app:
    # ... 您的主应用配置
    environment:
      - SCREENSHOT_SERVICE_URL=http://screenshot-service:3002/screenshot
    # 注意：无需 SCREENSHOT_API_KEY 环境变量
```

## 🚀 部署配置

### 1. 服务器部署

在您的服务器上：

```bash
# 1. 部署截图服务
cd /path/to/screenshot-service
./scripts/deploy.sh deploy

# 2. 配置防火墙（可选）
sudo ufw allow from 172.16.0.0/12 to any port 3002
sudo ufw deny 3002

# 3. 验证服务
curl -H "X-API-Key: your-api-key" http://localhost:3002/health
```

### 2. 网络配置

确保主站项目可以访问截图服务：

```bash
# 测试网络连接
docker exec -it main-app-container curl -H "X-API-Key: your-api-key" http://screenshot-service:3002/health
```

### 3. 安全配置

在截图服务的 `.env` 文件中配置IP白名单：

```bash
# 允许主站项目访问
ALLOWED_IPS=172.16.0.0/12,192.168.0.0/16,10.0.0.0/8
```

## 📊 监控和日志

### 1. 健康检查

在主站项目中添加健康检查：

```typescript
// 健康检查端点
app.get('/api/health/screenshot', async (req, res) => {
  try {
    const status = dockerScreenshotService.getStatus()
    res.json({
      service: 'screenshot',
      ...status
    })
  } catch (error) {
    res.status(503).json({
      service: 'screenshot',
      status: 'error',
      error: error.message
    })
  }
})
```

### 2. 错误处理

```typescript
// 在 screenshotOperations.ts 中添加降级处理
export const generateScreenshot: GenerateScreenshot = async (args, context) => {
  try {
    // 尝试使用独立截图服务
    return await dockerScreenshotService.generateScreenshot(request)
  } catch (error) {
    console.error('独立截图服务失败，尝试降级方案:', error)
    
    // 可以实现降级到前端截图或返回错误
    throw new HttpError(503, '截图服务暂时不可用，请稍后重试')
  }
}
```

## 🔧 开发环境配置

### 1. 本地开发

```bash
# 启动截图服务
cd screenshot-service
./scripts/deploy.sh deploy

# 启动主站项目
cd ../main-project
wasp start
```

### 2. 环境变量

开发环境的 `.env` 文件：

```bash
# 开发环境
SCREENSHOT_SERVICE_URL=http://localhost:3002/screenshot
SCREENSHOT_API_KEY=dev-api-key-123
```

## 🚨 故障排除

### 常见问题

1. **连接被拒绝**
   ```bash
   # 检查截图服务是否运行
   docker ps | grep screenshot-service
   
   # 检查网络连接
   telnet localhost 3002
   ```

2. **认证失败**
   ```bash
   # 检查API密钥配置
   echo $SCREENSHOT_API_KEY
   
   # 测试认证
   curl -H "X-API-Key: $SCREENSHOT_API_KEY" http://localhost:3002/health
   ```

3. **超时错误**
   ```bash
   # 增加超时时间
   SCREENSHOT_TIMEOUT=60000
   
   # 检查服务性能
   docker stats screenshot-service
   ```

### 性能优化

1. **连接池**
   ```typescript
   // 使用连接池优化性能
   const axiosInstance = axios.create({
     baseURL: SCREENSHOT_SERVICE_URL,
     timeout: 30000,
     headers: {
       'X-API-Key': SCREENSHOT_API_KEY
     }
   })
   ```

2. **缓存策略**
   ```typescript
   // 实现截图缓存
   const screenshotCache = new Map()
   
   async function getCachedScreenshot(htmlHash: string) {
     if (screenshotCache.has(htmlHash)) {
       return screenshotCache.get(htmlHash)
     }
     // 生成新截图并缓存
   }
   ```

## 📈 扩展配置

### 负载均衡

如果需要多个截图服务实例：

```yaml
# docker-compose.yml
services:
  screenshot-service-1:
    # ... 配置
    ports:
      - "3002:3002"
  
  screenshot-service-2:
    # ... 配置  
    ports:
      - "3003:3002"
  
  nginx:
    image: nginx
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
    ports:
      - "3001:80"
```

### 监控集成

```typescript
// 添加监控指标
import { prometheus } from 'prom-client'

const screenshotDuration = new prometheus.Histogram({
  name: 'screenshot_duration_seconds',
  help: 'Screenshot generation duration'
})

const screenshotErrors = new prometheus.Counter({
  name: 'screenshot_errors_total',
  help: 'Total screenshot errors'
})
``` 