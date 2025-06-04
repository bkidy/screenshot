# Screenshot Service

A high-performance screenshot service built with Docker and Puppeteer, featuring smart content cropping and multiple output formats.

## Features

- 🚀 High-quality screenshot generation with Puppeteer
- 🎯 Smart content area detection and cropping
- 🐳 Dockerized deployment with optimized performance
- 📊 Health monitoring and performance metrics
- 🔒 API key authentication
- ⚡ Concurrent request handling with resource management
- 🛠️ Production-ready with comprehensive error handling

## Quick Start

### Prerequisites

- Docker 20.10+
- Docker Compose 2.0+
- 2GB+ available memory
- 1GB+ available disk space

### Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd screenshot
```

2. **Configure environment**
```bash
cp env.example .env
# Edit .env file to set your API key and other configurations
```

3. **Build and start the service**
```bash
# Using the start script (recommended)
./start.sh build

# Or manually with docker-compose
docker-compose -f docker/docker-compose.yml build
docker-compose -f docker/docker-compose.yml up -d
```

4. **Verify the service**
```bash
# Health check
curl http://localhost:3002/health

# Check service status
./start.sh status
```

## Usage

### Start Script Commands

```bash
./start.sh [command]

Commands:
  auto    - Smart mode: auto-detect image, build if needed (default)
  start   - Start only: use existing image, no build
  build   - Force build: rebuild image and start
  stop    - Stop service
  restart - Restart service (no rebuild)
  logs    - View real-time logs
  status  - View service status
  help    - Show help information
```

### API Endpoints

#### Health Check
```bash
GET /health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2024-12-19T10:30:00.000Z",
  "service": "screenshot-service",
  "version": "1.1.0",
  "uptime": 3600,
  "browser": "connected",
  "performance": {
    "activePagesCount": 0,
    "totalRequestsProcessed": 42
  }
}
```

#### Generate Screenshot
```bash
POST /screenshot
Content-Type: application/json
Authorization: Bearer YOUR_API_KEY

{
  "htmlContent": "<html><body><h1>Hello World</h1></body></html>",
  "width": 1280,
  "height": 720,
  "options": {
    "format": "png",
    "quality": 90,
    "smartCrop": true,
    "enableResourceBlocking": false
  }
}
```

**Parameters:**
- `htmlContent` (required): HTML content to screenshot
- `width` (optional): Viewport width (default: 1280)
- `height` (optional): Viewport height (default: 720)
- `options.format` (optional): Output format - png, jpeg, webp (default: png)
- `options.quality` (optional): Image quality 1-100 for jpeg/webp
- `options.smartCrop` (optional): Enable smart content cropping (default: true)
- `options.enableResourceBlocking` (optional): Block images/CSS/fonts for faster rendering

#### Performance Stats
```bash
GET /stats
Authorization: Bearer YOUR_API_KEY
```

## Configuration

### Environment Variables

```bash
# API Authentication
API_KEY=your-secret-api-key-here

# Network Configuration
PORT=3002
CORS_ORIGINS=*

# Logging
LOG_LEVEL=info
LOG_PERFORMANCE=false

# Node.js Performance
NODE_ENV=production
```

### Performance Optimization

The service includes several performance optimizations:

- **Optimized Puppeteer settings**: 30+ Chrome flags for better performance
- **Smart resource management**: Concurrent request limiting and browser instance pooling
- **Memory optimization**: 2GB shared memory and optimized garbage collection
- **Fast rendering**: Reduced wait times and optional resource blocking

### Docker Configuration

- **Memory Limit**: 2GB
- **CPU Limit**: 1 core
- **Shared Memory**: 2GB (critical for Chrome)
- **Health Check**: Every 30 seconds
- **Auto-restart**: Unless stopped

## Troubleshooting

### Common Issues

**Service won't start:**
```bash
# Check logs
docker logs screenshot-service

# Verify Docker resources
docker stats screenshot-service
```

**Health check fails:**
```bash
# Manual health check
curl -f http://localhost:3002/health

# Check browser status
docker exec screenshot-service ps aux | grep chrome
```

**Performance issues:**
```bash
# View performance stats
curl -H "Authorization: Bearer YOUR_API_KEY" http://localhost:3002/stats

# Monitor resource usage
docker stats screenshot-service
```

**Build failures:**
```bash
# Clean rebuild
./start.sh stop
docker system prune -f
./start.sh build
```

### Performance Tuning

Key configuration parameters in `src/config/default.js`:

```javascript
{
  screenshot: {
    performance: {
      maxConcurrentPages: 3,        // Adjust based on server capacity
      pageTimeout: 15000,           // Page load timeout
      waitStrategy: 'domcontentloaded', // Faster than 'networkidle0'
      additionalWaitTime: 500       // Extra wait time after load
    }
  }
}
```

## Development

### Local Development
```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run tests
npm test
```

### Project Structure
```
src/
├── app.js              # Main application entry
├── config/             # Configuration files
├── middleware/         # Express middleware
└── utils/              # Utility functions

docker/
├── Dockerfile          # Optimized container build
└── docker-compose.yml  # Service configuration
```

## Performance Metrics

Expected performance improvements with optimizations:

- **Processing Speed**: 40-60% faster (from >5s to <3s average)
- **Memory Usage**: 20-30% reduction (target <1GB)
- **Concurrent Capacity**: 2-3x improvement (supports 3 simultaneous requests)
- **Success Rate**: >98% reliability

## License

MIT License

## Support

For issues and questions:
1. Check the [Troubleshooting](#troubleshooting) section
2. Review [API documentation](#api-endpoints)
3. Examine service logs with `./start.sh logs` 