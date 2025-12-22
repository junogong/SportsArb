import cron from 'node-cron';
import { oddsGet } from './oddsService.js';

// Top sports to keep warm in cache
// These keys are standard in The Odds API.
const PRIORITY_SPORTS = [
    'basketball_nba',
    'americanfootball_nfl',
    'soccer_epl',
    'baseball_mlb',
    'icehockey_nhl'
];

async function warmCache() {
    console.log('[WORKER] Starting scheduled cache warming...');

    // First, verify which of our priority sports are actually active
    let activeSports = [];
    try {
        // Check main sports list (cached or fresh)
        const allSports = await oddsGet('/sports');
        activeSports = allSports.filter(s => PRIORITY_SPORTS.includes(s.key));
    } catch (e) {
        console.error('[WORKER] Failed to fetch sports list:', e.message);
        return;
    }

    console.log(`[WORKER] Found ${activeSports.length} priority sports active.`);

    // Fetch each one to populate Redis
    for (const s of activeSports) {
        console.log(`[WORKER] Warming cache for: ${s.title} (${s.key})...`);
        try {
            // Just calling oddsGet will write to Redis if missing or expired
            const data = await oddsGet(`/sports/${s.key}/odds`, { regions: 'us', markets: 'h2h' });
            console.log(`[WORKER] OK: ${s.key} (${data.length} events)`);
        } catch (e) {
            console.error(`[WORKER] Failed to warm ${s.key}:`, e.message);
        }

        // Tiny delay to be polite to the API, though we are well within quotas if running hourly
        await new Promise(res => setTimeout(res, 1000));
    }

    console.log('[WORKER] Cache warming complete.');
}

export function startWorker() {
    // Schedule to run every hour at minute 0
    // "0 * * * *" means "Every hour on the hour"
    cron.schedule('0 * * * *', () => {
        warmCache();
    });

    console.log('[WORKER] Background service started. Schedule: "0 * * * *" (Every hour)');

    // Run on startup immediately for demo purposes?
    // Uncommenting this makes the server very aggressive on restart.
    // Best practice: Let the cron handle it, or have a separate "one-off" trigger.
    // For this resume project, we run it once on boot to show it works.
    warmCache();
}
