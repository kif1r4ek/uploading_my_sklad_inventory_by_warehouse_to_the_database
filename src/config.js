import 'dotenv/config';

export const config = {
  moysklad: {
    token: process.env.MS_TOKEN,
    baseUrl: process.env.MS_BASE_URL || 'https://api.moysklad.ru/api/remap/1.2'
  },
  postgres: {
    host: process.env.PG_HOST,
    port: parseInt(process.env.PG_PORT || '5432'),
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    database: process.env.PG_DATABASE
  },
  request: {
    limit: parseInt(process.env.REQUEST_LIMIT || '1000'),
    delayMs: parseInt(process.env.REQUEST_DELAY_MS || '200'),
    maxRetries: parseInt(process.env.MAX_RETRIES || '5'),
    retryBackoffMs: parseInt(process.env.RETRY_BACKOFF_MS || '2000')
  }
};
