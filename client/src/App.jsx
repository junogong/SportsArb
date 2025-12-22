import React, { useEffect, useMemo, useState } from 'react'
import { Authenticator } from '@aws-amplify/ui-react'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import Portfolio from './Portfolio'
import { loadJSON, saveJSON, userKey } from './storage'

import { fetchAuthSession } from 'aws-amplify/auth'

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
  const [bookmakerPrefs, setBookmakerPrefs] = useState([]);
  const [betsSavedTick, setBetsSavedTick] = useState(0);

  useEffect(() => {
    api.getHealth().then(setHealth).catch(() => {})
    api.getSports().then((s) => {
      const list = Array.isArray(s) ? s : [];
      setSports(list)
    }).catch((e) => setError(e?.message || 'Failed to load sports'))
  }, [])

  const selectedSport = null;

  // Per-user bookmaker preferences persisted in localStorage
  function useUserId(user) {
    return user?.userId || user?.username || user?.sub || user?.attributes?.sub;
  }

  function loadPrefs(uid) {
    return loadJSON(userKey(uid, 'bookmakers'), []);
  }
  function savePrefs(uid, prefs) {
    saveJSON(userKey(uid, 'bookmakers'), prefs);
  }

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

  const allBookmakers = useMemo(() => {
    const set = new Set();
    for (const a of arbs) {
      for (const o of a.outcomes || []) set.add(o.bookmaker);
    }
    return Array.from(set).sort();
  }, [arbs]);

  const visibleArbs = useMemo(() => {
    if (!bookmakerPrefs || bookmakerPrefs.length === 0) return arbs;
    return arbs.filter(a => a.outcomes?.some(o => bookmakerPrefs.includes(o.bookmaker)));
  }, [arbs, bookmakerPrefs]);

  function toggleBookmaker(uid, bm) {
    const next = bookmakerPrefs.includes(bm)
      ? bookmakerPrefs.filter(x => x !== bm)
      : [...bookmakerPrefs, bm];
    setBookmakerPrefs(next);
    savePrefs(uid, next);
  }

  function addBetForOutcome(uid, a, o) {
    const betsKey = userKey(uid, 'bets');
    const existing = loadJSON(betsKey, []);
    const matchStake = (a.stakes_rounded || []).find(s => s.name === o.name)?.stake || 0;
    const rec = {
      placedAt: Date.now(),
      eventId: a.id,
      sport_key: a.sport_key,
      home_team: a.home_team,
      away_team: a.away_team,
      outcome: o.name,
      bookmaker: o.bookmaker,
      priceDecimal: o.priceDecimal,
      priceAmerican: o.priceAmerican,
      stake: matchStake,
      result: 'pending',
    };
    const next = [...existing, rec];
    saveJSON(betsKey, next);
    setBetsSavedTick(x => x + 1);
  }

  useEffect(() => { refreshArbs() }, [sports, roundingUnit, bankroll])

  return (
    <BrowserRouter>
      <Authenticator socialProviders={['google']}>
        {({ signOut, user }) => {
          const uid = useUserId(user);
          useEffect(() => {
            setBookmakerPrefs(loadPrefs(uid));
          // eslint-disable-next-line react-hooks/exhaustive-deps
          }, [uid]);

          return (
            <div className="container">
              <header>
                <h1>Sports Arbitrage Finder</h1>
                <nav style={{ display: 'flex', gap: 12 }}>
                  <Link to="/">Opportunities</Link>
                  <Link to="/portfolio">Portfolio</Link>
                </nav>
                <div className="status">
                  <span className={health?.hasApiKey ? 'ok' : 'warn'}>
                    API Key: {health?.hasApiKey ? 'Configured' : 'Missing (set server/.env)'}
                  </span>
                  <span style={{ marginLeft: 12 }}>
                    {user && (
                      <>
                        Signed in as {user?.signInDetails?.loginId || user?.username}
                        <button style={{ marginLeft: 8 }} onClick={signOut}>Sign out</button>
                      </>
                    )}
                  </span>
                </div>
              </header>

              <Routes>
                <Route path="/" element={(
                  <>
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

                    <section className="controls">
                      <fieldset>
                        <legend>Bookmakers you use (leave empty to show all)</legend>
                        {allBookmakers.map(bm => (
                          <label key={bm} style={{ marginRight: 12 }}>
                            <input type="checkbox" checked={bookmakerPrefs.includes(bm)} onChange={() => toggleBookmaker(uid, bm)} /> {bm}
                          </label>
                        ))}
                      </fieldset>
                    </section>

                    {error && <div className="error">{error}</div>}

                    <section>
                      <h2>Arbitrage Opportunities {loading && <small>(loading...)</small>}</h2>
                      {visibleArbs.length === 0 && !loading && (
                        <div className="empty">No opportunities found for your selected bookmakers.</div>
                      )}
                      {visibleArbs.length > 0 && (
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
                            {visibleArbs.map(a => (
                              <tr key={a.id}>
                                <td>{a.away_team} @ {a.home_team}</td>
                                <td>{new Date(a.commence_time).toLocaleString()}</td>
                                <td className={a.edge_rounded_percent > 0 ? 'positive' : ''}>{formatPct(a.edge_rounded_percent)}</td>
                                <td>
                                  <ul>
                                    {a.outcomes.map(o => (
                                      <li key={o.name}>
                                        {o.name}: {o.priceAmerican} ({o.priceDecimal.toFixed(2)}) @ <b>{o.bookmaker}</b>
                                        {uid && (
                                          <button style={{ marginLeft: 8 }} onClick={() => addBetForOutcome(uid, a, o)}>Add Bet</button>
                                        )}
                                      </li>
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
                  </>
                )} />

                <Route path="/portfolio" element={<Portfolio user={user} key={`pf-${betsSavedTick}`} />} />
              </Routes>

              <footer>
                <small>Data from The Odds API. This is for educational purposes only.</small>
              </footer>
            </div>
          );
        }}
      </Authenticator>
    </BrowserRouter>
  )
}
