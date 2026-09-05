const FPX_STORE = 'finpilotx-transactions-v1';
const assets = [
  { symbol: 'RELIANCE', name: 'Reliance Industries', isin: 'INE002A01018', type: 'Indian Stock', yahoo: 'RELIANCE.NS' },
  { symbol: 'HDFCBANK', name: 'HDFC Bank', isin: 'INE040A01034', type: 'Indian Stock', yahoo: 'HDFCBANK.NS' },
  { symbol: 'NIFTYBEES', name: 'Nippon India ETF Nifty BeES', isin: 'INF204KB14I2', type: 'ETF', yahoo: 'NIFTYBEES.NS' },
  { symbol: 'GOLDBEES', name: 'Nippon India ETF Gold BeES', isin: 'INF204KB17I5', type: 'Gold ETF', yahoo: 'GOLDBEES.NS' },
  { symbol: 'HDFCNIFTY', name: 'HDFC Nifty 50 Index Fund', isin: 'INF179KC1964', type: 'Index Fund' },
  { symbol: 'AXISELSS', name: 'Axis ELSS Tax Saver Fund — Direct Growth', isin: 'INF846K01W80', type: 'Mutual Fund', mfCode: '120503' },
  { symbol: 'PARAGPARIKH', name: 'Parag Parikh Flexi Cap Fund', isin: 'INF879O01027', type: 'Mutual Fund' }
];

const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
const compactMoney = value => money.format(value || 0);
const readTransactions = () => JSON.parse(localStorage.getItem(FPX_STORE) || '[]');
const writeTransactions = transactions => localStorage.setItem(FPX_STORE, JSON.stringify(transactions));
const id = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let refreshTimer;

function portfolioFrom(transactions) {
  const holdings = {};
  transactions.slice().sort((a, b) => new Date(a.date) - new Date(b.date)).forEach(tx => {
    if (!['BUY', 'SELL'].includes(tx.type)) return;
    const entry = holdings[tx.symbol] ||= { ...assets.find(asset => asset.symbol === tx.symbol), quantity: 0, cost: 0, realized: 0 };
    const total = tx.quantity * tx.price;
    const charges = tx.charges || 0;
    if (tx.type === 'BUY') {
      entry.cost += total + charges;
      entry.quantity += tx.quantity;
    } else if (entry.quantity >= tx.quantity) {
      const average = entry.quantity ? entry.cost / entry.quantity : 0;
      entry.realized += total - charges - (average * tx.quantity);
      entry.cost -= average * tx.quantity;
      entry.quantity -= tx.quantity;
    }
  });
  return Object.values(holdings).filter(holding => holding.quantity > 0).map(holding => ({
    ...holding,
    average: holding.cost / holding.quantity,
    current: holding.currentPrice ?? null,
    invested: holding.cost,
    value: holding.currentPrice == null ? null : holding.quantity * holding.currentPrice
  }));
}

async function updatePrices(holdings, options) {
  const quotes = await marketDataService.quotes(holdings, options);
  return holdings.map(holding => {
    const quote = quotes[holding.symbol];
    const current = quote?.price ?? null;
    return { ...holding, currentPrice: current, current, value: current == null ? null : holding.quantity * current, quote };
  });
}

function totals(holdings) {
  const invested = holdings.reduce((sum, holding) => sum + holding.invested, 0);
  const unavailable = holdings.filter(holding => holding.value == null).length;
  const knownValue = holdings.reduce((sum, holding) => sum + (holding.value ?? 0), 0);
  const value = unavailable ? null : knownValue;
  const realized = holdings.reduce((sum, holding) => sum + holding.realized, 0);
  return { invested, value, knownValue, unrealized: value == null ? null : value - invested, realized, totalReturn: value == null ? null : value - invested + realized, unavailable };
}

function returnClass(value) { return value >= 0 ? 'up' : 'down'; }
function percent(value, base) { return base ? (value / base) * 100 : 0; }
function amount(value, sign = false) { return value == null ? '—' : `${sign && value > 0 ? '+' : ''}${compactMoney(value)}`; }

