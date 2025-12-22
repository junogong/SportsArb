import React, { useEffect, useMemo, useState, Suspense } from 'react'
import { Authenticator } from '@aws-amplify/ui-react'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import { loadJSON, saveJSON, userKey } from './storage'
import api from './api'

const Portfolio = React.lazy(() => import('./Portfolio'))

function formatPct(n) { return `${n.toFixed(2)}%`; }

// Per-user bookmaker preferences persisted in localStorage
function useUserId(user) {
  return user?.userId || user?.username || user?.sub || user?.attributes?.sub;
}

function MainContent({ user, signOut }) {
  const [health, setHealth] = useState(null);
  const [sports, setSports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [arbs, setArbs] = useState([]);
  const [roundingUnit, setRoundingUnit] = useState('1');
  const [bankroll, setBankroll] = useState('100');
  const [bookmakerPrefs, setBookmakerPrefs] = useState([]);
  const [betsSavedTick, setBetsSavedTick] = useState(0);

  const uid = useUserId(user);

  useEffect(() => {
    api.getHealth().then(setHealth).catch(() => { })
    api.getSports().then((s) => {
      const list = Array.isArray(s) ? s : [];
      setSports(list)
    }).catch((e) => setError(e?.message || 'Failed to load sports'))
  }, [])

  function loadPrefs(uid) {
    return loadJSON(userKey(uid, 'bookmakers'), []);
  }
  function savePrefs(uid, prefs) {
    saveJSON(userKey(uid, 'bookmakers'), prefs);
  }

  // Load prefs when uid changes
  useEffect(() => {
    setBookmakerPrefs(loadPrefs(uid));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  async function refreshArbs() {
    if (!sports?.length) return;
    setLoading(true); setError('');
    try {
      // Fetch arbs for all sports sequentially to respect API rate limits
      const results = [];
      for (const s of sports) {
        try {
          const r = await api.getArbs(s.key, { roundingUnit, bankroll });
          results.push(r);
        } catch {
          results.push({ arbs: [] });
        }
        // Small delay to prevent hitting 3 req/s limit
        await new Promise(res => setTimeout(res, 300));
      }
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
    setBookmakerPrefs(prev => {
      const next = prev.includes(bm) ? prev.filter(x => x !== bm) : [...prev, bm];
      savePrefs(uid, next);
      return next;
    });
  }

  async function addBetForArb(uid, a) {
    // Replaced localStorage with API call
    setError('');
    try {
      const existing = await api.getBets();
      const now = Date.now();
      const nextRecs = [];
      for (const o of a.outcomes || []) {
        const already = existing.some(b => b.eventId === a.id && b.outcome === o.name && b.bookmaker === o.bookmaker);
        if (already) continue;
        const matchStake = (a.stakes_rounded || []).find(s => s.name === o.name)?.stake || 0;
        const rec = {
          placedAt: now,
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
        nextRecs.push(rec);
      }
      if (nextRecs.length === 0) return; // nothing new to add
      const next = existing.concat(nextRecs);
      await api.saveBets(next);
      setBetsSavedTick(x => x + 1);
      try { const btn = document.activeElement; if (btn && btn.blur) btn.blur(); } catch { }
    } catch (err) {
      console.error('Failed to add bet', err);
      setError('Failed to save bet to server');
    }
  }

  // Auto-refresh only when sports list initially loads; bankroll/rounding are applied on manual Refresh
  useEffect(() => { refreshArbs() }, [sports])

  return (
    <div className="container">
      <header>
        <h1>Sports Arbitrage Finder</h1>
        <nav style={{ display: 'flex', gap: 12 }}>
          <Link to="/">Opportunities</Link>
          <Link to="/portfolio">Portfolio</Link>
        </nav>
        <div className="status">
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
                <input type="text" inputMode="numeric" value={bankroll}
                  onChange={(e) => setBankroll(e.target.value)} />
              </label>
              <label>
                Rounding ($):
                <input type="text" inputMode="numeric" value={roundingUnit}
                  onChange={(e) => setRoundingUnit(e.target.value)} />
              </label>
              <button type="button" onClick={refreshArbs} disabled={loading || sports.length === 0}>Refresh</button>
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
                      <th>Actions</th>
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
                        <td style={{ textAlign: 'right', verticalAlign: 'top' }}>
                          {uid && (
                            <button onClick={() => addBetForArb(uid, a)}>Add Bet</button>
                          )}
                        </td>
                      </tr>

                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </>
        )} />

        <Route path="/portfolio" element={(<Suspense fallback={<div>Loading…</div>}><Portfolio user={user} key={`pf-${betsSavedTick}`} /></Suspense>)} />
      </Routes>

    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Authenticator socialProviders={['google']}>
        {({ signOut, user }) => (
          <MainContent user={user} signOut={signOut} />
        )}
      </Authenticator>
    </BrowserRouter>
  )
}
