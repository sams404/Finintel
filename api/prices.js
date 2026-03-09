export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=10');

  const FINNHUB_KEY = process.env.FINNHUB_API_KEY;

  // ── DEMO FALLBACK ─────────────────────────────────────────────────────────
  const demoCrypto = [
    { symbol:'BTC',  name:'Bitcoin',    price:67420, change24h:1.8,  high24h:68100, low24h:66200, spread:'0.001' },
    { symbol:'ETH',  name:'Ethereum',   price:3180,  change24h:2.4,  high24h:3240,  low24h:3090,  spread:'0.002' },
    { symbol:'SOL',  name:'Solana',     price:178.5, change24h:3.1,  high24h:182,   low24h:173,   spread:'0.030' },
    { symbol:'BNB',  name:'BNB',        price:585,   change24h:0.9,  high24h:592,   low24h:578,   spread:'0.040' },
    { symbol:'XRP',  name:'XRP',        price:0.524, change24h:-0.7, high24h:0.534, low24h:0.512, spread:'0.001' },
    { symbol:'ADA',  name:'Cardano',    price:0.448, change24h:1.2,  high24h:0.456, low24h:0.438, spread:'0.001' },
    { symbol:'AVAX', name:'Avalanche',  price:34.8,  change24h:2.8,  high24h:35.9,  low24h:33.5,  spread:'0.020' },
    { symbol:'DOT',  name:'Polkadot',   price:6.82,  change24h:-1.1, high24h:7.05,  low24h:6.65,  spread:'0.010' },
    { symbol:'LINK', name:'Chainlink',  price:14.2,  change24h:4.2,  high24h:14.8,  low24h:13.5,  spread:'0.010' },
    { symbol:'UNI',  name:'Uniswap',    price:8.45,  change24h:1.6,  high24h:8.72,  low24h:8.18,  spread:'0.010' },
  ];
  const demoStocks = [
    { symbol:'NVDA', name:'NVIDIA Corp',  price:178.02, change24h:1.96, high24h:184.51, low24h:174,  spread:'0.056' },
    { symbol:'GOOGL',name:'Alphabet Inc', price:168.45, change24h:0.7,  high24h:170,    low24h:166,  spread:'0.056' },
    { symbol:'AAPL', name:'Apple Inc',    price:189.25, change24h:-0.5, high24h:191,    low24h:188,  spread:'0.056' },
    { symbol:'MSFT', name:'Microsoft',    price:412.80, change24h:1.1,  high24h:415,    low24h:409,  spread:'0.056' },
    { symbol:'TSLA', name:'Tesla Inc',    price:175.60, change24h:-1.8, high24h:180,    low24h:173,  spread:'0.056' },
  ];

  // ── CRYPTO via CoinGecko /coins/markets ───────────────────────────────────
  async function fetchCrypto() {
    const ids = 'bitcoin,ethereum,solana,binancecoin,ripple,cardano,avalanche-2,polkadot,chainlink,uniswap';
    const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&price_change_percentage=24h`;
    const r = await fetch(url, { headers:{ 'Accept':'application/json' } });
    if (!r.ok) throw new Error(`CoinGecko ${r.status}`);
    const data = await r.json();
    if (!Array.isArray(data) || !data.length) throw new Error('empty');
    const idMap = {
      bitcoin:'BTC', ethereum:'ETH', solana:'SOL', binancecoin:'BNB',
      ripple:'XRP', cardano:'ADA', 'avalanche-2':'AVAX',
      polkadot:'DOT', chainlink:'LINK', uniswap:'UNI'
    };
    return data.map(c => {
      const sym = idMap[c.id] || c.id.toUpperCase();
      const price = c.current_price || 0;
      const spread = price > 0 ? (price * 0.001).toFixed(price > 100 ? 2 : 4) : '0';
      return {
        symbol: sym, name: c.name, price,
        change24h: +(c.price_change_percentage_24h || 0).toFixed(2),
        high24h: c.high_24h || price, low24h: c.low_24h || price,
        bid: +(price * 0.9995).toFixed(price > 100 ? 2 : 6),
        ask: +(price * 1.0005).toFixed(price > 100 ? 2 : 6),
        spread
      };
    });
  }

  // ── STOCKS via Finnhub ────────────────────────────────────────────────────
  async function fetchStocks() {
    const stockSymbols = ['NVDA','GOOGL','AAPL','MSFT','TSLA'];
    const stockMeta = { NVDA:'NVIDIA Corp', GOOGL:'Alphabet Inc', AAPL:'Apple Inc', MSFT:'Microsoft', TSLA:'Tesla Inc' };
    if (!FINNHUB_KEY) return demoStocks;
    const results = await Promise.all(
      stockSymbols.map(async s => {
        try {
          const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${s}&token=${FINNHUB_KEY}`, { signal: AbortSignal.timeout(5000) });
          const q = await r.json();
          const price = q.c || 0;
          if (!price) return null;
          return { symbol:s, name:stockMeta[s], price, change24h:+(q.dp||0).toFixed(2), high24h:q.h||price, low24h:q.l||price, bid:+(price-0.05).toFixed(2), ask:+(price+0.05).toFixed(2), spread:'0.056' };
        } catch { return null; }
      })
    );
    const valid = results.filter(Boolean);
    return valid.length ? valid : demoStocks;
  }

  // ── FOREX via Frankfurter ─────────────────────────────────────────────────
  async function fetchForex() {
    const r = await fetch('https://api.frankfurter.app/latest?from=USD&to=NOK,EUR,GBP', { signal: AbortSignal.timeout(5000) });
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

  // ── GOLD via CoinGecko PAXG ───────────────────────────────────────────────
  async function fetchGold() {
    const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=pax-gold&vs_currencies=usd', { signal: AbortSignal.timeout(5000) });
    const d = await r.json();
    return d['pax-gold']?.usd || 5172.32;
  }

  try {
    const [cryptoRes, stocksRes, forexRes, goldRes] = await Promise.allSettled([
      fetchCrypto(),
      fetchStocks(),
      fetchForex(),
      fetchGold(),
    ]);

    const crypto = cryptoRes.status === 'fulfilled' ? cryptoRes.value : demoCrypto;
    const stocks = stocksRes.status === 'fulfilled' ? stocksRes.value : demoStocks;
    const { forex, fxRates } = forexRes.status === 'fulfilled'
      ? forexRes.value
      : { forex:[], fxRates:{ NOK:10.52, EUR:0.924, GBP:0.793, USD:1 } };
    const goldPrice = goldRes.status === 'fulfilled' ? goldRes.value : 5172.32;

    const metals = [
      { symbol:'XAU', name:'Gold (1 troy oz)', price:goldPrice, change24h:-3.98, high24h:+(goldPrice*1.005).toFixed(2), low24h:+(goldPrice*0.995).toFixed(2), bid:+(goldPrice-0.5).toFixed(2), ask:+(goldPrice+0.5).toFixed(2), spread:'0.10' },
      { symbol:'XAG', name:'Silver (1 troy oz)', price:84.51, change24h:-11.76, high24h:86.0, low24h:82.0, bid:84.48, ask:84.54, spread:'0.40' },
    ];

    const isLive = cryptoRes.status === 'fulfilled';
    res.json({ crypto, stocks, metals, forex, fxRates, ts:Date.now(), source: isLive ? 'live' : 'demo' });

  } catch (e) {
    // Full fallback
    res.json({
      crypto: demoCrypto, stocks: demoStocks,
      metals:[
        { symbol:'XAU', name:'Gold (1 troy oz)', price:5172.32, change24h:-3.98, high24h:5416, low24h:5037, bid:5171.82, ask:5172.82, spread:'0.10' },
        { symbol:'XAG', name:'Silver (1 troy oz)', price:84.51, change24h:-11.76, high24h:86, low24h:82, bid:84.48, ask:84.54, spread:'0.40' },
      ],
      forex:[
        { pair:'USD/NOK', rate:'10.5200', change24h:0 },
        { pair:'EUR/NOK', rate:'11.3800', change24h:0 },
        { pair:'GBP/NOK', rate:'13.2600', change24h:0 },
        { pair:'EUR/USD', rate:'1.0820', change24h:0 },
        { pair:'DXY',     rate:'104.32', change24h:0 },
      ],
      fxRates:{ NOK:10.52, EUR:0.924, GBP:0.793, USD:1 },
      ts:Date.now(), source:'demo', error: e.message
    });
  }
}
