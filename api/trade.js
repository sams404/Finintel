import crypto from 'crypto';

function sign(qs, secret) {
  return crypto.createHmac('sha256', secret).update(qs).digest('hex');
}

async function binance(path, params, apiKey, secretKey, method = 'GET') {
  const ts = Date.now();
  const qs = new URLSearchParams({ ...params, timestamp: ts }).toString();
  const sig = sign(qs, secretKey);
  const url = `https://api.binance.com${path}`;

  const opts = { method, headers: { 'X-MBX-APIKEY': apiKey } };
  const fullUrl = method === 'POST' ? url : `${url}?${qs}&signature=${sig}`;
  if (method === 'POST') opts.body = `${qs}&signature=${sig}`;
  if (method === 'POST') opts.headers['Content-Type'] = 'application/x-www-form-urlencoded';

  const r = await fetch(fullUrl, opts);
  return r.json();
}

// Allowed symbols for safety
const ALLOWED = new Set([
  'BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT',
  'ADAUSDT','AVAXUSDT','LINKUSDT','UNIUSDT'
]);

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();
  res.setHeader('Access-Control-Allow-Origin', '*');

  const API    = process.env.BINANCE_API_KEY;
  const SECRET = process.env.BINANCE_SECRET_KEY;
  if (!API || !SECRET) return res.status(500).json({ error: 'Binance keys not configured' });

  const { symbol, side, quoteQty, type = 'MARKET' } = req.body || {};

  if (!symbol || !side || !quoteQty)
    return res.status(400).json({ error: 'symbol, side, quoteQty required' });
  if (!ALLOWED.has(symbol.toUpperCase()))
    return res.status(400).json({ error: `Symbol not allowed: ${symbol}` });
  if (!['BUY','SELL'].includes(side.toUpperCase()))
    return res.status(400).json({ error: 'side must be BUY or SELL' });
  if (+quoteQty < 5)
    return res.status(400).json({ error: 'Minimum order 5 USDT' });

  try {
    const order = await binance('/api/v3/order', {
      symbol: symbol.toUpperCase(),
      side: side.toUpperCase(),
      type,
      quoteOrderQty: +quoteQty
    }, API, SECRET, 'POST');

    if (order.code) throw new Error(order.msg || `Binance error ${order.code}`);

    res.json({
      orderId: order.orderId,
      symbol: order.symbol,
      side: order.side,
      status: order.status,
      executedQty: order.executedQty,
      cummulativeQuoteQty: order.cummulativeQuoteQty,
      fills: order.fills || [],
      ts: Date.now()
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
