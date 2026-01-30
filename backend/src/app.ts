import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './utils/config.js';
import logger from './utils/logger.js';
import { checkDatabaseConnection } from './db/pool.js';
import { matterRouter } from './ticketing/matter/routes.js';

const app = express();
const port = config.PORT;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('Request completed', {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
    });
  });
  next();
});

// Health check endpoint
app.get('/health', async (_req, res) => {
  const dbHealthy = await checkDatabaseConnection();
  const status = dbHealthy ? 200 : 503;
  res.status(status).json({
    status: dbHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    database: dbHealthy ? 'connected' : 'disconnected',
  });
});

// API routes
app.use('/api/v1', matterRouter);

// Root endpoint
app.get('/', (_req, res) => {
  res.json({
    message: 'Matter Management API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      matters: '/api/v1/matters',
      fields: '/api/v1/fields',
    },
  });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', { error: err, url: req.url, method: req.method });
  res.status(500).json({ error: 'Internal server error' });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT signal received: closing HTTP server');
  process.exit(0);
});

// Start server
async function startServer() {
  try {
    // Check database connection
    const dbConnected = await checkDatabaseConnection();
    if (!dbConnected) {
      logger.error('Failed to connect to database. Exiting...');
      process.exit(1);
    }

    app.listen(port, () => {
      logger.info(`Matter Management API listening on port ${port}`);
      logger.info(`Environment: ${config.NODE_ENV}`);
      logger.info(`Health check: http://localhost:${port}/health`);
    });
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

startServer();

export default app;

