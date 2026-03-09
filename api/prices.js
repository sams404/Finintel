export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=10');

  const FINNHUB_KEY = process.env.FINNHUB_API_KEY;

  const demoCrypto = [
    { symbol:'BTC',  name:'Bitcoin',   price:67420, change24h:1.80,  high24h:68100, low24h:66200, bid:67387, ask:67453, spread:'0.100' },
    { symbol:'ETH',  name:'Ethereum',  price:3180,  change24h:2.40,  high24h:3240,  low24h:3090,  bid:3178,  ask:3182,  spread:'0.200' },
    { symbol:'SOL',  name:'Solana',    price:178.5, change24h:3.10,  high24h:182,   low24h:173,   bid:178.4, ask:178.6, spread:'0.030' },
    { symbol:'BNB',  name:'BNB',       price:585,   change24h:0.90,  high24h:592,   low24h:578,   bid:584.7, ask:585.3, spread:'0.040' },
    { symbol:'XRP',  name:'XRP',       price:0.524, change24h:-0.70, high24h:0.534, low24h:0.512, bid:0.5238,ask:0.5242,spread:'0.001' },
    { symbol:'ADA',  name:'Cardano',   price:0.448, change24h:1.20,  high24h:0.456, low24h:0.438, bid:0.4478,ask:0.4482,spread:'0.001' },
    { symbol:'AVAX', name:'Avalanche', price:34.8,  change24h:2.80,  high24h:35.9,  low24h:33.5,  bid:34.78, ask:34.82, spread:'0.020' },
    { symbol:'DOT',  name:'Polkadot',  price:6.82,  change24h:-1.10, high24h:7.05,  low24h:6.65,  bid:6.818, ask:6.822, spread:'0.010' },
    { symbol:'LINK', name:'Chainlink', price:14.2,  change24h:4.20,  high24h:14.8,  low24h:13.5,  bid:14.19, ask:14.21, spread:'0.010' },
    { symbol:'UNI',  name:'Uniswap',   price:8.45,  change24h:1.60,  high24h:8.72,  low24h:8.18,  bid:8.446, ask:8.454, spread:'0.010' },
  ];
  const demoStocks = [
    { symbol:'NVDA', name:'NVIDIA Corp',  price:178.02, change24h:1.96,  high24h:184.51, low24h:174,  bid:177.97, ask:178.07, spread:'0.056' },
    { symbol:'GOOGL',name:'Alphabet Inc', price:168.45, change24h:0.70,  high24h:170,    low24h:166,  bid:168.40, ask:168.50, spread:'0.056' },
    { symbol:'AAPL', name:'Apple Inc',    price:189.25, change24h:-0.50, high24h:191,    low24h:188,  bid:189.20, ask:189.30, spread:'0.056' },
    { symbol:'MSFT', name:'Microsoft',    price:412.80, change24h:1.10,  high24h:415,    low24h:409,  bid:412.75, ask:412.85, spread:'0.056' },
    { symbol:'TSLA', name:'Tesla Inc',    price:175.60, change24h:-1.80, high24h:180,    low24h:173,  bid:175.55, ask:175.65, spread:'0.056' },
  ];

  const cryptoSymbols = ['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','ADAUSDT','AVAXUSDT','DOTUSDT','LINKUSDT','UNIUSDT'];
  const cryptoMeta = {
    BTCUSDT:{id:'BTC',name:'Bitcoin'}, ETHUSDT:{id:'ETH',name:'Ethereum'},
    SOLUSDT:{id:'SOL',name:'Solana'}, BNBUSDT:{id:'BNB',name:'BNB'},
    XRPUSDT:{id:'XRP',name:'XRP'}, ADAUSDT:{id:'ADA',name:'Cardano'},
    AVAXUSDT:{id:'AVAX',name:'Avalanche'}, DOTUSDT:{id:'DOT',name:'Polkadot'},
    LINKUSDT:{id:'LINK',name:'Chainlink'}, UNIUSDT:{id:'UNI',name:'Uniswap'},
  };

  // ── CRYPTO — Binance public API (no key, no IP restriction) ──────────────
  async function fetchCrypto() {
    const syms = JSON.stringify(cryptoSymbols);
    const r = await fetch(
      `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(syms)}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!r.ok) throw new Error(`Binance public ${r.status}`);
    const data = await r.json();
    if (!Array.isArray(data) || !data.length) throw new Error('empty');
    return data.map(t => {
      const meta = cryptoMeta[t.symbol];
      if (!meta) return null;
      const price = parseFloat(t.lastPrice) || 0;
      const bid   = parseFloat(t.bidPrice)  || price * 0.9995;
      const ask   = parseFloat(t.askPrice)  || price * 1.0005;
      return {
        symbol: meta.id, name: meta.name, price,
        change24h: +(parseFloat(t.priceChangePercent)||0).toFixed(2),
        high24h: parseFloat(t.highPrice) || price,
        low24h:  parseFloat(t.lowPrice)  || price,
        bid, ask,
        spread: price > 0 ? ((ask - bid) / price * 100).toFixed(3) : '0',
        volume: parseFloat(t.quoteVolume) || 0
      };
    }).filter(Boolean);
  }

  // ── STOCKS via Finnhub ────────────────────────────────────────────────────
  async function fetchStocks() {
    if (!FINNHUB_KEY) return demoStocks;
    const symbols = ['NVDA','GOOGL','AAPL','MSFT','TSLA'];
    const meta = { NVDA:'NVIDIA Corp', GOOGL:'Alphabet Inc', AAPL:'Apple Inc', MSFT:'Microsoft', TSLA:'Tesla Inc' };
    const results = await Promise.all(symbols.map(async s => {
      try {
        const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${s}&token=${FINNHUB_KEY}`, { signal: AbortSignal.timeout(6000) });
        const q = await r.json();
        const price = q.c || 0;
        if (!price) return null;
        return { symbol:s, name:meta[s], price, change24h:+(q.dp||0).toFixed(2), high24h:q.h||price, low24h:q.l||price, bid:+(price-0.05).toFixed(2), ask:+(price+0.05).toFixed(2), spread:'0.056' };
      } catch { return null; }
    }));
    const valid = results.filter(Boolean);
    return valid.length >= 3 ? valid : demoStocks;
  }

  // ── FOREX via Frankfurter ─────────────────────────────────────────────────
  async function fetchForex() {
    const r = await fetch('https://api.frankfurter.app/latest?from=USD&to=NOK,EUR,GBP', { signal: AbortSignal.timeout(6000) });
    const d = await r.json();
    const rt = d.rates || {};
    const NOK = rt.NOK||10.52, EUR = rt.EUR||0.924, GBP = rt.GBP||0.793;
    return {
      forex:[
        { pair:'USD/NOK', rate:NOK.toFixed(4), change24h:0 },
        { pair:'EUR/NOK', rate:(NOK/EUR).toFixed(4), change24h:0 },
        { pair:'GBP/NOK', rate:(NOK/GBP).toFixed(4), change24h:0 },
        { pair:'EUR/USD', rate:(1/EUR).toFixed(4), change24h:0 },
        { pair:'DXY',     rate:'104.32', change24h:0 },
      ],
      fxRates:{ NOK, EUR, GBP, USD:1 }
    };
  }

  // ── GOLD via Binance PAXGUSDT (public, no key) ───────────────────────────
  async function fetchGold() {
    const r = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=PAXGUSDT', { signal: AbortSignal.timeout(5000) });
    const d = await r.json();
    return parseFloat(d.price) || 5172.32;
  }

  const [cryptoRes, stocksRes, forexRes, goldRes] = await Promise.allSettled([
    fetchCrypto(),
    fetchStocks(),
    fetchForex(),
    fetchGold(),
  ]);

  const crypto    = (cryptoRes.status==='fulfilled' && cryptoRes.value?.length)  ? cryptoRes.value  : demoCrypto;
  const stocks    = (stocksRes.status==='fulfilled' && stocksRes.value?.length)  ? stocksRes.value  : demoStocks;
  const { forex, fxRates } = forexRes.status==='fulfilled' ? forexRes.value : { forex:[], fxRates:{ NOK:10.52, EUR:0.924, GBP:0.793, USD:1 } };
  const goldPrice = goldRes.status==='fulfilled' ? goldRes.value : 5172.32;

  // Platinum via Binance (XPTUSDT if available)
  let platinumPrice = 978.50;
  try {
    const pr = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=XPTUSDT', { signal: AbortSignal.timeout(4000) });
    const pd = await pr.json();
    if (pd.price) platinumPrice = parseFloat(pd.price);
  } catch {}

  const gsRatio = goldPrice / 84.51;
  const metals = [
    { symbol:'XAU', name:'Gold (1 troy oz)', price:goldPrice, change24h:-3.98, high24h:+(goldPrice*1.005).toFixed(2), low24h:+(goldPrice*0.995).toFixed(2), bid:+(goldPrice-0.5).toFixed(2), ask:+(goldPrice+0.5).toFixed(2), spread:'0.10', gsRatio:+gsRatio.toFixed(1) },
    { symbol:'XAG', name:'Silver (1 troy oz)', price:84.51, change24h:-11.76, high24h:86.0, low24h:82.0, bid:84.48, ask:84.54, spread:'0.40', gsRatio:+gsRatio.toFixed(1) },
    { symbol:'XPT', name:'Platinum (1 troy oz)', price:platinumPrice, change24h:-0.45, high24h:+(platinumPrice*1.01).toFixed(2), low24h:+(platinumPrice*0.99).toFixed(2), bid:+(platinumPrice-1).toFixed(2), ask:+(platinumPrice+1).toFixed(2), spread:'0.20' },
  ];

  const isLive = cryptoRes.status==='fulfilled' && cryptoRes.value?.length > 0;
  res.json({ crypto, stocks, metals, forex, fxRates, ts:Date.now(), source: isLive ? 'live' : 'demo' });
}
