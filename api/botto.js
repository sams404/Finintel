const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-opus-4-6';

async function callClaude(key, messages, useSearch = false) {
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': key,
    'anthropic-version': '2023-06-01'
  };
  const body = { model: MODEL, max_tokens: 1200, messages };
  if (useSearch) {
    headers['anthropic-beta'] = 'web-search-2025-03-05';
    body.tools = [{ type: 'web_search_20250305', name: 'web_search' }];
  }
  const r = await fetch(ANTHROPIC_URL, { method: 'POST', headers, body: JSON.stringify(body) });
  return r.json();
}

async function runWithSearch(key, prompt) {
  let messages = [{ role: 'user', content: prompt }];
  let text = '';

  for (let i = 0; i < 8; i++) {
    const d = await callClaude(key, messages, true);
    if (d.error) throw new Error(d.error.message);

    const textBlocks = (d.content || []).filter(b => b.type === 'text');
    text += textBlocks.map(b => b.text).join('\n');

    if (d.stop_reason === 'end_turn') break;

    if (d.stop_reason === 'tool_use') {
      // Claude wants to search — add assistant turn + empty tool results
      // Anthropic's hosted web_search executes server-side; just continue
      messages.push({ role: 'assistant', content: d.content });
      const toolUses = (d.content || []).filter(b => b.type === 'tool_use');
      if (!toolUses.length) break;
      messages.push({
        role: 'user',
        content: toolUses.map(t => ({
          type: 'tool_result',
          tool_use_id: t.id,
          content: 'Search executed.'
        }))
      });
    } else {
      break;
    }
  }
  return text.trim();
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();
  res.setHeader('Access-Control-Allow-Origin', '*');

  const ANTHROPIC_KEY = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'API key not configured' });

  const { marketData, balance = 50, tax = 37.84 } = req.body || {};
  if (!marketData) return res.status(400).json({ error: 'No market data' });

  const prompt = `Ты — Finance Botto, элитный AI-трейдер. Инвестор в Норвегии, малый капитал.

ДАННЫЕ РЫНКА (реальные, источник: Binance + Finnhub):
${marketData}

Баланс: $${balance} | Налог: ${tax}% | Дата: ${new Date().toLocaleDateString('ru')}

Найди актуальные новости через web_search. Дай ровно 3 торговых сигнала на 2-3 дня.

Формат СТРОГО:

1️⃣ АКЦИИ
Актив: [тикер]
Направление: BUY/SELL
Вход: $X | Цель: $X | Стоп: $X
R:R = X.X | Биржа: [название]
Причина: [1 предложение с конкретными цифрами]

2️⃣ КРИПТО
[тот же формат]

3️⃣ МЕТАЛЛ
[тот же формат]

💰 С $${balance} после налога ${tax}%:
Потенциал: $X (+X%) | Net after tax: $X

Только цифры и факты. Без дисклеймеров.`;

  try {
    let text = '';
    try {
      text = await runWithSearch(ANTHROPIC_KEY, prompt);
    } catch {
      // fallback: no web search
      const d = await callClaude(ANTHROPIC_KEY, [{ role: 'user', content: prompt }], false);
      if (d.error) throw new Error(d.error.message);
      text = (d.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    }
    if (!text) throw new Error('Empty response');
    res.json({ text });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
