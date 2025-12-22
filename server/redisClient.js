import { createClient } from 'redis';

let client;

async function getRedisClient() {
    if (client) return client;

    // Defaults to localhost:6379 which matches our Docker container
    client = createClient();

    client.on('error', (err) => console.error('[REDIS] Client Error', err));
    client.on('connect', () => console.log('[REDIS] Connected to Redis'));

    try {
        await client.connect();
    } catch (e) {
        console.error('[REDIS] Initial connection failed:', e);
    }

    return client;
}

export default getRedisClient;
