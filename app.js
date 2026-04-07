// ============================================================
//  MOHAP MedCheck — App Logic
//  Handles data loading, search, filter, sort, pagination
// ============================================================

const PAGE_SIZE = 40;

let allData = [];
let filteredData = [];
let displayData = [];
let currentPage = 0;
let currentSort = 'name';
let sortAsc = true;
let activeChipFilter = 'all';
let advFilterForm = '';
let advFilterBody = '';
let advFilterCountry = '';
let advFilterPrice = '';
let searchQuery = '';
let cycleIndex = 0;
let advOpen = false;

const HEADERS = ['Trade Name','Price','Pack Size','Strength','Supplier Address','Supplier',
  'Ingredient','Body System','Form','Classification','Therapeutic Group','Manufacturer',
  'Country Of Origin','Dispensing Mode','First Registration Date'];

const HI = {};
HEADERS.forEach((h,i) => HI[h] = i);

// ── INIT ────────────────────────────────────────────────────
window.addEventListener('load', () => {
  const fill = document.getElementById('loaderFill');
  const txt = document.getElementById('loaderText');

  // Decompress the B64 gzip data embedded in data.js
  setTimeout(() => {
    fill.style.width = '20%';
    txt.textContent = 'Decompressing data...';
  }, 100);

  setTimeout(() => {
    try {
      // Decode base64 → Uint8Array → decompress → parse JSON
      const binaryStr = atob(MOHAP_DATA_B64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

      fill.style.width = '55%';
      txt.textContent = 'Parsing product database...';

      // DecompressionStream (available in modern browsers)
      const ds = new DecompressionStream('gzip');
      const writer = ds.writable.getWriter();
      writer.write(bytes);
      writer.close();
      
      const reader = ds.readable.getReader();
      const chunks = [];
      
      function read() {
        reader.read().then(({ done, value }) => {
          if (done) {
            const blob = new Blob(chunks);
            blob.text().then(text => {
              fill.style.width = '80%';
              txt.textContent = 'Building index...';
              const parsed = JSON.parse(text);
              allData = parsed.rows;
              
              fill.style.width = '100%';
              txt.textContent = `Ready! ${allData.length.toLocaleString()} products loaded`;
              
              setTimeout(initApp, 400);
            });
            return;
          }
          chunks.push(value);
          read();
        });
      }
      read();
    } catch(e) {
      console.error(e);
      txt.textContent = 'Error loading data. Please refresh.';
    }
  }, 300);
});

function initApp() {
  document.getElementById('splash').style.opacity = '0';
  document.getElementById('splash').style.transition = 'opacity .4s ease';
  setTimeout(() => {
    document.getElementById('splash').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
  }, 400);

  populateDropdowns();
  applyAll();
  bindEvents();
}

// ── DROPDOWNS ───────────────────────────────────────────────
function populateDropdowns() {
  const forms = [...new Set(allData.map(r => r[HI['Form']]).filter(Boolean))].sort();
  const bodies = [...new Set(allData.map(r => {
    const b = r[HI['Body System']];
    return b ? b.split('-')[0].trim() : '';
  }).filter(Boolean))].sort();
  const countries = [...new Set(allData.map(r => r[HI['Country Of Origin']]).filter(Boolean))].sort();

  fillSelect('filterForm', forms);
  fillSelect('filterBody', bodies);
  fillSelect('filterCountry', countries);
}

function fillSelect(id, options) {
  const sel = document.getElementById(id);
  options.forEach(opt => {
    const el = document.createElement('option');
    el.value = opt; el.textContent = opt;
    sel.appendChild(el);
  });
}

// ── EVENTS ──────────────────────────────────────────────────
function bindEvents() {
  const searchInput = document.getElementById('searchInput');
  const clearBtn = document.getElementById('searchClear');

  let debounceTimer;
  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value.trim().toLowerCase();
    clearBtn.classList.toggle('hidden', searchQuery === '');
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(applyAll, 180);
  });

  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    searchQuery = '';
    clearBtn.classList.add('hidden');
    applyAll();
  });
}