function renderPortfolio(holdings) {
  const table = document.querySelector('.section.card tbody');
  if (!table) return;
  const summary = totals(holdings);
  const button = document.querySelector('.section.card .btn.primary');
  if (button) { button.textContent = '+ Add Transaction'; button.dataset.addTransaction = ''; button.removeAttribute('data-toast'); }
  table.innerHTML = holdings.length ? holdings.map(holding => {
    const pnl = holding.value == null ? null : holding.value - holding.invested;
    const weight = holding.value == null || summary.value == null ? null : percent(holding.value, summary.value);
    const status = holding.quote?.status || 'UNAVAILABLE';
    return `<tr><td><b>${holding.symbol}</b><br><span class="demo">${holding.type}</span></td><td>${holding.quantity.toLocaleString('en-IN', { maximumFractionDigits: 4 })}</td><td>${compactMoney(holding.average)}</td><td>${holding.current == null ? '—' : compactMoney(holding.current)}<br><span class="quote-status ${status.toLowerCase().replace(' ', '-')}">${status}</span></td><td>${compactMoney(holding.invested)}</td><td class="${pnl == null ? '' : returnClass(pnl)}">${pnl == null ? '—' : `${pnl >= 0 ? '+' : ''}${percent(pnl, holding.invested).toFixed(2)}%`}</td><td>${weight == null ? '—' : `${weight.toFixed(1)}%`}</td><td><span class="tag">${weight != null && weight > 35 ? 'Review weight' : status}</span></td></tr>`;
  }).join('') : `<tr><td colspan="8" class="empty-state">No holdings yet. Add your first BUY transaction to build this portfolio.</td></tr>`;
  const subtitle = document.querySelector('.page-title .demo');
  if (subtitle) subtitle.textContent = holdings.length ? `${holdings.length} live holding${holdings.length === 1 ? '' : 's'} · updated now` : 'No transactions yet';
}

