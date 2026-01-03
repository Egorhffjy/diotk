/*
  Exam Sources Navigator — Mobile/PWA version
  - Loads questions from questions.json (wwwroot)
  - Allows importing a custom questions.json into localStorage
  - Shows web sources + where to find in presentations (file + slide range)
  - If sources list is empty -> shows generated search links
*/

const KEY_CUSTOM_DB = 'esn_custom_db_v1';
const KEY_LAST_Q = 'esn_last_q_v1';
const KEY_DOCS_BASE = 'esn_docs_base_v1';

let db = { questions: [] };
let current = 1;
let deferredInstallPrompt = null;

const el = (id) => document.getElementById(id);

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function encodeQuery(q) {
  return encodeURIComponent(q.trim());
}

function defaultSearchLinks(title) {
  const q = encodeQuery(title);
  return [
    { title: 'Wikipedia (RU): поиск по теме', url: `https://ru.wikipedia.org/w/index.php?search=${q}` },
    { title: 'CyberLeninka: статьи и обзоры', url: `https://cyberleninka.ru/search?q=${q}` },
    { title: 'dic.academic.ru: словари/энциклопедии', url: `https://dic.academic.ru/searchall.php?SWord=${q}` },
    { title: 'docs.cntd.ru: нормативы/ГОСТ (поиск)', url: `https://docs.cntd.ru/search?q=${q}` },
  ];
}


function slideText(p) {
  const f = p.slideFrom;
  const t = p.slideTo;
  if (f == null && t == null) return 'вся презентация/документ';
  if (f != null && t == null) return `слайд ${f} → конец`;
  if (f == null && t != null) return `до слайда ${t}`;
  return `слайды ${f}–${t}`;
}

function normalizeBaseUrl(url) {
  if (!url) return '';
  url = url.trim();
  if (!url) return '';
  // Ensure trailing slash
  if (!url.endsWith('/')) url += '/';
  return url;
}

async function loadDb() {
  // Custom DB overrides default
  const custom = localStorage.getItem(KEY_CUSTOM_DB);
  if (custom) {
    try {
      db = JSON.parse(custom);
      if (!Array.isArray(db.questions)) throw new Error('Неверный формат: поле questions не массив');
      return;
    } catch (e) {
      console.warn('Custom DB invalid, fallback to default', e);
      localStorage.removeItem(KEY_CUSTOM_DB);
    }
  }

  const res = await fetch('questions.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('Не удалось загрузить questions.json');
  db = await res.json();
  if (!Array.isArray(db.questions)) throw new Error('Неверный формат questions.json');
}

function getQuestion(num) {
  return db.questions.find(q => q.number === num);
}

function fillSelect() {
  const select = el('qSelect');
  select.innerHTML = '';

  const sorted = [...db.questions].sort((a,b)=>a.number-b.number);
  for (const q of sorted) {
    const opt = document.createElement('option');
    opt.value = q.number;
    opt.textContent = `${q.number}. ${q.title ?? ('Вопрос ' + q.number)}`;
    select.appendChild(opt);
  }
}

function render(num) {
  num = clamp(num, 1, 67);
  current = num;
  localStorage.setItem(KEY_LAST_Q, String(current));

  const q = getQuestion(num) || { number: num, title: `Вопрос ${num}`, sources: [], presentations: [] };

  el('qNumber').value = String(num);
  el('qSelect').value = String(num);

  el('qTitle').textContent = `${q.number}. ${q.title || ('Вопрос ' + q.number)}`;

  const hasSources = Array.isArray(q.sources) && q.sources.length > 0;
  const sources = hasSources ? q.sources : defaultSearchLinks(q.title || `Вопрос ${q.number}`);

  const sourcesBox = el('sources');
  sourcesBox.innerHTML = '';
  for (const s of sources) {
    const a = document.createElement('a');
    a.className = 'item';
    a.href = s.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';

    const left = document.createElement('div');
    left.className = 'item__main';
    left.textContent = s.title;

    const right = document.createElement('div');
    right.className = 'item__meta';
    right.textContent = new URL(s.url).hostname;

    a.appendChild(left);
    a.appendChild(right);
    sourcesBox.appendChild(a);
  }

  const docsBase = normalizeBaseUrl(el('docsBaseUrl').value);

  const pBox = el('presentations');
  pBox.innerHTML = '';
  const pres = Array.isArray(q.presentations) ? q.presentations : [];

  if (pres.length === 0) {
    const div = document.createElement('div');
    div.className = 'empty';
    div.textContent = 'Ответа в презентациях нет (или не заполнено в базе).';
    pBox.appendChild(div);
  } else {
    for (const p of pres) {
      const row = document.createElement('div');
      row.className = 'item item--block';

      const title = document.createElement('div');
      title.className = 'item__main';

      const fileName = p.fileName || '—';
      if (docsBase) {
        const a = document.createElement('a');
        a.href = docsBase + encodeURIComponent(fileName);
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = fileName;
        a.className = 'file-link';
        title.appendChild(a);
      } else {
        title.textContent = fileName;
      }

      const meta = document.createElement('div');
      meta.className = 'item__meta';
      meta.textContent = slideText(p);

      const note = document.createElement('div');
      note.className = 'note';
      note.textContent = p.note || '';

      row.appendChild(title);
      row.appendChild(meta);
      if (p.note) row.appendChild(note);

      // copy button
      const copyBtn = document.createElement('button');
      copyBtn.className = 'btn btn-ghost btn-copy';
      copyBtn.textContent = 'Копировать';
      copyBtn.addEventListener('click', async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const text = `${fileName} — ${slideText(p)}${p.note ? ' — ' + p.note : ''}`;
        try {
          await navigator.clipboard.writeText(text);
          copyBtn.textContent = 'Скопировано';
          setTimeout(() => (copyBtn.textContent = 'Копировать'), 900);
        } catch {
          alert('Не удалось скопировать (разреши доступ к буферу обмена)');
        }
      });
      row.appendChild(copyBtn);

      pBox.appendChild(row);
    }
  }

  // Meta line
  const pptCount = pres.length;
  const sourcesCount = hasSources ? q.sources.length : 0;
  el('qMeta').textContent = `Источников в базе: ${sourcesCount} • Презентаций в базе: ${pptCount}`;
}

