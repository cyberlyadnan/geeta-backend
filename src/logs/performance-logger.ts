import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'node:path';
import { env } from '../config/env.js';

const logDir = path.resolve(process.cwd(), env.LOG_DIR);

const jsonFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json(),
);

const performanceTransport =
  env.NODE_ENV === 'test'
    ? []
    : [
        new DailyRotateFile({
          dirname: logDir,
          filename: 'performance-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          maxFiles: '30d',
          format: jsonFormat,
          level: 'info',
        }),
      ];

export const performanceLogger = winston.createLogger({
  level: 'info',
  format: jsonFormat,
  defaultMeta: { service: env.APP_NAME, channel: 'performance' },
  transports: [
    ...performanceTransport,
    new winston.transports.Console({
      level: env.NODE_ENV === 'production' ? 'warn' : 'info',
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
          return `[performance] ${level}: ${message}${metaStr}`;
        }),
      ),
    }),
  ],
});