function renderDashboard(holdings) {
  const stats = document.querySelectorAll('.stat-card');
  if (!stats.length) return;
  const summary = totals(holdings);
  const entries = [
    ['Total portfolio', amount(summary.value), summary.unavailable ? `${summary.unavailable} holding price unavailable` : `${percent(summary.totalReturn, summary.invested).toFixed(2)}% overall return`],
    ['Invested', compactMoney(summary.invested), `Across ${holdings.length} asset${holdings.length === 1 ? '' : 's'}`],
    ['Unrealized P&L', amount(summary.unrealized, true), summary.unavailable ? 'Waiting for complete price data' : 'Based on verified current / last-known prices'],
    ['Realized P&L', `${summary.realized >= 0 ? '+' : ''}${compactMoney(summary.realized)}`, 'From completed SELL transactions']
  ];
  stats.forEach((card, index) => {
    const [label, value, caption] = entries[index];
    const result = index === 2 ? summary.unrealized : index === 3 ? summary.realized : summary.totalReturn;
    card.innerHTML = `<span class="sub">${label}</span><div class="metric ${result == null ? '' : returnClass(result)}">${value}</div><span class="${result == null ? '' : returnClass(result)} sub">${caption}</span>`;
  });
  const table = document.querySelector('section.card[style] tbody');
  if (table) table.innerHTML = holdings.length ? holdings.slice(0, 5).map(holding => {
    const pnl = holding.value == null ? null : holding.value - holding.invested;
    const weight = holding.value == null || summary.value == null ? null : percent(holding.value, summary.value);
    return `<tr><td><b>${holding.name}</b><br><span class="demo">${holding.symbol}</span></td><td>${amount(holding.value)}</td><td class="${pnl == null ? '' : returnClass(pnl)}">${amount(pnl, true)}</td><td class="${pnl == null ? '' : returnClass(pnl)}">${pnl == null ? '—' : `${percent(pnl, holding.invested).toFixed(2)}%`}</td><td>${weight == null ? '—' : `${weight.toFixed(1)}%`}</td><td><span class="tag">${holding.quote?.status || 'UNAVAILABLE'}</span></td></tr>`;
  }).join('') : `<tr><td colspan="6" class="empty-state">Add a transaction in Portfolio to see your live holdings here.</td></tr>`;
  const demo = document.querySelector('.page-title > .demo');
  if (demo) demo.textContent = `Live portfolio · updated ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
}

function renderRiskAndAdvisor(holdings) {
  const summary = totals(holdings);
  const largest = summary.value == null ? 0 : Math.max(0, ...holdings.map(holding => percent(holding.value, summary.value)));
  const risk = Math.min(100, Math.round(35 + largest));
  const riskLabel = risk > 72 ? 'Higher concentration' : risk > 55 ? 'Moderate' : 'Balanced';
  const riskHeader = document.querySelector('.gauge')?.closest('.card')?.querySelector('.sub');
  if (riskHeader) riskHeader.textContent = `${riskLabel} · ${risk} / 100`;
  const advisor = document.querySelector('.advisor .message.bot');
  if (advisor && holdings.length) advisor.innerHTML = `<b>✦ FinPilotX AI portfolio summary</b><br>You currently hold ${holdings.length} asset${holdings.length === 1 ? '' : 's'}${summary.value == null ? ', with some market prices unavailable.' : ` valued at ${compactMoney(summary.value)}`}. ${summary.value == null ? 'Risk concentration will refresh after complete verified price data is available.' : `Your largest position is ${largest.toFixed(1)}% of the portfolio, which suggests <b>${riskLabel.toLowerCase()}</b> concentration.`}<br><br><span class="tag">Live transaction ledger</span> <span class="tag">${riskLabel} risk</span>`;
}

function renderDataControls(holdings, refreshing = false) {
  const header = document.querySelector('.page-title'); if (!header) return;
  let panel = document.querySelector('[data-price-controls]');
  if (!panel) { header.insertAdjacentHTML('afterend', `<section class="price-controls" data-price-controls><div><span class="kicker">Market data</span><div data-price-status></div></div><div class="price-actions"><label class="auto-refresh"><input type="checkbox" data-auto-refresh> Auto refresh</label><select data-refresh-interval aria-label="Refresh interval"><option value="1">1 min</option><option value="5">5 min</option></select><button class="btn secondary" data-refresh-prices>↻ Refresh now</button></div></section>`); panel = document.querySelector('[data-price-controls]'); }
  const quotes = holdings.map(holding => holding.quote).filter(Boolean);
  const unavailable = quotes.filter(quote => quote.status === 'UNAVAILABLE').length;
  const lastKnown = quotes.filter(quote => quote.status === 'LAST KNOWN').length;
  const latest = quotes.map(quote => quote.timestamp).filter(Boolean).sort().at(-1);
  const source = quotes.find(quote => quote.source)?.source || 'Awaiting an asset quote';
  const market = marketDataService.indianMarketOpen() ? 'Market Open' : 'Market Closed';
  panel.querySelector('[data-price-status]').innerHTML = refreshing ? '<span class="quote-status updating">↻ Updating prices…</span>' : `<span class="quote-status ${unavailable ? 'unavailable' : lastKnown ? 'last-known' : 'delayed'}">● ${unavailable ? 'Some prices unavailable' : lastKnown ? 'Showing last known price' : 'Delayed public market data'}</span><span class="sync-copy">${market} · Last updated: ${marketDataService.formatIST(latest)} · ${source}</span>`;
  panel.querySelector('[data-auto-refresh]').checked = localStorage.getItem('fpx-auto-refresh') !== 'false';
  panel.querySelector('[data-refresh-interval]').value = localStorage.getItem('fpx-refresh-interval') || '1';
}

function scheduleRefresh() {
  clearInterval(refreshTimer);
  if (localStorage.getItem('fpx-auto-refresh') === 'false') return;
  const minutes = Number(localStorage.getItem('fpx-refresh-interval') || 1);
  refreshTimer = window.setInterval(() => refreshPortfolioEngine({ force: true }), Math.max(1, minutes) * 60_000);
}

function filteredAssets(query = '') {
  const needle = query.trim().toLowerCase();
  return assets.filter(asset => [asset.symbol, asset.name, asset.isin, asset.type].join(' ').toLowerCase().includes(needle));
}

function transactionModal() {
  if (document.querySelector('.transaction-modal')) return;
  const today = new Date().toISOString().slice(0, 10);
  document.body.insertAdjacentHTML('beforeend', `<div class="transaction-modal" data-transaction-modal><div class="modal-backdrop" data-close-modal></div><section class="transaction-dialog" role="dialog" aria-modal="true" aria-labelledby="transaction-title"><button class="modal-close" aria-label="Close transaction form" data-close-modal>×</button><span class="kicker">Live portfolio ledger</span><h2 id="transaction-title">Add transaction</h2><p class="sub">Transactions are stored privately in this browser and update holdings automatically.</p><form id="transaction-form"><div class="transaction-type"><button type="button" class="active" data-type="BUY">Buy / Purchase</button><button type="button" data-type="SELL">Sell / Redemption</button><button type="button" data-type="DIVIDEND">Dividend</button><button type="button" data-type="BONUS">Bonus</button><button type="button" data-type="SPLIT">Split</button></div><input type="hidden" name="type" value="BUY"><div class="field"><label for="asset-search">Asset search</label><input id="asset-search" name="assetSearch" autocomplete="off" placeholder="Company name, ticker or ISIN" required><div class="asset-results" data-asset-results></div><input type="hidden" name="symbol" required></div><div class="transaction-grid"><div class="field"><label for="transaction-date">Date</label><input id="transaction-date" name="date" type="date" value="${today}" required></div><div class="field"><label for="quantity" data-quantity-label>Quantity / Units</label><input id="quantity" name="quantity" type="number" min="0.0001" step="any" placeholder="0" required></div></div><div class="transaction-grid"><div class="field"><label for="price" data-price-label>Price per share / NAV</label><input id="price" name="price" type="number" min="0" step="any" placeholder="0.00" required></div><div class="field"><label for="charges">Brokerage, taxes & charges</label><input id="charges" name="charges" type="number" min="0" step="any" value="0"></div></div><div class="field"><label for="notes">Notes <span class="sub">(optional)</span></label><textarea id="notes" name="notes" placeholder="Broker, folio number or any relevant note"></textarea></div><div class="modal-actions"><span class="sub" data-modal-status></span><button class="btn primary" type="submit">Add transaction</button></div></form></section></div>`);
  const modal = document.querySelector('[data-transaction-modal]');
  const form = modal.querySelector('form');
  const search = form.assetSearch;
  const results = modal.querySelector('[data-asset-results]');
  const selected = form.symbol;
  const updateAssetResults = () => {
    const matches = filteredAssets(search.value).slice(0, 6);
    results.innerHTML = matches.map(asset => `<button type="button" data-symbol="${asset.symbol}"><b>${asset.name}</b><span>${asset.symbol} · ${asset.type}${asset.isin ? ` · ${asset.isin}` : ''}</span></button>`).join('') || '<span class="sub">No supported asset found.</span>';
  };
  search.addEventListener('input', updateAssetResults);
  results.addEventListener('click', event => {
    const button = event.target.closest('[data-symbol]'); if (!button) return;
    const asset = assets.find(item => item.symbol === button.dataset.symbol);
    selected.value = asset.symbol; search.value = `${asset.name} (${asset.symbol})`; results.innerHTML = '';
    form.price.value = asset.price;
  });
  modal.querySelectorAll('[data-type]').forEach(button => button.addEventListener('click', () => {
    modal.querySelectorAll('[data-type]').forEach(item => item.classList.remove('active'));
    button.classList.add('active'); form.type.value = button.dataset.type;
    const sell = button.dataset.type === 'SELL';
    modal.querySelector('[data-quantity-label]').textContent = sell ? 'Units to sell / redeem' : 'Quantity / Units';
    modal.querySelector('[data-price-label]').textContent = sell ? 'Sell price / redemption NAV' : 'Buy price per share / NAV';
  }));
  modal.querySelectorAll('[data-close-modal]').forEach(button => button.addEventListener('click', () => modal.remove()));
  form.addEventListener('submit', event => {
    event.preventDefault();
    const type = form.type.value;
    if (!['BUY', 'SELL'].includes(type)) { modal.querySelector('[data-modal-status]').textContent = `${type} is listed for your ledger, but BUY and SELL are enabled in this version.`; return; }
    const asset = assets.find(item => item.symbol === selected.value);
    if (!asset) { modal.querySelector('[data-modal-status]').textContent = 'Select a supported asset from the search results.'; return; }
    const tx = { id: id(), type, symbol: asset.symbol, date: form.date.value, quantity: Number(form.quantity.value), price: Number(form.price.value), charges: Number(form.charges.value || 0), notes: form.notes.value.trim() };
    if (!tx.date || tx.quantity <= 0 || tx.price < 0) { modal.querySelector('[data-modal-status]').textContent = 'Complete the date, quantity, and price fields.'; return; }
    const existing = portfolioFrom(readTransactions()).find(holding => holding.symbol === tx.symbol);
    if (type === 'SELL' && (!existing || tx.quantity > existing.quantity)) { modal.querySelector('[data-modal-status]').textContent = `You can sell up to ${(existing?.quantity || 0).toLocaleString('en-IN')} units of ${asset.symbol}.`; return; }
    writeTransactions([...readTransactions(), tx]); modal.remove(); refreshPortfolioEngine(); toast(`${type === 'BUY' ? 'Purchase' : 'Sale'} recorded for ${asset.symbol}`);
  });
  updateAssetResults();
}

async function refreshPortfolioEngine(options = {}) {
  const pending = portfolioFrom(readTransactions());
  renderDataControls(pending, true);
  const holdings = await updatePrices(pending, options);
  renderPortfolio(holdings); renderDashboard(holdings); renderRiskAndAdvisor(holdings); renderDataControls(holdings, false);
}

document.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('click', event => {
    if (event.target.closest('[data-add-transaction]')) transactionModal();
    if (event.target.closest('[data-refresh-prices]')) refreshPortfolioEngine({ force: true });
  });
  document.addEventListener('change', event => {
    if (event.target.matches('[data-auto-refresh]')) { localStorage.setItem('fpx-auto-refresh', String(event.target.checked)); scheduleRefresh(); }
    if (event.target.matches('[data-refresh-interval]')) { localStorage.setItem('fpx-refresh-interval', event.target.value); scheduleRefresh(); }
  });
  refreshPortfolioEngine();
  scheduleRefresh();
});
