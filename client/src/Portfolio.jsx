import React, { useMemo, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Authenticator } from '@aws-amplify/ui-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import api from './api'

function formatCurrency(n) { return `$${n.toFixed(2)}` }

function CustomTooltip({ active, payload, label }) {
  if (active && payload && payload.length) {
    return (
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', padding: '10px', borderRadius: '8px' }}>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{label}</p>
        <p style={{ margin: '4px 0 0', color: 'var(--accent-primary)', fontWeight: 'bold' }}>
          {formatCurrency(payload[0].value)}
        </p>
      </div>
    );
  }
  return null;
}

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

  const chartData = useMemo(() => {
    const sorted = [...bets].sort((a, b) => (a.placedAt || 0) - (b.placedAt || 0));
    let running = 0;
    // Start with 0 point? Optional.
    const data = [];
    if (sorted.length > 0) {
      // Add a starting point just before the first bet if needed, but let's just do actual points
      // actually, adding a 0 start point is nice for visual
      data.push({ date: 'Start', value: 0 });
    }

    sorted.forEach(b => {
      if (b.result === 'win') running += (b.stake * (b.priceDecimal - 1));
      else if (b.result === 'lose') running -= b.stake;
      // pending bets don't move the line

      const d = new Date(b.placedAt || Date.now());
      data.push({
        date: d.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' }),
        fullDate: d.toLocaleString(),
        value: running,
        isPending: b.result === 'pending'
      });
    });
    return data;
  }, [bets]);

  return (
    <div className="container">
      <header>
        <h1>Your Portfolio</h1>
        <button onClick={() => navigate('/')}>← Back to Opportunities</button>
      </header>

      <section>
        <h2>Performance</h2>
        <div style={{ height: 300, width: '100%', marginBottom: 40, background: 'var(--bg-surface)', padding: 20, borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)' }}>
          {bets.length === 0 ? (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
              Place some bets to see your graph!
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" opacity={0.5} />
                <XAxis
                  dataKey="date"
                  stroke="var(--text-secondary)"
                  fontSize={12}
                  tickLine={false}
                />
                <YAxis
                  stroke="var(--text-secondary)"
                  fontSize={12}
                  tickFormatter={(val) => `$${val}`}
                  tickLine={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine y={0} stroke="var(--text-secondary)" strokeDasharray="3 3" />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="var(--accent-primary)"
                  strokeWidth={3}
                  dot={{ fill: 'var(--bg-app)', stroke: 'var(--accent-primary)', strokeWidth: 2, r: 4 }}
                  activeDot={{ r: 6, fill: 'var(--accent-primary)' }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

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
                    <select value={b.result || 'pending'} onChange={(e) => updateBet(idx, { result: e.target.value })}
                      style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: 4, padding: 4 }}
                    >
                      <option value="pending">Pending</option>
                      <option value="win">Win</option>
                      <option value="lose">Lose</option>
                    </select>
                  </td>
                  <td>
                    <button onClick={() => removeBet(idx)} style={{ background: 'transparent', color: 'var(--color-error)', border: '1px solid var(--color-error)', padding: '4px 8px' }}>Remove</button>
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
