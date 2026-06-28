import pino from 'pino';
import path from 'path';

export const createLogFilePath = () => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(process.cwd(), 'logs', `${timestamp}.log`);
};

// Worker-thread transports keep the event loop alive and would hang `node --test`.
const isTestMode = process.execArgv.includes('--test') || process.env.PROFILE === 'test';

const transport = isTestMode
  ? undefined
  : pino.transport({
      targets: [
        {
          target: 'pino-pretty',
          options: {
            colorize: true,
            destination: 1,
          },
        },
        {
          target: 'pino/file',
          options: {
            destination: createLogFilePath(),
            mkdir: true,
          },
        },
      ],
    });

export const logger = isTestMode ? pino({ level: 'silent' }) : pino({ level: 'trace' }, transport);

export const closeLogger = (): Promise<void> =>
  new Promise(resolve => {
    if (!transport) return resolve();
    transport.once('finish', resolve);
    transport.end();
  });