function wireEvents() {
  el('btnGo').addEventListener('click', () => {
    const n = parseInt(el('qNumber').value || '1', 10);
    render(n);
  });

  el('qSelect').addEventListener('change', () => {
    const n = parseInt(el('qSelect').value, 10);
    render(n);
  });

  el('btnPrev').addEventListener('click', () => render(current - 1));
  el('btnNext').addEventListener('click', () => render(current + 1));

  el('qNumber').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const n = parseInt(el('qNumber').value || '1', 10);
      render(n);
    }
  });

  el('docsBaseUrl').addEventListener('change', () => {
    const val = normalizeBaseUrl(el('docsBaseUrl').value);
    el('docsBaseUrl').value = val;
    localStorage.setItem(KEY_DOCS_BASE, val);
    render(current);
  });

  el('dbFile').addEventListener('change', async () => {
    const file = el('dbFile').files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const obj = JSON.parse(text);
      if (!obj || !Array.isArray(obj.questions)) throw new Error('Поле questions отсутствует или не массив');
      // minimal validation
      const nums = new Set(obj.questions.map(q => q.number));
      if (!nums.has(1) || !nums.has(67)) {
        // not fatal, but warn
        if (!confirm('В JSON не найден полный диапазон 1..67. Всё равно импортировать?')) {
          el('dbFile').value = '';
          return;
        }
      }
      localStorage.setItem(KEY_CUSTOM_DB, JSON.stringify(obj));
      await loadDb();
      fillSelect();
      render(current);
      alert('База импортирована.');
    } catch (e) {
      alert('Ошибка импорта JSON: ' + (e?.message || e));
    } finally {
      el('dbFile').value = '';
    }
  });

  el('btnResetDb').addEventListener('click', async () => {
    if (!confirm('Сбросить базу и вернуться к встроенной questions.json?')) return;
    localStorage.removeItem(KEY_CUSTOM_DB);
    await loadDb();
    fillSelect();
    render(current);
  });
}

async function initPwa() {
  // Service worker
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('sw.js');
    } catch (e) {
      console.warn('SW registration failed', e);
    }
  }

  // Install prompt
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    const btn = el('btnInstall');
    btn.hidden = false;
    btn.addEventListener('click', async () => {
      btn.hidden = true;
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
    }, { once: true });
  });
}

async function main() {
  // Restore settings
  const base = localStorage.getItem(KEY_DOCS_BASE);
  const initBase = (base && base.trim()) ? base : 'docs/';
  el('docsBaseUrl').value = initBase;
  localStorage.setItem(KEY_DOCS_BASE, initBase);

  await loadDb();
  fillSelect();
  wireEvents();
  await initPwa();

  const last = parseInt(localStorage.getItem(KEY_LAST_Q) || '1', 10);
  render(clamp(last, 1, 67));
}

main().catch(err => {
  console.error(err);
  alert('Ошибка запуска: ' + (err?.message || err));
});
