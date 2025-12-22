import { fetchAuthSession } from 'aws-amplify/auth';

async function getAuthHeader() {
  try {
    const { tokens } = await fetchAuthSession();
    const idToken = tokens?.idToken?.toString();
    if (idToken) return { Authorization: `Bearer ${idToken}` };
  } catch {}
  return {};
}

export async function fetchBets() {
  const headers = await getAuthHeader();
  const res = await fetch('/api/bets', { headers });
  if (!res.ok) throw new Error(`Failed to fetch bets: ${res.status}`);
  return res.json();
}

export async function saveBets(bets) {
  const headers = { 'Content-Type': 'application/json', ...(await getAuthHeader()) };
  const res = await fetch('/api/bets', { method: 'PUT', headers, body: JSON.stringify({ bets }) });
  if (!res.ok) throw new Error(`Failed to save bets: ${res.status}`);
  return res.json();
}
