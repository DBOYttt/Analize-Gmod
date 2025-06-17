const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Import all services
const database = require('./database');
const SteamDataService = require('./steam/service');
const ServerScannerService = require('./scanner/service');
const MLService = require('./ml/service');
const dashboardRoutes = require('./routes/dashboard');

class GModPolskaApp {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 3000;
    this.isShuttingDown = false;
    this.startTime = new Date();
    
    // Service instances
    this.services = {
      database: database,
      steam: new SteamDataService(),
      scanner: new ServerScannerService(),
      ml: new MLService()
    };
    
    // Service status tracking
    this.serviceStatus = {
      database: { status: 'stopped', error: null, lastCheck: null },
      steam: { status: 'stopped', error: null, lastCheck: null },
      scanner: { status: 'stopped', error: null, lastCheck: null },
      ml: { status: 'stopped', error: null, lastCheck: null },
      dashboard: { status: 'stopped', error: null, lastCheck: null }
    };
    
    // Performance metrics
    this.metrics = {
      uptime: 0,
      totalServersScanned: 0,
      totalPlayersProcessed: 0,
      totalMLPredictions: 0,
      apiRequests: 0,
      errors: 0,
      lastScanTime: null,
      averageScanDuration: 0
    };
    
    // Configuration
    this.config = {
      steamApiKey: process.env.STEAM_API_KEY,
      dbPath: process.env.DB_PATH || './data/gmodpolska.db',
      queryIntervalMinutes: parseInt(process.env.QUERY_INTERVAL_MINUTES) || 5,
      maxServersToTrack: parseInt(process.env.MAX_SERVERS_TO_TRACK) || 100,
      retentionDays: parseInt(process.env.RETENTION_DAYS) || 30,
      cleanupIntervalHours: parseInt(process.env.CLEANUP_INTERVAL_HOURS) || 24,
      nodeEnv: process.env.NODE_ENV || 'development'
    };
    
