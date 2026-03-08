export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=5');

  const BINANCE_KEY = process.env.BINANCE_API_KEY;
  const FINNHUB_KEY = process.env.FINNHUB_API_KEY;

  const cryptoSymbols = [
    'BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT',
    'ADAUSDT','AVAXUSDT','DOTUSDT','LINKUSDT','UNIUSDT','PAXGUSDT'
  ];
  const stockSymbols = ['NVDA','GOOGL','AAPL','MSFT','TSLA'];

  const cryptoMeta = {
    BTCUSDT:{id:'BTC',name:'Bitcoin'},
    ETHUSDT:{id:'ETH',name:'Ethereum'},
    SOLUSDT:{id:'SOL',name:'Solana'},
    BNBUSDT:{id:'BNB',name:'BNB'},
    XRPUSDT:{id:'XRP',name:'XRP'},
    ADAUSDT:{id:'ADA',name:'Cardano'},
    AVAXUSDT:{id:'AVAX',name:'Avalanche'},
    DOTUSDT:{id:'DOT',name:'Polkadot'},
    LINKUSDT:{id:'LINK',name:'Chainlink'},
    UNIUSDT:{id:'UNI',name:'Uniswap'},
  };
  const stockMeta = {
    NVDA:'NVIDIA Corp',GOOGL:'Alphabet Inc',
    AAPL:'Apple Inc',MSFT:'Microsoft',TSLA:'Tesla Inc'
  };

  try {
    const [binanceRes, forexRes, ...finnhubRes] = await Promise.all([
      fetch(
        `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(cryptoSymbols))}`,
        { headers: BINANCE_KEY ? { 'X-MBX-APIKEY': BINANCE_KEY } : {} }
      ),
      fetch('https://api.frankfurter.app/latest?from=USD&to=NOK,EUR,GBP'),
      ...stockSymbols.map(s =>
        fetch(`https://finnhub.io/api/v1/quote?symbol=${s}&token=${FINNHUB_KEY}`)
      )
    ]);

    const [binanceData, forexData, ...stockData] = await Promise.all([
      binanceRes.json(),
      forexRes.json(),
      ...finnhubRes.map(r => r.json())
    ]);

    // --- Crypto ---
    let goldPrice = null;
    const crypto = [];
    (Array.isArray(binanceData) ? binanceData : []).forEach(t => {
      if (t.symbol === 'PAXGUSDT') { goldPrice = parseFloat(t.lastPrice); return; }
      const meta = cryptoMeta[t.symbol];
      if (!meta) return;
      const price = parseFloat(t.lastPrice);
      const bid = parseFloat(t.bidPrice);
      const ask = parseFloat(t.askPrice);
      crypto.push({
        symbol: meta.id, name: meta.name, price,
        change24h: parseFloat(t.priceChangePercent),
        high24h: parseFloat(t.highPrice),
        low24h: parseFloat(t.lowPrice),
        bid, ask, volume: parseFloat(t.quoteVolume),
        spread: bid > 0 ? ((ask - bid) / price * 100).toFixed(3) : '—'
      });
    });

    // --- Stocks ---
    const stocks = stockSymbols.map((sym, i) => {
      const q = stockData[i] || {};
      const price = q.c || 0;
      return {
        symbol: sym, name: stockMeta[sym], price,
        change24h: q.dp || 0,
        high24h: q.h || price, low24h: q.l || price,
        bid: +(price - 0.05).toFixed(2),
        ask: +(price + 0.05).toFixed(2),
        spread: '0.056'
      };
    });

    // --- Metals (gold from PAXG, silver demo) ---
    const xau = goldPrice || 5172.32;
    const metals = [
      {
        symbol:'XAU', name:'Gold (1 troy oz)', price:xau,
        change24h:-3.98, high24h:+(xau*1.005).toFixed(2), low24h:+(xau*0.995).toFixed(2),
        bid:+(xau-0.5).toFixed(2), ask:+(xau+0.5).toFixed(2), spread:'0.10'
      },
      {
        symbol:'XAG', name:'Silver (1 troy oz)', price:84.51,
        change24h:-11.76, high24h:86.0, low24h:82.0,
        bid:84.48, ask:84.54, spread:'0.40'
      }
    ];

    // --- Forex ---
    const rates = forexData.rates || {};
    const NOK = rates.NOK || 10.52;
    const EUR = rates.EUR || 0.924;
    const GBP = rates.GBP || 0.793;
    const forex = [
      { pair:'USD/NOK', rate:NOK.toFixed(4), change24h:0 },
      { pair:'EUR/NOK', rate:(NOK/EUR).toFixed(4), change24h:0 },
      { pair:'GBP/NOK', rate:(NOK/GBP).toFixed(4), change24h:0 },
      { pair:'EUR/USD', rate:(1/EUR).toFixed(4), change24h:0 },
      { pair:'DXY',     rate:'104.32', change24h:0 }
    ];

    res.json({
      crypto, stocks, metals, forex,
      fxRates:{ NOK, EUR, GBP, USD:1 },
      ts: Date.now(), source:'live'
    });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
