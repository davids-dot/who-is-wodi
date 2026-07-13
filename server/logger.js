const pino = require('pino');
const path = require('path');

const logDir = path.join(__dirname, '..', 'logs');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    targets: [
      // stdout — Docker json-file driver 捕获
      { target: 'pino/file', level: 'info', options: { destination: 1 } },
      // 文件 + 轮转 — 宿主机 volume 挂载，跨容器重建保留
      {
        target: 'pino-roll',
        level: 'info',
        options: {
          file: path.join(logDir, 'app.log'),
          size: '10m',
          frequency: 'daily',
          mkdir: true,
        },
      },
    ],
  },
});

module.exports = logger;