    this.setupExpressApp();
    this.setupGracefulShutdown();
  }

  setupExpressApp() {
    // Middleware
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.static('public'));
    
    // Request logging middleware
    this.app.use((req, res, next) => {
      this.metrics.apiRequests++;
      this.log('info', 'API Request', {
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      next();
    });
    
    // Health check endpoint
    this.app.get('/api/health', (req, res) => {
      res.json(this.getHealthStatus());
    });
    
    // Status endpoint
    this.app.get('/api/status', (req, res) => {
      res.json({
        services: this.serviceStatus,
        metrics: this.getMetrics(),
        config: {
          queryInterval: this.config.queryIntervalMinutes,
          maxServers: this.config.maxServersToTrack,
          environment: this.config.nodeEnv
        }
      });
    });
    
    // Dashboard endpoint
    this.app.get('/', (req, res) => {
      res.json({
        message: 'GMod Polska Server Scanner',
        status: 'running',
        version: '1.0.0',
        uptime: this.getUptime()
      });
    });
    // Dashboard routes
    this.app.use('/dashboard', dashboardRoutes);
    // Error handling middleware
    this.app.use((error, req, res, next) => {
      this.metrics.errors++;
      this.log('error', 'API Error', {
        error: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method
      });
      
      res.status(500).json({
        error: 'Internal server error',
        message: this.config.nodeEnv === 'development' ? error.message : 'Something went wrong'
      });
    });
  }

  setupGracefulShutdown() {
    process.on('SIGINT', () => this.shutdown('SIGINT'));
    process.on('SIGTERM', () => this.shutdown('SIGTERM'));
    
    process.on('uncaughtException', (error) => {
      this.log('error', 'Uncaught Exception', { error: error.message, stack: error.stack });
      this.shutdown('uncaughtException');
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      this.log('error', 'Unhandled Rejection', { reason, promise });
    });
  }

  async start() {
    this.log('info', 'Starting GMod Polska Application', {
      version: '1.0.0',
      environment: this.config.nodeEnv,
      port: this.port
    });
    
    try {
      await this.performStartupHealthCheck();
      await this.initializeServices();
      await this.startDashboard();
      this.startBackgroundProcesses();
      
      this.log('info', 'Application started successfully', {
        uptime: this.getUptime(),
        services: Object.keys(this.services).length
      });
      
    } catch (error) {
      this.log('error', 'Application startup failed', {
        error: error.message,
        stack: error.stack
      });
      
      console.error('\n🚨 STARTUP ALERT: Application failed to start!');
      console.error(`❌ Error: ${error.message}`);
      console.error('📝 Check logs above for detailed error information\n');
      
      process.exit(1);
    }
  }

  async performStartupHealthCheck() {
    this.log('info', 'Performing startup health check...');
    
    const requiredEnvVars = ['STEAM_API_KEY'];
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }
    
    const dbDir = path.dirname(this.config.dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
      this.log('info', 'Created database directory', { path: dbDir });
    }
    
    this.log('info', 'Startup health check passed');
  }

  async initializeServices() {
    const serviceOrder = ['database', 'steam', 'scanner', 'ml'];
    
    for (const serviceName of serviceOrder) {
      try {
        this.log('info', `Initializing ${serviceName} service...`);
        
        const service = this.services[serviceName];
        await service.initialize();
        
        this.serviceStatus[serviceName] = {
          status: 'running',
          error: null,
          lastCheck: new Date().toISOString()
        };
        
        this.log('info', `${serviceName} service initialized successfully`);
        
      } catch (error) {
        this.serviceStatus[serviceName] = {
          status: 'error',
          error: error.message,
          lastCheck: new Date().toISOString()
        };
        
        this.log('error', `Failed to initialize ${serviceName} service`, {
          error: error.message,
          stack: error.stack
        });
        
        console.error(`\n🚨 SERVICE ALERT: ${serviceName} service failed to start!`);
        console.error(`❌ Error: ${error.message}\n`);
        
        throw error;
      }
    }
  }

  async startDashboard() {
    return new Promise((resolve, reject) => {
      const server = this.app.listen(this.port, (error) => {
        if (error) {
          this.serviceStatus.dashboard = {
            status: 'error',
            error: error.message,
            lastCheck: new Date().toISOString()
          };
          reject(error);
        } else {
          this.serviceStatus.dashboard = {
            status: 'running',
            error: null,
            lastCheck: new Date().toISOString()
          };
          
          this.log('info', 'Dashboard server started', {
            port: this.port,
            url: `http://localhost:${this.port}`
          });
          
          resolve(server);
        }
      });
      
      this.server = server;
    });
  }

  startBackgroundProcesses() {
    this.log('info', 'Starting background processes...');
    
    // Start server scanning
    this.services.scanner.startScanning();
    
    // ML learning from feedback (every hour)
    setInterval(async () => {
      try {
        await this.services.ml.learnFromFeedback();
      } catch (error) {
        this.log('error', 'ML learning failed', { error: error.message });
      }
    }, 60 * 60 * 1000);
    
    // Database cleanup
    setInterval(async () => {
      try {
        await this.performDatabaseCleanup();
      } catch (error) {
        this.log('error', 'Database cleanup failed', { error: error.message });
      }
    }, this.config.cleanupIntervalHours * 60 * 60 * 1000);
    
    // Service health checks (every 5 minutes)
    setInterval(async () => {
      await this.performServiceHealthChecks();
    }, 5 * 60 * 1000);
    
    // Update metrics every minute
    setInterval(() => {
      this.updateMetrics();
    }, 60 * 1000);
    
    this.log('info', 'Background processes started');
  }

  async performServiceHealthChecks() {
    for (const [serviceName, service] of Object.entries(this.services)) {
      try {
        // Simple health check - verify service is responsive
        let isHealthy = false;
        
        switch (serviceName) {
          case 'database':
            isHealthy = service.isInitialized;
            break;
          case 'steam':
            isHealthy = service.steamClient !== null;
            break;
          case 'scanner':
            isHealthy = service.isScanning !== undefined;
            break;
          case 'ml':
            isHealthy = service.isInitialized;
            break;
        }
        
        if (isHealthy) {
          this.serviceStatus[serviceName] = {
            status: 'running',
            error: null,
            lastCheck: new Date().toISOString()
          };
        } else {
          throw new Error('Service health check failed');
        }
        
      } catch (error) {
        this.serviceStatus[serviceName] = {
          status: 'error',
          error: error.message,
          lastCheck: new Date().toISOString()
        };
        
        this.log('error', `Service health check failed: ${serviceName}`, {
          error: error.message
        });
        
        // Attempt service restart
        await this.restartService(serviceName);
      }
    }
  }

  async restartService(serviceName) {
    this.log('info', `Attempting to restart service: ${serviceName}`);
    
    try {
      const service = this.services[serviceName];
      
      // Stop service if it has a stop method
      if (typeof service.stop === 'function') {
        await service.stop();
      }
      
      // Reinitialize service
      await service.initialize();
      
      // Restart scanning if it's the scanner service
      if (serviceName === 'scanner') {
        service.startScanning();
      }
      
      this.serviceStatus[serviceName] = {
        status: 'running',
        error: null,
        lastCheck: new Date().toISOString()
      };
      
      this.log('info', `Service restarted successfully: ${serviceName}`);
      
    } catch (error) {
      this.log('error', `Service restart failed: ${serviceName}`, {
        error: error.message
      });
      
      console.error(`\n🚨 SERVICE RESTART ALERT: Failed to restart ${serviceName}!`);
      console.error(`❌ Error: ${error.message}\n`);
    }
  }

  async performDatabaseCleanup() {
    this.log('info', 'Starting database cleanup...');
    
    try {
      const sql = `
        DELETE FROM server_snapshots 
        WHERE timestamp < datetime('now', '-${this.config.retentionDays} days')
      `;
      
      const result = await database.executeWithRetry(sql);
      
      this.log('info', 'Database cleanup completed', {
        deletedRecords: result.changes || 0,
        retentionDays: this.config.retentionDays
      });
      
    } catch (error) {
      this.log('error', 'Database cleanup failed', {
        error: error.message
      });
    }
  }

  updateMetrics() {
    this.metrics.uptime = this.getUptime();
    
    // Get additional metrics from services
    if (this.services.scanner) {
      const scannerStats = this.services.scanner.getStats();
      this.metrics.totalServersScanned = scannerStats.onlineServers || 0;
      this.metrics.lastScanTime = scannerStats.lastScan;
    }
    
    if (this.services.steam) {
      const steamStats = this.services.steam.getQueueStats();
      // Steam stats would include player processing info
    }
  }

  getHealthStatus() {
    const allServicesRunning = Object.values(this.serviceStatus)
      .every(status => status.status === 'running');
    
    return {
      status: allServicesRunning ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: this.getUptime(),
      services: this.serviceStatus
    };
  }

  getMetrics() {
    return {
      ...this.metrics,
      timestamp: new Date().toISOString(),
      uptime: this.getUptime()
    };
  }

  getUptime() {
    return Math.floor((Date.now() - this.startTime.getTime()) / 1000);
  }

  log(level, message, data = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      message,
      ...data
    };
    
    // Structured JSON logging
    console.log(JSON.stringify(logEntry));
  }

  async shutdown(signal) {
    if (this.isShuttingDown) {
      return;
    }
    
    this.isShuttingDown = true;
    
    this.log('info', 'Graceful shutdown initiated', { signal });
    
    try {
      // Stop scanning
      if (this.services.scanner) {
        this.services.scanner.stopScanning();
      }
      
      // Close HTTP server
      if (this.server) {
        await new Promise((resolve) => {
          this.server.close(resolve);
        });
      }
      
      // Close database connections
      // Database connections are handled per-query, no persistent connections to close
      
      this.log('info', 'Graceful shutdown completed');
      process.exit(0);
      
    } catch (error) {
      this.log('error', 'Shutdown error', {
        error: error.message,
        stack: error.stack
      });
      process.exit(1);
    }
  }
}

// Create and start the application
const app = new GModPolskaApp();

// Start the application
app.start().catch((error) => {
  console.error('Failed to start application:', error);
  process.exit(1);
});

module.exports = app;