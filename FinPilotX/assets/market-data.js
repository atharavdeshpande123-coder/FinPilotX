/* Provider boundary: portfolio calculations receive validated quotes only. Swap
   providers here without changing the transaction or holdings engine. */
const marketDataService = (() => {
  const CACHE_KEY = 'finpilotx-price-cache-v1';
  const SOURCE = 'Yahoo Finance public market feed';
  const NAV_SOURCE = 'MFAPI / AMFI NAV feed';
  const cache = () => JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
  const save = values => localStorage.setItem(CACHE_KEY, JSON.stringify(values));
  const indianMarketOpen = () => {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
    const value = name => parts.find(part => part.type === name)?.value;
    const weekday = value('weekday'); const minutes = Number(value('hour')) * 60 + Number(value('minute'));
    return !['Sat', 'Sun'].includes(weekday) && minutes >= 555 && minutes <= 930;
  };
  const stamp = () => new Date().toISOString();
  async function yahoo(asset) {
    const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(asset.yahoo)}?range=1d&interval=1m`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Quote request failed (${response.status})`);
    const payload = await response.json();
    const meta = payload?.chart?.result?.[0]?.meta;
    const price = meta?.regularMarketPrice;
    if (!Number.isFinite(price)) throw new Error('Provider returned no valid price');
    return { asset: asset.symbol, price, currency: meta.currency || 'INR', exchange: meta.exchangeName || 'NSE', source: SOURCE, timestamp: stamp(), status: 'DELAYED', marketOpen: indianMarketOpen() };
  }
  async function mutualFund(asset) {
    const response = await fetch(`https://api.mfapi.in/mf/${asset.mfCode}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`NAV request failed (${response.status})`);
    const payload = await response.json(); const latest = payload?.data?.[0]; const price = Number(latest?.nav);
    if (!Number.isFinite(price)) throw new Error('Provider returned no valid NAV');
    return { asset: asset.symbol, price, currency: 'INR', exchange: 'Mutual Fund NAV', source: NAV_SOURCE, timestamp: stamp(), navDate: latest.date, status: 'DELAYED', marketOpen: false };
  }
  async function quote(asset, { force = false } = {}) {
    const cached = cache()[asset.symbol];
    if (!force && cached && Date.now() - new Date(cached.timestamp).getTime() < 55_000) return cached;
    try {
      const fresh = asset.mfCode ? await mutualFund(asset) : asset.yahoo ? await yahoo(asset) : null;
      if (!fresh) throw new Error('No configured price provider for this asset');
      const values = cache(); values[asset.symbol] = fresh; save(values); return fresh;
    } catch (error) {
      if (cached?.price != null) return { ...cached, status: 'LAST KNOWN', error: error.message };
      return { asset: asset.symbol, price: null, currency: 'INR', exchange: '—', source: asset.mfCode ? NAV_SOURCE : SOURCE, timestamp: null, status: 'UNAVAILABLE', error: error.message, marketOpen: indianMarketOpen() };
    }
  }
  async function quotes(assets, options) { return Object.fromEntries(await Promise.all(assets.map(async asset => [asset.symbol, await quote(asset, options)]))); }
  function formatIST(timestamp, includeSeconds = true) {
    if (!timestamp) return 'Not synced';
    return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', hour: '2-digit', minute: '2-digit', ...(includeSeconds ? { second: '2-digit' } : {}) }).format(new Date(timestamp));
  }
  return { quotes, formatIST, indianMarketOpen, cache };
})();
