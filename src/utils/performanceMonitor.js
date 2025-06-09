/**
 * 性能监控工具
 * 用于跟踪和分析截图服务的性能指标
 */

class PerformanceMonitor {
  constructor() {
    this.metrics = {
      requests: {
        total: 0,
        successful: 0,
        failed: 0,
        concurrent: 0,
        maxConcurrent: 0
      },
      timing: {
        totalProcessingTime: 0,
        averageProcessingTime: 0,
        minProcessingTime: Infinity,
        maxProcessingTime: 0,
        lastProcessingTime: 0
      },
      memory: {
        peakUsage: 0,
        currentUsage: 0,
        gcCount: 0
      },
      browser: {
        restartCount: 0,
        totalPagesCreated: 0,
        activePagesCount: 0,
        lastRestartTime: null
      }
    };
    
    this.startTime = Date.now();
    this.lastGcTime = Date.now();
    
    // 启动内存监控
    this.startMemoryMonitoring();
  }

  /**
   * 记录请求开始
   */
  requestStart() {
    this.metrics.requests.total++;
    this.metrics.requests.concurrent++;
    
    if (this.metrics.requests.concurrent > this.metrics.requests.maxConcurrent) {
      this.metrics.requests.maxConcurrent = this.metrics.requests.concurrent;
    }
    
    return Date.now();
  }

  /**
   * 记录请求结束
   */
  requestEnd(startTime, success = true) {
    this.metrics.requests.concurrent--;
    
    const processingTime = Date.now() - startTime;
    this.metrics.timing.lastProcessingTime = processingTime;
    this.metrics.timing.totalProcessingTime += processingTime;
    
    if (success) {
      this.metrics.requests.successful++;
    } else {
      this.metrics.requests.failed++;
    }
    
    // 更新时间统计
    if (processingTime < this.metrics.timing.minProcessingTime) {
      this.metrics.timing.minProcessingTime = processingTime;
    }
    
    if (processingTime > this.metrics.timing.maxProcessingTime) {
      this.metrics.timing.maxProcessingTime = processingTime;
    }
    
    this.metrics.timing.averageProcessingTime = 
      this.metrics.timing.totalProcessingTime / this.metrics.requests.total;
  }

  /**
   * 记录页面创建
   */
  pageCreated() {
    this.metrics.browser.totalPagesCreated++;
    this.metrics.browser.activePagesCount++;
  }

  /**
   * 记录页面关闭
   */
  pageClosed() {
    this.metrics.browser.activePagesCount--;
  }

  /**
   * 记录浏览器重启
   */
  browserRestarted() {
    this.metrics.browser.restartCount++;
    this.metrics.browser.lastRestartTime = Date.now();
  }

  /**
   * 启动内存监控
   */
  startMemoryMonitoring() {
    setInterval(() => {
      const memUsage = process.memoryUsage();
      this.metrics.memory.currentUsage = memUsage.heapUsed;
      
      if (memUsage.heapUsed > this.metrics.memory.peakUsage) {
        this.metrics.memory.peakUsage = memUsage.heapUsed;
      }
      
      // 检测垃圾回收
      if (memUsage.heapUsed < this.metrics.memory.currentUsage * 0.8) {
        this.metrics.memory.gcCount++;
        this.lastGcTime = Date.now();
      }
    }, 5000); // 每5秒检查一次
  }

