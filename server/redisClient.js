import { createClient, createCluster } from 'redis';
import dotenv from 'dotenv';
import url from 'url';

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

    const host = process.env.REDIS_HOST;
    const port = process.env.REDIS_PORT;

    // Detect ElastiCache Cluster Mode
    const isCluster = host && host.includes('clustercfg');

    try {
        if (isCluster) {
            console.log('[REDIS] Verified: Using Cluster Client');
            client = createCluster({
                rootNodes: [
                    {
                        socket: {
                            host: host,
                            port: port,
                            tls: true // AWS ElastiCache usually requires TLS for cluster endpoints
                        }
                    }
                ]
            });
        } else {
            console.log('[REDIS] Verified: Using Standalone Client');
            client = createClient({
                socket: {
                    host: host,
                    port: port
                }
            });
        }

        client.on('error', (err) => console.error('[REDIS] Client Error', err));
        client.on('connect', () => console.log('[REDIS] Connected to Redis'));
        // client.on('ready', () => console.log('[REDIS] Ready')); // Cluster emits verify

        await client.connect();
    } catch (e) {
        console.error('[REDIS] Initial connection failed:', e);
        // Important: If cluster fails, we might need to fallback or retry
        // but for now, logging is key.
        throw e;
    }

    return client;
}

export default getRedisClient;