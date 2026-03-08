import crypto from 'crypto';

function sign(qs, secret) {
  return crypto.createHmac('sha256', secret).update(qs).digest('hex');
}

async function binance(path, params, apiKey, secretKey) {
  const ts = Date.now();
  const qs = new URLSearchParams({ ...params, timestamp: ts }).toString();
  const sig = sign(qs, secretKey);
  const r = await fetch(`https://api.binance.com${path}?${qs}&signature=${sig}`, {
    headers: { 'X-MBX-APIKEY': apiKey }
  });
  return r.json();
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  res.setHeader('Access-Control-Allow-Origin', '*');

  const API = process.env.BINANCE_API_KEY;
  const SECRET = process.env.BINANCE_SECRET_KEY;
  if (!API || !SECRET) return res.status(500).json({ error: 'Binance keys not configured' });

  try {
    const account = await binance('/api/v3/account', {}, API, SECRET);
    if (account.code) throw new Error(account.msg || `Error ${account.code}`);

    // Filter non-zero balances
    const balances = (account.balances || [])
      .filter(b => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0)
      .map(b => ({
        asset: b.asset,
        free: parseFloat(b.free),
        locked: parseFloat(b.locked),
        total: parseFloat(b.free) + parseFloat(b.locked)
      }));

    res.json({ balances, ts: Date.now() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