  /**
   * 获取性能报告
   */
  getReport() {
    const uptime = Date.now() - this.startTime;
    const memUsage = process.memoryUsage();
    
    return {
      uptime: {
        milliseconds: uptime,
        seconds: Math.floor(uptime / 1000),
        minutes: Math.floor(uptime / 60000),
        hours: Math.floor(uptime / 3600000)
      },
      requests: {
        ...this.metrics.requests,
        successRate: this.metrics.requests.total > 0 
          ? (this.metrics.requests.successful / this.metrics.requests.total * 100).toFixed(2) + '%'
          : '0%',
        requestsPerMinute: this.metrics.requests.total > 0
          ? (this.metrics.requests.total / (uptime / 60000)).toFixed(2)
          : '0'
      },
      timing: {
        ...this.metrics.timing,
        averageProcessingTime: Math.round(this.metrics.timing.averageProcessingTime),
        minProcessingTime: this.metrics.timing.minProcessingTime === Infinity 
          ? 0 : this.metrics.timing.minProcessingTime,
        maxProcessingTime: this.metrics.timing.maxProcessingTime
      },
      memory: {
        current: {
          heapUsed: this.formatBytes(memUsage.heapUsed),
          heapTotal: this.formatBytes(memUsage.heapTotal),
          external: this.formatBytes(memUsage.external),
          rss: this.formatBytes(memUsage.rss)
        },
        peak: this.formatBytes(this.metrics.memory.peakUsage),
        gcCount: this.metrics.memory.gcCount,
        lastGcAgo: Date.now() - this.lastGcTime
      },
      browser: {
        ...this.metrics.browser,
        lastRestartAgo: this.metrics.browser.lastRestartTime 
          ? Date.now() - this.metrics.browser.lastRestartTime
          : null,
        pagesPerRestart: this.metrics.browser.restartCount > 0
          ? Math.round(this.metrics.browser.totalPagesCreated / this.metrics.browser.restartCount)
          : this.metrics.browser.totalPagesCreated
      }
    };
  }

  /**
   * 获取简化的性能指标
   */
  getMetrics() {
    return {
      requests: this.metrics.requests,
      timing: {
        average: Math.round(this.metrics.timing.averageProcessingTime),
        last: this.metrics.timing.lastProcessingTime
      },
      memory: process.memoryUsage(),
      browser: {
        activePagesCount: this.metrics.browser.activePagesCount,
        restartCount: this.metrics.browser.restartCount
      }
    };
  }

  /**
   * 检查是否需要优化
   */
  getOptimizationSuggestions() {
    const suggestions = [];
    const report = this.getReport();
    
    // 检查成功率
    const successRate = parseFloat(report.requests.successRate);
    if (successRate < 95 && this.metrics.requests.total > 10) {
      suggestions.push({
        type: 'error_rate',
        message: `Success rate is low (${report.requests.successRate}). Consider investigating error causes.`,
        priority: 'high'
      });
    }
    
    // 检查平均处理时间
    if (report.timing.averageProcessingTime > 10000) {
      suggestions.push({
        type: 'performance',
        message: `Average processing time is high (${report.timing.averageProcessingTime}ms). Consider optimizing Puppeteer settings.`,
        priority: 'medium'
      });
    }
    
    // 检查内存使用
    const memUsage = process.memoryUsage();
    if (memUsage.heapUsed > 1024 * 1024 * 1024) { // 1GB
      suggestions.push({
        type: 'memory',
        message: `High memory usage detected (${this.formatBytes(memUsage.heapUsed)}). Consider browser restart or memory optimization.`,
        priority: 'medium'
      });
    }
    
    // 检查浏览器重启频率
    const uptimeHours = (Date.now() - this.startTime) / 3600000;
    if (this.metrics.browser.restartCount > uptimeHours * 2) {
      suggestions.push({
        type: 'stability',
        message: `Frequent browser restarts detected (${this.metrics.browser.restartCount} in ${uptimeHours.toFixed(1)} hours). Check for memory leaks or stability issues.`,
        priority: 'high'
      });
    }
    
    return suggestions;
  }

  /**
   * 格式化字节数
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * 重置统计数据
   */
  reset() {
    this.metrics = {
      requests: {
        total: 0,
        successful: 0,
        failed: 0,
        concurrent: 0,
        maxConcurrent: 0
      },
      timing: {
        totalProcessingTime: 0,
        averageProcessingTime: 0,
        minProcessingTime: Infinity,
        maxProcessingTime: 0,
        lastProcessingTime: 0
      },
      memory: {
        peakUsage: 0,
        currentUsage: 0,
        gcCount: 0
      },
      browser: {
        restartCount: 0,
        totalPagesCreated: 0,
        activePagesCount: 0,
        lastRestartTime: null
      }
    };
    
    this.startTime = Date.now();
  }
}

module.exports = PerformanceMonitor; 