import axios from 'axios';
import getRedisClient from './redisClient.js';

const ODDS_API_BASE = 'https://api.the-odds-api.com/v4';

// Environment variables must be passed in or loaded via process.env
// We assume dotenv is loaded in the main entry point

export async function oddsGet(path, params = {}) {
    const ODDS_API_KEY = process.env.ODDS_API_KEY;
    const url = `${ODDS_API_BASE}${path}`;
    const finalParams = { apiKey: ODDS_API_KEY, ...params };
    const redisKey = `odds:${url}?${new URLSearchParams(finalParams).toString()}`;

    const redis = await getRedisClient();

    // Try fetching from cache first
    try {
        const cached = await redis.get(redisKey);
        if (cached) {
            console.log(`[REDIS] HIT: ${redisKey}`);
            return JSON.parse(cached);
        }
    } catch (e) {
        console.error('[REDIS] Get failed', e);
    }

    // Fallback to API
    console.log(`[REDIS] MISS: ${redisKey}`);
    try {
        const { data } = await axios.get(url, { params: finalParams });

        // Save to cache (15 minutes TTL)
        try {
            await redis.set(redisKey, JSON.stringify(data), { EX: 900 });
        } catch (e) {
            console.error('[REDIS] Set failed', e);
        }
        return data;
    } catch (err) {
        // Propagate error for handling by caller
        throw err;
    }
}

export function americanToDecimal(american) {
    const o = Number(american);
    if (!Number.isFinite(o)) return null;
    return o > 0 ? 1 + o / 100 : 1 + 100 / Math.abs(o);
}

export function computeArbitrageForEvent(event, { bankroll = 100, roundingUnit = 1, requireRoundedPositive = true } = {}) {
    // Logic extracted from index.js
    const market = event.bookmakers?.flatMap(bm => bm.markets || [])?.find(m => m.key === 'h2h');
    if (!market) return null;

    const outcomeBest = new Map();

    for (const bm of event.bookmakers || []) {
        const h2h = bm.markets?.find(m => m.key === 'h2h');
        if (!h2h) continue;
        for (const out of h2h.outcomes || []) {
            const dec = americanToDecimal(out.price);
            if (!dec) continue;
            const prev = outcomeBest.get(out.name);
            if (!prev || dec > prev.priceDecimal) {
                outcomeBest.set(out.name, {
                    priceAmerican: out.price,
                    priceDecimal: dec,
                    bookmaker: bm.key,
                    last_update: h2h.last_update || bm.last_update || event.commence_time,
                });
            }
        }
    }

    const outcomes = Array.from(outcomeBest.entries()).map(([name, info]) => ({ name, ...info }));
    if (outcomes.length < 2) return null;

    const sumInv = outcomes.reduce((acc, o) => acc + 1 / o.priceDecimal, 0);
    if (sumInv >= 1) return null;

    const edge = 1 / sumInv - 1;

    const stakes = outcomes.map(o => ({
        name: o.name,
        stake: (bankroll / o.priceDecimal) / sumInv,
    }));
    const guaranteedPayout = bankroll / sumInv;

    const roundToUnit = (x, unit) => Math.round(x / unit) * unit;
    const stakesRounded = stakes.map(s => ({ ...s, stake: roundToUnit(s.stake, roundingUnit) }));
    const totalStakeRounded = stakesRounded.reduce((a, s) => a + s.stake, 0);
    const payouts = outcomes.map((o, idx) => stakesRounded[idx].stake * o.priceDecimal);
    const guaranteedPayoutRounded = Math.min(...payouts);
    const profitRounded = guaranteedPayoutRounded - totalStakeRounded;
    const edgeRoundedPercent = totalStakeRounded > 0 ? (profitRounded / totalStakeRounded) * 100 : -Infinity;

    if (requireRoundedPositive && edgeRoundedPercent <= 0) return null;

    return {
        id: event.id,
        sport_key: event.sport_key,
        sport_title: event.sport_title,
        commence_time: event.commence_time,
        home_team: event.home_team,
        away_team: event.away_team,
        outcomes,
        sum_inverse: sumInv,
        edge_percent: edge * 100,
        bankroll_example: bankroll,
        stakes,
        guaranteed_payout: guaranteedPayout,
        rounding_unit: roundingUnit,
        stakes_rounded: stakesRounded,
        total_stake_rounded: totalStakeRounded,
        guaranteed_payout_rounded: guaranteedPayoutRounded,
        edge_rounded_percent: edgeRoundedPercent,
        profit_rounded: profitRounded,
    };
}
