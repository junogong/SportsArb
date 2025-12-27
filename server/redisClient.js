import { createClient } from 'redis';

let client = null;

export default async function getRedisClient() {
    if (client && client.isOpen) return client;

    // Use REDIS_URL for production (ElastiCache), fallback to localhost for dev
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

    client = createClient({ url: redisUrl });

    client.on('error', (err) => console.error('[REDIS] Client Error', err));
    client.on('connect', () => console.log('[REDIS] Connected to ' + redisUrl));

    await client.connect();
    return client;
}
