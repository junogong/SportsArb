import { fetchAuthSession } from 'aws-amplify/auth';

const api = {
    async getHealth() {
        const r = await fetch('/api/health');
        if (!r.ok) throw new Error('Health check failed');
        return r.json();
    },
    async authedFetch(url, options = {}) {
        // Obtain the current ID token to authorize against the backend (Amplify v6 modular API)
        const { tokens } = await fetchAuthSession();
        const idToken = tokens?.idToken?.toString();
        const r = await fetch(url, {
            ...options,
            headers: {
                ...(options.headers || {}),
                ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
            }
        });
        return r;
    },
    async getSports() {
        const r = await this.authedFetch('/api/sports');
        if (!r.ok) {
            const err = await r.json().catch(() => ({}));
            throw new Error(err?.error || 'Failed to fetch sports');
        }
        return r.json();
    },
    async getArbs(sportKey, { roundingUnit = 1, bankroll = 100 } = {}) {
        const params = new URLSearchParams({ sportKey, regions: 'us', markets: 'h2h', roundingUnit: String(roundingUnit), bankroll: String(bankroll) });
        const r = await this.authedFetch(`/api/arbs?${params.toString()}`);
        if (!r.ok) {
            const err = await r.json().catch(() => ({}));
            throw new Error(err?.error || 'Failed to fetch arbs');
        }
        return r.json();
    },
    async getBets() {
        const r = await this.authedFetch('/api/bets');
        if (!r.ok) {
            const err = await r.json().catch(() => ({}));
            throw new Error(err?.error || 'Failed to fetch bets');
        }
        const data = await r.json();
        return data.bets || [];
    },
    // Replaces the entire list of bets (matches server implementation)
    async saveBets(bets) {
        const r = await this.authedFetch('/api/bets', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bets })
        });
        if (!r.ok) {
            const err = await r.json().catch(() => ({}));
            throw new Error(err?.error || 'Failed to save bets');
        }
        return r.json();
    }
}

export default api;
