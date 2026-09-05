const indianIndices = [
  { name: 'NIFTY 50', symbol: '^NSEI' },
  { name: 'SENSEX', symbol: '^BSESN' },
  { name: 'NIFTY BANK', symbol: '^NSEBANK' },
  { name: 'NIFTY IT', symbol: '^CNXIT' }
];

const sampleIndices = [
  { name: 'NIFTY 50', value: 24618.00, change: 0.84 },
  { name: 'SENSEX', value: 80214.00, change: 0.72 },
  { name: 'NIFTY BANK', value: 52431.00, change: -0.18 },
  { name: 'NIFTY IT', value: 37280.00, change: 0.41 }
];

const number = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 });

function tickerMarkup(indices, status) {
  const items = indices.map(({ name, value, change }) => {
    const up = change >= 0;
    return `<span class="ticker-item"><b>${name}</b><span>${number.format(value)}</span><i class="${up ? 'up' : 'down'}">${up ? '+' : ''}${change.toFixed(2)}%</i></span>`;
  }).join('');
  const group = `<span class="ticker-group">${items}<span class="ticker-item ticker-live">${status}</span></span>`;
  return `${group}<span aria-hidden="true">${group}</span>`;
}

function renderTicker(indices, status) {
  document.querySelectorAll('[data-market-ticker]').forEach(ticker => {
    ticker.innerHTML = tickerMarkup(indices, status);
  });
}

async function loadIndianIndices() {
  const quotes = await Promise.all(indianIndices.map(async ({ name, symbol }) => {
    const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Unable to load ${name}`);
    const { chart } = await response.json();
    const result = chart?.result?.[0];
    const value = result?.meta?.regularMarketPrice;
    const previous = result?.meta?.chartPreviousClose ?? result?.meta?.previousClose;
    if (!Number.isFinite(value) || !Number.isFinite(previous) || previous === 0) throw new Error(`Invalid quote for ${name}`);
    return { name, value, change: ((value - previous) / previous) * 100 };
  }));
  return quotes;
}

async function refreshMarketTicker() {
  try {
    const indices = await loadIndianIndices();
    const updatedAt = new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }).format(new Date());
    renderTicker(indices, `Market feed · updated ${updatedAt} IST`);
  } catch (error) {
    renderTicker(sampleIndices, 'Market feed unavailable · sample data');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (!document.querySelector('[data-market-ticker]')) return;
  refreshMarketTicker();
  window.setInterval(refreshMarketTicker, 60_000);
});
