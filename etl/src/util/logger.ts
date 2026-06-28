import pino from 'pino';
import path from 'path';

export const createLogFilePath = () => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(process.cwd(), 'logs', `${timestamp}.log`);
};

const logFilePath = createLogFilePath();

const transport = pino.transport({
  targets: [
    {
      target: 'pino-pretty',
      options: {
        colorize: true,
        destination: 1, // stdout
      },
    },
    {
      target: 'pino-pretty',
      options: {
        colorize: false,
        destination: logFilePath,
        mkdir: true,
      },
    },
  ],
});

export const logger = pino(
  {
    level: 'trace',
  },
  transport,
);

export const setupLogging = () => {
  console.log = (msg: any, ...args: any[]) => logger.info(msg, ...args);
  console.info = (msg: any, ...args: any[]) => logger.info(msg, ...args);
  console.warn = (msg: any, ...args: any[]) => logger.warn(msg, ...args);
  console.error = (msg: any, ...args: any[]) => logger.error(msg, ...args);
  console.debug = (msg: any, ...args: any[]) => logger.debug(msg, ...args);
};
