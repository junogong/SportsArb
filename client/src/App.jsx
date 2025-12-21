import React, { useEffect, useMemo, useState } from 'react'

const api = {
  async getHealth() {
    const r = await fetch('/api/health');
    if (!r.ok) throw new Error('Health check failed');
    return r.json();
  },
  async getSports() {
    const r = await fetch('/api/sports');
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err?.error || 'Failed to fetch sports');
    }
    return r.json();
  },
  async getArbs(sportKey, { roundingUnit = 1, bankroll = 100 } = {}) {
    const params = new URLSearchParams({ sportKey, regions: 'us', markets: 'h2h', roundingUnit: String(roundingUnit), bankroll: String(bankroll) });
    const r = await fetch(`/api/arbs?${params.toString()}`);
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err?.error || 'Failed to fetch arbs');
    }
    return r.json();
  }
}

function formatPct(n) { return `${n.toFixed(2)}%`; }

export default function App() {
  const [health, setHealth] = useState(null);
  const [sports, setSports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [arbs, setArbs] = useState([]);
  const [roundingUnit, setRoundingUnit] = useState(1);
  const [bankroll, setBankroll] = useState(100);

  useEffect(() => {
    api.getHealth().then(setHealth).catch(() => {})
    api.getSports().then((s) => {
      const list = Array.isArray(s) ? s : [];
      setSports(list)
    }).catch((e) => setError(e?.message || 'Failed to load sports'))
  }, [])

  const selectedSport = null;

  async function refreshArbs() {
    if (!sports?.length) return;
    setLoading(true); setError('');
    try {
      // Fetch arbs for all sports in parallel, then flatten and sort
      const results = await Promise.all(
        sports.map(s => api.getArbs(s.key, { roundingUnit, bankroll }).catch(() => ({ arbs: [] })))
      );
      const merged = results.flatMap(r => Array.isArray(r?.arbs) ? r.arbs : [])
        .sort((a, b) => (b.edge_rounded_percent || 0) - (a.edge_rounded_percent || 0));
      setArbs(merged)
    } catch (e) {
      setError(e?.message || 'Failed to load arbs')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refreshArbs() }, [sports, roundingUnit, bankroll])

  return (
    <div className="container">
      <header>
        <h1>Sports Arbitrage Finder</h1>
        <div className="status">
          <span className={health?.hasApiKey ? 'ok' : 'warn'}>
            API Key: {health?.hasApiKey ? 'Configured' : 'Missing (set server/.env)'}
          </span>
        </div>
      </header>

      <section className="controls">
        <label>
          Sports loaded: {sports.length}
        </label>
        <label>
          Bankroll:
          <input type="number" min={1} step={1} value={bankroll} onChange={(e) => setBankroll(Number(e.target.value) || 100)} />
        </label>
        <label>
          Rounding ($):
          <input type="number" min={1} step={1} value={roundingUnit} onChange={(e) => setRoundingUnit(Number(e.target.value) || 1)} />
        </label>
        <button onClick={refreshArbs} disabled={loading || sports.length === 0}>Refresh</button>
      </section>

      {error && <div className="error">{error}</div>}

      <section>
        <h2>Arbitrage Opportunities {loading && <small>(loading...)</small>}</h2>
        {arbs.length === 0 && !loading && (
          <div className="empty">No opportunities found for this sport right now.</div>
        )}
        {arbs.length > 0 && (
          <table className="arbs">
            <thead>
              <tr>
                <th>Match</th>
                <th>Commence</th>
                <th>Edge (rounded)</th>
                <th>Best Prices (Bookmaker)</th>
                <th>Stake Split (rounded)</th>
              </tr>
            </thead>
            <tbody>
              {arbs.map(a => (
                <tr key={a.id}>
                  <td>{a.away_team} @ {a.home_team}</td>
                  <td>{new Date(a.commence_time).toLocaleString()}</td>
                  <td className={a.edge_rounded_percent > 0 ? 'positive' : ''}>{formatPct(a.edge_rounded_percent)}</td>
                  <td>
                    <ul>
                      {a.outcomes.map(o => (
                        <li key={o.name}>{o.name}: {o.priceAmerican} ({o.priceDecimal.toFixed(2)}) @ <b>{o.bookmaker}</b></li>
                      ))}
                    </ul>
                  </td>
                  <td>
                    <ul>
                      {a.stakes_rounded.map(s => (
                        <li key={s.name}>{s.name}: ${s.stake.toFixed(0)}</li>
                      ))}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <footer>
        <small>Data from The Odds API. This is for educational purposes only.</small>
      </footer>
    </div>
  )
}
