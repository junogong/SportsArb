import React, { useMemo, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Authenticator } from '@aws-amplify/ui-react'
import api from './api'

function formatCurrency(n) { return `$${n.toFixed(2)}` }

export default function Portfolio({ user }) {
  const navigate = useNavigate();
  // We don't strictly need uid for localstorage keys anymore, but it's good for effect deps
  const uid = user?.userId || user?.username || user?.sub || user?.attributes?.sub;

  const [bets, setBets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    api.getBets().then(setBets)
      .catch(e => setError('Failed to load bets'))
      .finally(() => setLoading(false));
  }, [uid]);

  function persist(next) {
    // Optimistic update
    setBets(next);
    api.saveBets(next).catch(() => {
      setError('Failed to save changes');
      // Revert or reload? For now just reload
      api.getBets().then(setBets);
    });
  }

  function updateBet(idx, patch) {
    const next = bets.map((b, i) => i === idx ? { ...b, ...patch } : b);
    persist(next);
  }

  function removeBet(idx) {
    const next = bets.filter((_, i) => i !== idx);
    persist(next);
  }

  const summary = useMemo(() => {
    let realized = 0;
    for (const b of bets) {
      if (b.result === 'win') realized += (b.stake * (b.priceDecimal - 1));
      else if (b.result === 'lose') realized -= b.stake;
      // pending = 0 impact
    }
    return { realized };
  }, [bets])

  return (
    <div className="container">
      <header>
        <h1>Your Portfolio</h1>
        <button onClick={() => navigate('/')}>← Back to Opportunities</button>
      </header>

      <section>
        <h2>Summary</h2>
        <div>Realized PnL: <b className={summary.realized >= 0 ? 'positive' : 'negative'}>{formatCurrency(summary.realized)}</b></div>
      </section>

      {error && <div className="error">{error}</div>}

      <section>
        <h2>Bets {loading && <small>(loading...)</small>}</h2>
        {!loading && bets.length === 0 && <div className="empty">No bets yet. Go add some from the Opportunities page.</div>}
        {bets.length > 0 && (
          <table className="arbs">
            <thead>
              <tr>
                <th>Date</th>
                <th>Event</th>
                <th>Outcome</th>
                <th>Bookmaker</th>
                <th>Price (Dec)</th>
                <th>Stake</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {bets.map((b, idx) => (
                <tr key={idx}>
                  <td>{new Date(b.placedAt || Date.now()).toLocaleString()}</td>
                  <td>{b.away_team} @ {b.home_team}</td>
                  <td>{b.outcome}</td>
                  <td>{b.bookmaker}</td>
                  <td>{b.priceDecimal.toFixed(2)}</td>
                  <td>${b.stake.toFixed(2)}</td>
                  <td>
                    <select value={b.result || 'pending'} onChange={(e) => updateBet(idx, { result: e.target.value })}>
                      <option value="pending">Pending</option>
                      <option value="win">Win</option>
                      <option value="lose">Lose</option>
                    </select>
                  </td>
                  <td>
                    <button onClick={() => removeBet(idx)}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