// ── FILTER & SORT ────────────────────────────────────────────
function applyAll() {
  let data = allData;

  // Chip filter
  if (activeChipFilter !== 'all') {
    const [key, val] = activeChipFilter.split(':');
    const colKey = key === 'classification' ? 'Classification' : 'Dispensing Mode';
    const colIdx = HI[colKey];
    data = data.filter(r => r[colIdx] === val);
  }

  // Advanced filters
  if (advFilterForm) data = data.filter(r => r[HI['Form']] === advFilterForm);
  if (advFilterBody) data = data.filter(r => (r[HI['Body System']] || '').startsWith(advFilterBody));
  if (advFilterCountry) data = data.filter(r => r[HI['Country Of Origin']] === advFilterCountry);
  if (advFilterPrice) data = filterByPrice(data, advFilterPrice);

  // Search
  if (searchQuery) {
    const q = searchQuery;
    data = data.filter(r =>
      r[HI['Trade Name']].toLowerCase().includes(q) ||
      r[HI['Ingredient']].toLowerCase().includes(q) ||
      r[HI['Supplier']].toLowerCase().includes(q) ||
      r[HI['Manufacturer']].toLowerCase().includes(q) ||
      r[HI['Body System']].toLowerCase().includes(q)
    );
  }

  // Sort
  data = sortData(data);
  filteredData = data;

  currentPage = 0;
  displayData = filteredData.slice(0, PAGE_SIZE);
  renderGrid();
  updateStats();
}

function filterByPrice(data, range) {
  return data.filter(r => {
    const p = r[HI['Price']];
    if (range === 'exempt') return p && p.toLowerCase().includes('exempt');
    const num = parseFloat(p);
    if (isNaN(num)) return false;
    if (range === '0-50') return num <= 50;
    if (range === '50-200') return num > 50 && num <= 200;
    if (range === '200-500') return num > 200 && num <= 500;
    if (range === '500+') return num > 500;
    return true;
  });
}

function sortData(data) {
  const col = currentSort === 'name' ? HI['Trade Name'] :
              currentSort === 'price' ? HI['Price'] :
              HI['First Registration Date'];
  return [...data].sort((a, b) => {
    let va = a[col] || '', vb = b[col] || '';
    if (currentSort === 'price') {
      const na = parseFloat(va), nb = parseFloat(vb);
      if (!isNaN(na) && !isNaN(nb)) return sortAsc ? na - nb : nb - na;
      if (!isNaN(na)) return sortAsc ? -1 : 1;
      if (!isNaN(nb)) return sortAsc ? 1 : -1;
    }
    if (currentSort === 'date') {
      const da = parseDate(va), db = parseDate(vb);
      return sortAsc ? da - db : db - da;
    }
    return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
  });
}

function parseDate(str) {
  if (!str) return 0;
  const parts = str.split('/');
  if (parts.length === 3) return new Date(parts[2], parts[1]-1, parts[0]).getTime();
  return 0;
}

// ── RENDER GRID ─────────────────────────────────────────────
function renderGrid() {
  const grid = document.getElementById('productGrid');
  const empty = document.getElementById('emptyState');
  const loadWrap = document.getElementById('loadMoreWrap');

  grid.innerHTML = '';

  if (filteredData.length === 0) {
    empty.classList.remove('hidden');
    loadWrap.classList.add('hidden');
    document.getElementById('resultCount').textContent = 'No results';
    return;
  }

  empty.classList.add('hidden');
  displayData.forEach(row => grid.appendChild(createCard(row)));
  
  const showing = Math.min((currentPage + 1) * PAGE_SIZE, filteredData.length);
  document.getElementById('resultCount').textContent = 
    `Showing ${displayData.length.toLocaleString()} of ${filteredData.length.toLocaleString()}`;
  
  loadWrap.classList.toggle('hidden', displayData.length >= filteredData.length);
  document.getElementById('productCount').textContent =
    filteredData.length < allData.length
      ? `${filteredData.length.toLocaleString()} / ${allData.length.toLocaleString()}`
      : `${allData.length.toLocaleString()} products`;
}

function createCard(row) {
  const card = document.createElement('div');
  card.className = `product-card ${getCatClass(row[HI['Classification']])}`;

  const name = row[HI['Trade Name']] || 'Unknown';
  const price = row[HI['Price']] || '–';
  const ingredient = row[HI['Ingredient']] || '';
  const form = row[HI['Form']] || '';
  const dispensing = row[HI['Dispensing Mode']] || '';
  const supplier = row[HI['Supplier']] || '';

  const displayIngredient = ingredient.split('!').map(s => s.trim()).filter(Boolean)[0] || ingredient;
  const isExempt = price.toLowerCase().includes('exempt') || price === 'N/A';
  const priceClass = isExempt ? 'card-price exempt' : 'card-price';
  const priceDisplay = isExempt ? '🏷 Exempt' : price;

  const dispClass = getDispenseChipClass(dispensing);

  card.innerHTML = `
    <div class="card-top">
      <div class="card-title">${escHtml(name)}</div>
      <div class="${priceClass}">${escHtml(priceDisplay)}</div>
    </div>
    ${displayIngredient ? `<div class="card-ingredient"><strong>⚗</strong> ${escHtml(displayIngredient)}</div>` : ''}
    <div class="card-meta">
      ${form ? `<span class="card-chip chip-form">${escHtml(form)}</span>` : ''}
      ${dispensing ? `<span class="card-chip chip-dispense ${dispClass}">${escHtml(shortDispense(dispensing))}</span>` : ''}
    </div>
    ${supplier ? `<div class="card-supplier"><span>${escHtml(supplier)}</span></div>` : ''}
  `;

  card.addEventListener('click', () => openModal(row));
  return card;
}

