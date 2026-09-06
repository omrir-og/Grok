const usd = (n) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n ?? 0);

const signed = (n) => (n >= 0 ? `+${usd(n)}` : `-${usd(Math.abs(n))}`);
const cls = (n) => (n >= 0 ? 'pos' : 'neg');
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function initial(sym) {
  return esc(String(sym).replace(/[.^].*$/, '').slice(0, 4));
}

function logoColor(sym) {
  let h = 0;
  for (const ch of String(sym)) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h}, 55%, 45%)`;
}

async function loadConfig() {
  const cfg = await fetch('/api/config').then((r) => r.json());
  const badge = document.getElementById('mode-badge');
  badge.textContent = `${cfg.mode} · ${cfg.env}`;
  return cfg;
}

function renderSummary(s) {
  document.getElementById('m-equity').textContent = usd(s.equity);
  document.getElementById('m-cash').textContent = usd(s.availableCash);
  document.getElementById('m-invested').textContent = usd(s.totalInvested);
  const pnl = document.getElementById('m-pnl');
  pnl.textContent = signed(s.profitLoss);
  pnl.className = `metric ${cls(s.profitLoss)}`;
}

function renderPositions(positions) {
  const body = document.getElementById('positions-body');
  document.getElementById('pos-count').textContent = `${positions.length} open`;
  if (!positions.length) {
    body.innerHTML = '<tr><td colspan="6" class="muted center">No open positions</td></tr>';
    return;
  }
  body.innerHTML = positions
    .map((p) => {
      const logo = p.imageUrl
        ? `<img class="inst-logo" src="${esc(p.imageUrl)}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'inst-logo',style:'background:${logoColor(p.symbol)}',textContent:'${initial(p.symbol)}'}))" />`
        : `<div class="inst-logo" style="background:${logoColor(p.symbol)}">${initial(p.symbol)}</div>`;
      const lev = p.leverage > 1 ? `<span class="tag-lev">${p.leverage}×</span>` : '';
      const copy = p.isCopy ? '<span class="tag-copy">COPY</span>' : '';
      const cur = p.currentRate == null ? '—' : usd(p.currentRate);
      return `<tr>
        <td><div class="inst">${logo}<div><div class="inst-name">${esc(p.symbol)}${lev}${copy}</div><div class="inst-sub">${esc(p.displayName)}</div></div></div></td>
        <td><span class="pill ${p.isBuy ? 'buy' : 'sell'}">${p.isBuy ? 'Buy' : 'Sell'}</span></td>
        <td class="num">${usd(p.amount)}</td>
        <td class="num">${usd(p.usdEntryPrice)}</td>
        <td class="num">${cur}</td>
        <td class="num ${cls(p.pnl)}">${signed(p.pnl)}</td>
      </tr>`;
    })
    .join('');
}

function renderCopy(traders) {
  const panel = document.getElementById('copy-panel');
  const list = document.getElementById('copy-list');
  if (!traders.length) {
    panel.classList.add('hidden');
    return;
  }
  panel.classList.remove('hidden');
  list.innerHTML = traders
    .map(
      (t) => `<div class="copy-card">
        <div class="u">@${esc(t.username)}</div>
        <div class="meta">${t.positionCount} copied · <span class="${cls(t.pnl)}">${signed(t.pnl)}</span></div>
      </div>`,
    )
    .join('');
}

async function loadPortfolio() {
  const reconnect = document.getElementById('reconnect');
  const res = await fetch('/api/portfolio');
  if (res.status === 401) {
    reconnect.classList.remove('hidden');
    return;
  }
  reconnect.classList.add('hidden');
  if (!res.ok) {
    document.getElementById('positions-body').innerHTML =
      '<tr><td colspan="6" class="center neg">Failed to load portfolio</td></tr>';
    return;
  }
  const data = await res.json();
  renderSummary(data.summary);
  renderPositions(data.positions);
  renderCopy(data.copyTraders);
  document.getElementById('footer').textContent = `Updated ${new Date(
    data.generatedAt,
  ).toLocaleTimeString()} · ${data.env} environment`;
}

document.getElementById('refresh-btn').addEventListener('click', loadPortfolio);

(async () => {
  await loadConfig();
  await loadPortfolio();
})();
