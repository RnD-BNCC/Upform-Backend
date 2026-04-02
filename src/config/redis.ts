import IORedis from 'ioredis'

if (!process.env.REDIS_URL) {
  throw new Error('Missing REDIS_URL env var')
}

export const redis = new IORedis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
})