function getCatClass(cls) {
  if (!cls) return 'cat-other';
  const c = cls.toLowerCase();
  if (c.includes('conventional')) return 'cat-conventional';
  if (c.includes('biological')) return 'cat-biological';
  if (c.includes('device')) return 'cat-device';
  if (c.includes('gsl')) return 'cat-gsl';
  if (c.includes('natural')) return 'cat-natural';
  return 'cat-other';
}

function getDispenseChipClass(d) {
  const dl = (d || '').toLowerCase();
  if (dl.includes('prescription') || dl.includes('pom')) return 'pom';
  if (dl.includes('controlled') || dl.includes('narcotic')) return 'cd';
  if (dl.includes('hospital')) return 'hosp';
  if (dl.includes('general') || dl.includes('gsl')) return 'gsl';
  return '';
}

function shortDispense(d) {
  if (!d) return '';
  if (d.includes('Prescription Only')) return 'POM';
  if (d.includes('CD-Narcotic')) return 'CD-Narcotic';
  if (d.includes('Controlled Drug')) return 'CD';
  if (d.includes('Semi Controlled')) return 'SCD';
  if (d.includes('HOSPITAL USE')) return 'Hospital Only';
  if (d.includes('General Sale Supermarket')) return 'GSL-Super';
  if (d.includes('General sale')) return 'GSL';
  return d.length > 20 ? d.substring(0, 18) + '…' : d;
}

function escHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── STATS ────────────────────────────────────────────────────
function updateStats() {
  const data = filteredData;
  document.getElementById('sTotal').textContent = allData.length.toLocaleString();
  
  const matchEl = document.getElementById('sFiltered');
  matchEl.textContent = data.length < allData.length ? data.length.toLocaleString() : '–';

  // Average price
  const prices = data.map(r => parseFloat(r[HI['Price']])).filter(n => !isNaN(n));
  const avg = prices.length ? (prices.reduce((a,b)=>a+b,0)/prices.length).toFixed(0) : '–';
  document.getElementById('sAvgPrice').textContent = avg === '–' ? '–' : avg;

  updateCycleStat(data);
}

function updateCycleStat(data) {
  const cycles = [
    { label: 'Suppliers', key: HI['Supplier'], icon: '🏢' },
    { label: 'Manufacturers', key: HI['Manufacturer'], icon: '🏭' },
    { label: 'Countries', key: HI['Country Of Origin'], icon: '🌍' },
  ];
  const c = cycles[cycleIndex % cycles.length];
  const count = new Set(data.map(r => r[c.key]).filter(Boolean)).size;
  document.getElementById('cycleIcon').textContent = c.icon;
  document.getElementById('sCycleVal').textContent = count.toLocaleString();
  document.getElementById('sCycleLabel').textContent = c.label;
}

function cycleStat() {
  cycleIndex++;
  updateCycleStat(filteredData);
}

function showPriceStats() {
  const prices = filteredData.map(r => parseFloat(r[HI['Price']])).filter(n => !isNaN(n));
  if (!prices.length) return;
  const min = Math.min(...prices).toFixed(2);
  const max = Math.max(...prices).toFixed(2);
  const avg = (prices.reduce((a,b)=>a+b,0)/prices.length).toFixed(2);
  alert(`Price Stats (${filteredData.length.toLocaleString()} products)\n\nMin: ${min} AED\nAvg: ${avg} AED\nMax: ${max} AED\n\nProducts with price: ${prices.length.toLocaleString()}`);
}

// ── FILTER CONTROLS ──────────────────────────────────────────
function setFilter(val, btn) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  activeChipFilter = val;
  applyAll();
}

function toggleAdvFilters() {
  advOpen = !advOpen;
  document.getElementById('advFilters').classList.toggle('hidden', !advOpen);
  document.getElementById('advToggleIcon').textContent = advOpen ? '▲' : '▼';
}

function applyAdvFilters() {
  advFilterForm = document.getElementById('filterForm').value;
  advFilterBody = document.getElementById('filterBody').value;
  advFilterCountry = document.getElementById('filterCountry').value;
  advFilterPrice = document.getElementById('filterPrice').value;

  const activeCount = [advFilterForm, advFilterBody, advFilterCountry, advFilterPrice].filter(Boolean).length;
  const badge = document.getElementById('advBadge');
  badge.classList.toggle('hidden', activeCount === 0);
  if (activeCount) badge.textContent = `${activeCount} active`;

  applyAll();
}

