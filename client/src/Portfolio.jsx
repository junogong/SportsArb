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

  function updateBet(targetBet, patch) {
    // "Smart" update: If setting to WIN, auto-set siblings (same eventId) to LOSE
    let next = bets.map(b => b === targetBet ? { ...b, ...patch } : b);

    if (patch.result === 'win' && targetBet.eventId) {
      next = next.map(b => {
        // If same event, different outcome, and currently pending (or whatever), set to lose
        if (b.eventId === targetBet.eventId && b !== targetBet && b.outcome !== targetBet.outcome) {
          return { ...b, result: 'lose' };
        }
        return b;
      });
    }

    persist(next);
  }

  function removeBet(targetBet) {
    const next = bets.filter(b => b !== targetBet);
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

    // Group by timestamp (or eventId) to aggregate "Net PnL" for that Arb
    // Using timestamp as key since they are added roughly at same time, 
    // or we can just iterate and aggregate.

    const points = [];

    // We want a cumulative line.
    // We will group by unique time/event effectively.
    // Map: placedAt -> netChange
    const changes = new Map();

    sorted.forEach(b => {
      const t = b.placedAt || 0;
      let change = 0;
      if (b.result === 'win') change += (b.stake * (b.priceDecimal - 1));
      else if (b.result === 'lose') change -= b.stake;

      changes.set(t, (changes.get(t) || 0) + change);
    });

    let running = 0;
    // Add start point
    points.push({ date: 'Start', value: 0 });

    const sortedTimes = Array.from(changes.keys()).sort((a, b) => a - b);

    sortedTimes.forEach(t => {
      running += changes.get(t);
      const d = new Date(t);
      points.push({
        date: d.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' }),
        fullDate: d.toLocaleString(),
        value: running,
      });
    });

    return points;
  }, [bets]);

  const groups = useMemo(() => {
    // Group bets by Event ID (descending by date)
    const g = {};
    bets.forEach(b => {
      const k = b.eventId || 'unknown';
      if (!g[k]) g[k] = { eventId: k, items: [], time: b.placedAt || 0, title: `${b.away_team} @ ${b.home_team}` };
      g[k].items.push(b);
    });
    return Object.values(g).sort((a, b) => b.time - a.time);
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

        {/* Render grouped bets */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {groups.map(g => (
            <div key={g.eventId} style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px 16px', borderBottom: '1px solid var(--border-color)', fontWeight: 'bold' }}>
                {g.title} <span style={{ fontWeight: 'normal', color: 'var(--text-secondary)', fontSize: '0.85em', marginLeft: 10 }}>{new Date(g.time).toLocaleString()}</span>
              </div>
              <table className="arbs" style={{ border: 'none', background: 'transparent', borderRadius: 0 }}>
                <thead>
                  <tr>
                    <th style={{ background: 'transparent' }}>Outcome</th>
                    <th style={{ background: 'transparent' }}>Bookmaker</th>
                    <th style={{ background: 'transparent' }}>Price</th>
                    <th style={{ background: 'transparent' }}>Stake</th>
                    <th style={{ background: 'transparent' }}>Status</th>
                    <th style={{ background: 'transparent' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {g.items.map((b, idx) => (
                    <tr key={idx}>
                      <td>{b.outcome}</td>
                      <td>{b.bookmaker}</td>
                      <td>{b.priceDecimal.toFixed(2)}</td>
                      <td>${b.stake.toFixed(2)}</td>
                      <td>
                        <select value={b.result || 'pending'} onChange={(e) => updateBet(b, { result: e.target.value })}
                          style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: 4, padding: 4 }}
                        >
                          <option value="pending">Pending</option>
                          <option value="win">Win</option>
                          <option value="lose">Lose</option>
                        </select>
                      </td>
                      <td>
                        <button onClick={() => removeBet(b)} style={{ background: 'transparent', color: 'var(--color-error)', border: '1px solid var(--color-error)', padding: '4px 8px' }}>Remove</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
