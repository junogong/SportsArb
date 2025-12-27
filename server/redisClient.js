import { createClient } from 'redis';
import dotenv from 'dotenv';

// Force load the .env file
dotenv.config();

// DEBUG: Print these logs to see if it works
console.log('--- REDIS CONFIG DEBUG ---');
console.log('Target Host:', process.env.REDIS_HOST);
console.log('Target Port:', process.env.REDIS_PORT);
console.log('--------------------------');

let client;

async function getRedisClient() {
    if (client) return client;

    client = createClient({
        socket: {
            host: process.env.REDIS_HOST,
            port: process.env.REDIS_PORT
        }
    });

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