function clearAdvFilters() {
  ['filterForm','filterBody','filterCountry','filterPrice'].forEach(id => {
    document.getElementById(id).value = '';
  });
  advFilterForm = advFilterBody = advFilterCountry = advFilterPrice = '';
  document.getElementById('advBadge').classList.add('hidden');
  applyAll();
}

function setSort(key, btn) {
  if (currentSort === key) { toggleSortDir(); return; }
  document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  currentSort = key;
  applyAll();
}

function toggleSortDir() {
  sortAsc = !sortAsc;
  document.getElementById('sortDirBtn').textContent = sortAsc ? '↑' : '↓';
  applyAll();
}

function loadMore() {
  currentPage++;
  const start = currentPage * PAGE_SIZE;
  const next = filteredData.slice(start, start + PAGE_SIZE);
  displayData = [...displayData, ...next];
  
  const grid = document.getElementById('productGrid');
  next.forEach(row => grid.appendChild(createCard(row)));
  
  const showing = displayData.length;
  document.getElementById('resultCount').textContent = 
    `Showing ${showing.toLocaleString()} of ${filteredData.length.toLocaleString()}`;
  
  if (displayData.length >= filteredData.length) {
    document.getElementById('loadMoreWrap').classList.add('hidden');
  }
}

function resetAll() {
  document.getElementById('searchInput').value = '';
  searchQuery = '';
  document.getElementById('searchClear').classList.add('hidden');
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.filter-btn[data-filter="all"]').classList.add('active');
  activeChipFilter = 'all';
  clearAdvFilters();
  applyAll();
}

// ── MODAL ────────────────────────────────────────────────────
let currentModalRow = null;

function openModal(row) {
  currentModalRow = row;
  const overlay = document.getElementById('modalOverlay');
  
  // Fill fields
  set('mTitle', row[HI['Trade Name']]);
  set('mClass', row[HI['Classification']]);
  set('mPrice', row[HI['Price']] || '–');
  set('mPack', row[HI['Pack Size']] || '–');
  set('mStrength', row[HI['Strength']] || '–');
  set('mForm', row[HI['Form']] || '–');
  set('mIngredient', formatIngredient(row[HI['Ingredient']]));
  set('mSupplier', row[HI['Supplier']] || '–');
  set('mSupplierAddr', row[HI['Supplier Address']] || '–');
  set('mMfr', row[HI['Manufacturer']] || '–');
  set('mCountry', row[HI['Country Of Origin']] || '–');
  set('mClassification', row[HI['Classification']] || '–');
  set('mBodySystem', row[HI['Body System']] || '–');
  set('mDispensing', row[HI['Dispensing Mode']] || '–');
  set('mTherapeutic', row[HI['Therapeutic Group']] || '–');
  set('mRegDate', row[HI['First Registration Date']] || '–');

  // Tags
  const tags = [row[HI['Form']], row[HI['Body System']]?.split('-')[0]?.trim()].filter(Boolean);
  document.getElementById('mTags').innerHTML = tags.map(t => `<span class="modal-tag">${escHtml(t)}</span>`).join('');

  overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function set(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val || '–';
}

function formatIngredient(str) {
  if (!str) return '–';
  return str.split('!').map(s => s.trim()).filter(Boolean).join('\n');
}

function closeModal(e) {
  if (e.target === document.getElementById('modalOverlay')) closeModalBtn();
}

function closeModalBtn() {
  document.getElementById('modalOverlay').classList.add('hidden');
  document.body.style.overflow = '';
}

function copyDetails() {
  if (!currentModalRow) return;
  const r = currentModalRow;
  const txt = `
MOHAP Registered Product Details
==================================
Trade Name:    ${r[HI['Trade Name']]}
Price:         ${r[HI['Price']]}
Pack Size:     ${r[HI['Pack Size']]}
Strength:      ${r[HI['Strength']]}
Form:          ${r[HI['Form']]}
Ingredient:    ${r[HI['Ingredient']]}
Supplier:      ${r[HI['Supplier']]}
Supplier Addr: ${r[HI['Supplier Address']]}
Manufacturer:  ${r[HI['Manufacturer']]}
Country:       ${r[HI['Country Of Origin']]}
Body System:   ${r[HI['Body System']]}
Classification:${r[HI['Classification']]}
Dispensing:    ${r[HI['Dispensing Mode']]}
Registered:    ${r[HI['First Registration Date']]}
  `.trim();

  navigator.clipboard.writeText(txt).then(() => {
    const btn = document.querySelector('.footer-btn:not(.primary)');
    const orig = btn.textContent;
    btn.textContent = '✅ Copied!';
    setTimeout(() => { btn.textContent = orig; }, 1800);
  });
}

// ── SERVICE WORKER ──────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
