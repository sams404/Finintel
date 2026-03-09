export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=10');

  const BINANCE_KEY = process.env.BINANCE_API_KEY;
  const FINNHUB_KEY = process.env.FINNHUB_API_KEY;

  const stockSymbols = ['NVDA','GOOGL','AAPL','MSFT','TSLA'];
  const stockMeta = {
    NVDA:'NVIDIA Corp', GOOGL:'Alphabet Inc',
    AAPL:'Apple Inc', MSFT:'Microsoft', TSLA:'Tesla Inc'
  };

  // ── CRYPTO via CoinGecko (free, no IP restrictions) ──────────────────────
  async function fetchCryptoCoingecko() {
    const ids = 'bitcoin,ethereum,solana,binancecoin,ripple,cardano,avalanche-2,polkadot,chainlink,uniswap';
    const r = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_high_24h=true&include_low_24h=true`,
      { headers: { 'Accept': 'application/json' } }
    );
    const d = await r.json();
    const map = {
      bitcoin:      { id:'BTC', name:'Bitcoin' },
      ethereum:     { id:'ETH', name:'Ethereum' },
      solana:       { id:'SOL', name:'Solana' },
      binancecoin:  { id:'BNB', name:'BNB' },
      ripple:       { id:'XRP', name:'XRP' },
      cardano:      { id:'ADA', name:'Cardano' },
      'avalanche-2':{ id:'AVAX', name:'Avalanche' },
      polkadot:     { id:'DOT', name:'Polkadot' },
      chainlink:    { id:'LINK', name:'Chainlink' },
      uniswap:      { id:'UNI', name:'Uniswap' },
    };
    return Object.entries(map).map(([cgId, meta]) => {
      const coin = d[cgId] || {};
      const price = coin.usd || 0;
      const chg = coin.usd_24h_change || 0;
      const high = coin.usd_24h_high || price * 1.02;
      const low  = coin.usd_24h_low  || price * 0.98;
      const spread = price > 0 ? (price * 0.001).toFixed(price > 100 ? 2 : 4) : '0';
      return { symbol:meta.id, name:meta.name, price, change24h:+chg.toFixed(2), high24h:high, low24h:low, bid:+(price*0.9995).toFixed(price>100?2:6), ask:+(price*1.0005).toFixed(price>100?2:6), spread };
    });
  }

  // ── CRYPTO via Binance (fallback if CoinGecko fails) ─────────────────────
  async function fetchCryptoBinance() {
    const syms = ['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','ADAUSDT','AVAXUSDT','DOTUSDT','LINKUSDT','UNIUSDT'];
    const cryptoMeta = {
      BTCUSDT:{id:'BTC',name:'Bitcoin'}, ETHUSDT:{id:'ETH',name:'Ethereum'},
      SOLUSDT:{id:'SOL',name:'Solana'}, BNBUSDT:{id:'BNB',name:'BNB'},
      XRPUSDT:{id:'XRP',name:'XRP'}, ADAUSDT:{id:'ADA',name:'Cardano'},
      AVAXUSDT:{id:'AVAX',name:'Avalanche'}, DOTUSDT:{id:'DOT',name:'Polkadot'},
      LINKUSDT:{id:'LINK',name:'Chainlink'}, UNIUSDT:{id:'UNI',name:'Uniswap'},
    };
    const r = await fetch(
      `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(syms))}`,
      { headers: BINANCE_KEY ? { 'X-MBX-APIKEY': BINANCE_KEY } : {} }
    );
    const data = await r.json();
    if (!Array.isArray(data)) throw new Error('Binance error');
    return data.map(t => {
      const meta = cryptoMeta[t.symbol]; if (!meta) return null;
      const price = parseFloat(t.lastPrice);
      return { symbol:meta.id, name:meta.name, price, change24h:parseFloat(t.priceChangePercent), high24h:parseFloat(t.highPrice), low24h:parseFloat(t.lowPrice), bid:parseFloat(t.bidPrice), ask:parseFloat(t.askPrice), spread:((parseFloat(t.askPrice)-parseFloat(t.bidPrice))/price*100).toFixed(3) };
    }).filter(Boolean);
  }

  // ── STOCKS via Finnhub ────────────────────────────────────────────────────
  async function fetchStocks() {
    const results = await Promise.all(
      stockSymbols.map(async s => {
        try {
          const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${s}&token=${FINNHUB_KEY}`);
          const q = await r.json();
          const price = q.c || 0;
          if (!price) return null;
          return { symbol:s, name:stockMeta[s], price, change24h:+(q.dp||0).toFixed(2), high24h:q.h||price, low24h:q.l||price, bid:+(price-0.05).toFixed(2), ask:+(price+0.05).toFixed(2), spread:'0.056' };
        } catch { return null; }
      })
    );
    return results.filter(Boolean);
  }

  // ── FOREX via Frankfurter ─────────────────────────────────────────────────
  async function fetchForex() {
    const r = await fetch('https://api.frankfurter.app/latest?from=USD&to=NOK,EUR,GBP');
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

  try {
    // Run all fetches in parallel
    const [forexData, stocksRaw, ...cryptoResult] = await Promise.allSettled([
      fetchForex(),
      fetchStocks(),
      fetchCryptoCoingecko().catch(() => fetchCryptoBinance()),
    ]);

    const { forex, fxRates } = forexData.status === 'fulfilled' ? forexData.value : { forex:[], fxRates:{ NOK:10.52, EUR:0.924, GBP:0.793, USD:1 } };
    const stocks = stocksRaw.status === 'fulfilled' ? stocksRaw.value : [];
    const crypto = cryptoResult[0].status === 'fulfilled' ? cryptoResult[0].value : [];

    // Metals (gold from CoinGecko PAXG or demo)
    let goldPrice = 5172.32;
    try {
      const gr = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=pax-gold&vs_currencies=usd');
      const gd = await gr.json();
      if (gd['pax-gold']?.usd) goldPrice = gd['pax-gold'].usd;
    } catch {}

    const metals = [
      { symbol:'XAU', name:'Gold (1 troy oz)', price:goldPrice, change24h:-3.98, high24h:+(goldPrice*1.005).toFixed(2), low24h:+(goldPrice*0.995).toFixed(2), bid:+(goldPrice-0.5).toFixed(2), ask:+(goldPrice+0.5).toFixed(2), spread:'0.10' },
      { symbol:'XAG', name:'Silver (1 troy oz)', price:84.51, change24h:-11.76, high24h:86.0, low24h:82.0, bid:84.48, ask:84.54, spread:'0.40' },
    ];

    res.json({ crypto, stocks, metals, forex, fxRates, ts:Date.now(), source: crypto.length ? 'live' : 'demo' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
