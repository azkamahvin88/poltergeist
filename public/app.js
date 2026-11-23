/**
 * app.js — Poltergeist frontend.
 * Vanilla JS, no framework, no build step.
 * Implements all interactions wired to the IDs in index.html.
 */

// ============================================================
// Constants + configuration
// ============================================================

const GHOST_META = {
  'lingering-dead': { emoji: '💀', label: 'The Lingering Dead',  color: '#9b7cdb' },
  'poltergeist':    { emoji: '🔁', label: 'The Poltergeist',     color: '#db7c9b' },
  'maze-keeper':    { emoji: '🌀', label: 'The Maze Keeper',     color: '#7cdb9b' },
  'ouroboros':      { emoji: '🐍', label: 'The Ouroboros',       color: '#db9b7c' },
  'forgotten':      { emoji: '📝', label: 'The Forgotten',       color: '#7cbbdb' },
  'behemoth':       { emoji: '🐉', label: 'The Behemoth',        color: '#db7c7c' },
};

const SEANCE_CHIPS = [
  'Which file is the most haunted?',
  'What is the overall score?',
  'Where is analyzeFiles defined?',
  'What depends on analyzer.ts?',
  'List all forgotten ghosts',
  'Ghosts in src/analyzer',
];

const ALLOWED_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

const MAX_GHOSTS_PER_FILE = 8;

// ============================================================
// App state
// ============================================================

/** @type {{ result: import('../src/analyzer/types.js').AnalysisResult | null, selectedFile: string | null, selectedGhostId: string | null, selectedModule: string | null }} */
const state = {
  result: null,
  selectedFile: null,
  selectedGhostId: null,
  selectedModule: null,
};

// ============================================================
// Element references (resolved once on DOMContentLoaded)
// ============================================================

let el = {};

function resolveElements() {
  el = {
    urlInput:        byId('url-input'),
    urlBtn:          byId('url-btn'),
    folderInput:     byId('folder-input'),
    folderLabelText: byId('folder-label-text'),
    folderBtn:       byId('folder-btn'),
    demoBtn:         byId('demo-btn'),
    loadingState:    byId('loading-state'),
    loadingText:     byId('loading-text'),
    errorState:      byId('error-state'),
    errorText:       byId('error-text'),
    statsSection:    byId('stats-section'),
    scoreNumber:     byId('score-number'),
    scoreSeverity:   byId('score-severity-label'),
    scoreTrack:      byId('score-track'),
    scoreFill:       byId('score-fill'),
    statFiles:       byId('stat-files'),
    statGhosts:      byId('stat-ghosts'),
    statModules:     byId('stat-modules'),
    statCycles:      byId('stat-cycles'),
    ghostBreakdown:  byId('ghost-type-breakdown'),
    modulesSection:  byId('modules-section'),
    moduleList:      byId('module-list'),
    floorplanEmpty:  byId('floorplan-empty'),
    floorplan:       byId('floorplan'),
    detailContent:   byId('detail-content'),
    seanceChips:     byId('seance-chips'),
    seanceInput:     byId('seance-input'),
    seanceBtn:       byId('seance-btn'),
    seanceAnswer:    byId('seance-answer'),
  };
}

function byId(id) {
  const elem = document.getElementById(id);
  if (!elem) console.warn(`[poltergeist] missing element #${id}`);
  return elem;
}

// ============================================================
// Utilities
// ============================================================

function scoreColor(score) {
  if (score <= 20) return 'var(--score-calm)';
  if (score <= 50) return 'var(--score-eerie)';
  if (score <= 75) return 'var(--score-haunted)';
  return 'var(--score-cursed)';
}

function scoreSeverity(score) {
  if (score <= 20) return 'calm';
  if (score <= 50) return 'eerie';
  if (score <= 75) return 'haunted';
  return 'cursed';
}

function scoreSeverityLabel(score) {
  return { calm: 'Calm', eerie: 'Eerie', haunted: 'Haunted', cursed: 'CURSED' }[scoreSeverity(score)];
}

function ext(path) {
  const m = path.match(/(\.[^./]+)$/);
  return m ? m[1].toLowerCase() : '';
}

function basename(path) {
  return path.split('/').pop() ?? path;
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function svgEl(tag, attrs = {}, text = '') {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (text) el.textContent = text;
  return el;
}

// ============================================================
// Loading / error state helpers
// ============================================================

function setLoading(msg = 'Summoning spirits…') {
  el.loadingText.textContent = msg;
  el.loadingState.classList.add('visible');
  el.errorState.classList.remove('visible');
  setInputsDisabled(true);
}

function clearLoading() {
  el.loadingState.classList.remove('visible');
  setInputsDisabled(false);
}

function showError(msg) {
  el.errorText.textContent = msg;
  el.errorState.classList.add('visible');
  el.loadingState.classList.remove('visible');
  setInputsDisabled(false);
}

function clearError() {
  el.errorState.classList.remove('visible');
}

function setInputsDisabled(disabled) {
  el.urlBtn.disabled = disabled;
  el.demoBtn.disabled = disabled;
  el.folderInput.disabled = disabled;
  // folderBtn stays in its own enabled state (controlled by selection)
  if (!disabled) {
    el.folderBtn.disabled = (el.folderInput.files?.length ?? 0) === 0;
  } else {
    el.folderBtn.disabled = true;
  }
}

// ============================================================
// API calls
// ============================================================

async function apiAnalyzeUrl(repoUrl) {
  const resp = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: repoUrl }),
  });
  return handleApiResponse(resp);
}

async function apiAnalyzeFiles(files) {
  const resp = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ files }),
  });
  return handleApiResponse(resp);
}

async function apiDemo() {
  const resp = await fetch('/api/demo');
  return handleApiResponse(resp);
}

async function apiSeance(question, analysis) {
  const resp = await fetch('/api/seance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, analysis }),
  });
  return handleApiResponse(resp);
}

async function handleApiResponse(resp) {
  const body = await resp.json().catch(() => ({ error: 'invalid_json' }));
  if (!resp.ok) {
    const msg = body.message ?? body.error ?? `HTTP ${resp.status}`;
    throw new Error(msg);
  }
  return body;
}

// ============================================================
// Read folder files
// ============================================================

function readFilesFromInput(fileList) {
  const promises = [];
  for (const file of fileList) {
    const fileExt = ext(file.name);
    if (!ALLOWED_EXTS.has(fileExt)) continue;
    promises.push(
      file.text().then((content) => ({
        path: (file.webkitRelativePath || file.name).replace(/^[^/]+\//, ''),
        content,
      }))
    );
  }
  return Promise.all(promises);
}

// ============================================================
// Analysis result → UI
// ============================================================

function applyResult(result) {
  state.result = result;
  state.selectedFile = null;
  state.selectedGhostId = null;
  state.selectedModule = null;

  renderMeter(result);
  renderStats(result);
  renderModuleList(result);
  renderFloorPlan(result);
  renderDetailEmpty();
  enableSeance();
}

// ============================================================
// Meter + stats
// ============================================================

function renderMeter(result) {
  const score = result.overallScore ?? 0;
  const sev = scoreSeverity(score);

  el.scoreNumber.textContent = score;
  el.scoreSeverity.textContent = scoreSeverityLabel(score);
  el.scoreSeverity.className = `score-label ${sev}`;

  el.scoreTrack.setAttribute('aria-valuenow', score);
  el.scoreFill.style.width = `${score}%`;
  el.scoreFill.style.background = scoreColor(score);

  el.statsSection.hidden = false;
}

function renderStats(result) {
  el.statFiles.textContent = result.files.length;
  el.statGhosts.textContent = result.totalGhosts;
  el.statModules.textContent = result.modules.length;
  el.statCycles.textContent = result.cycles.length;

  // Ghost type breakdown
  const counts = {};
  for (const g of result.ghosts) counts[g.type] = (counts[g.type] ?? 0) + 1;

  el.ghostBreakdown.innerHTML = '';
  for (const [type, meta] of Object.entries(GHOST_META)) {
    const count = counts[type] ?? 0;
    if (count === 0) continue;
    const row = document.createElement('div');
    row.className = 'ghost-type-row';
    row.innerHTML = `
      <div class="ghost-dot" style="background:${meta.color}" aria-hidden="true"></div>
      <span class="ghost-type-name">${meta.emoji} ${meta.label}</span>
      <span class="ghost-type-count">${count}</span>
    `;
    el.ghostBreakdown.appendChild(row);
  }
}

function renderModuleList(result) {
  el.moduleList.innerHTML = '';
  el.modulesSection.hidden = false;

  for (const mod of result.modules) {
    const item = document.createElement('div');
    item.className = 'module-item';
    item.setAttribute('role', 'listitem');
    item.dataset.module = mod.name;

    const color = scoreColor(mod.hauntingScore);
    item.innerHTML = `
      <span class="module-score-badge" style="color:${color};border:1px solid ${color}">${mod.hauntingScore}</span>
      <span class="module-name">${escHtml(mod.name)}</span>
      <span class="module-ghost-count">${mod.ghostCount} 👻</span>
    `;
    item.addEventListener('click', () => selectModule(mod.name));
    el.moduleList.appendChild(item);
  }
}

// ============================================================
// Floor plan — SVG rendering
// ============================================================

/**
 * Deterministic grid layout: modules arranged as rows of rooms.
 * Each room's width is proportional to its LOC share of the total.
 * Files within a room are packed as a simple row of rects.
 */
function renderFloorPlan(result) {
  const svg = el.floorplan;
  svg.innerHTML = '';

  if (!result.files.length) return;

  const totalLoc = result.files.reduce((s, f) => s + (f.metrics.loc || 1), 0);
  const W = 900;
  const ROOM_H = 180;
  const PADDING = 10;
  const HEADER_H = 28;
  const FILE_MARGIN = 4;
  const cols = 3;

  const mods = result.modules.slice();
  const rows = Math.ceil(mods.length / cols);
  const svgH = rows * (ROOM_H + PADDING * 2) + PADDING;

  svg.setAttribute('viewBox', `0 0 ${W} ${svgH}`);
  svg.setAttribute('width', W);
  svg.setAttribute('height', svgH);
  svg.style.display = 'block';

  // Build a quick lookup: file path → FileReport
  const fileMap = new Map(result.files.map((f) => [f.path, f]));
  // Build ghost lookup: file path → Ghost[]
  const ghostMap = new Map();
  for (const g of result.ghosts) {
    if (!ghostMap.has(g.file)) ghostMap.set(g.file, []);
    ghostMap.get(g.file).push(g);
  }

  mods.forEach((mod, modIdx) => {
    const col = modIdx % cols;
    const row = Math.floor(modIdx / cols);
    const colW = (W - PADDING * (cols + 1)) / cols;
    const rx = PADDING + col * (colW + PADDING);
    const ry = PADDING + row * (ROOM_H + PADDING * 2);

    // Room background rect
    const roomColor = scoreColor(mod.hauntingScore);
    const roomRect = svgEl('rect', {
      x: rx, y: ry, width: colW, height: ROOM_H,
      fill: `color-mix(in srgb, ${roomColor} 12%, #1a1728)`,
      rx: 8,
      class: 'room-rect',
      'data-module': mod.name,
      tabindex: 0,
      'aria-label': `Module ${mod.name}, haunting score ${mod.hauntingScore}`,
    });
    roomRect.addEventListener('click', () => selectModule(mod.name));
    roomRect.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') selectModule(mod.name); });
    svg.appendChild(roomRect);

    // Room label
    svg.appendChild(svgEl('text', {
      x: rx + 8, y: ry + 18,
      fill: roomColor,
      'font-size': 11,
      'font-weight': 700,
      'font-family': 'monospace',
      class: 'room-label',
    }, `${mod.name}  ${mod.hauntingScore}/100`));

    // Files inside room
    const modFiles = mod.files.map((fp) => fileMap.get(fp)).filter(Boolean);
    if (!modFiles.length) return;

    const fileAreaY = ry + HEADER_H + FILE_MARGIN;
    const fileAreaH = ROOM_H - HEADER_H - FILE_MARGIN * 2;
    const totalModLoc = modFiles.reduce((s, f) => s + (f.metrics.loc || 1), 0);
    const fileAreaW = colW - FILE_MARGIN * 2;
    let fx = rx + FILE_MARGIN;

    modFiles.forEach((fileReport) => {
      const frac = (fileReport.metrics.loc || 1) / totalModLoc;
      const fw = Math.max(20, frac * fileAreaW - 2);
      const fh = fileAreaH;

      const fColor = scoreColor(fileReport.hauntingScore);
      const fileRect = svgEl('rect', {
        x: fx, y: fileAreaY, width: fw, height: fh,
        fill: `color-mix(in srgb, ${fColor} 20%, #12101c)`,
        stroke: `color-mix(in srgb, ${fColor} 50%, #3a3356)`,
        'stroke-width': 1,
        rx: 3,
        class: 'file-rect',
        'data-file': fileReport.path,
        tabindex: 0,
        'aria-label': `${basename(fileReport.path)}, score ${fileReport.hauntingScore}`,
      });
      fileRect.addEventListener('click', (e) => { e.stopPropagation(); selectFile(fileReport.path); });
      fileRect.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); selectFile(fileReport.path); }
      });
      svg.appendChild(fileRect);

      // File name label (only if wide enough)
      if (fw > 30) {
        svg.appendChild(svgEl('text', {
          x: fx + 3, y: fileAreaY + 12,
          fill: 'var(--text-secondary)',
          'font-size': 7,
          'font-family': 'monospace',
          class: 'file-label',
          'clip-path': `inset(0 0 0 0)`,
        }, basename(fileReport.path)));
      }

      // Ghost markers
      const ghosts = ghostMap.get(fileReport.path) ?? [];
      const shown = ghosts.slice(0, MAX_GHOSTS_PER_FILE);
      const extra = ghosts.length - shown.length;
      const markerSize = 11;
      const markersPerRow = Math.max(1, Math.floor(fw / (markerSize + 2)));

      shown.forEach((ghost, gi) => {
        const gr = Math.floor(gi / markersPerRow);
        const gc = gi % markersPerRow;
        const gx = fx + gc * (markerSize + 2) + 2;
        const gy = fileAreaY + fh - markerSize * (gr + 1) - 2;
        const meta = GHOST_META[ghost.type] ?? { emoji: '👻', color: '#ccc' };

        const gGroup = svgEl('g', {
          class: 'ghost-marker',
          'data-ghost-id': ghost.id,
          'data-file': fileReport.path,
          tabindex: 0,
          'aria-label': `${meta.label} at line ${ghost.line}`,
        });
        gGroup.appendChild(svgEl('text', {
          x: gx, y: gy + markerSize,
          'font-size': markerSize,
          fill: meta.color,
        }, meta.emoji));
        gGroup.addEventListener('click', (e) => {
          e.stopPropagation();
          selectGhost(ghost.id, fileReport.path);
        });
        gGroup.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); selectGhost(ghost.id, fileReport.path); }
        });
        svg.appendChild(gGroup);
      });

      if (extra > 0) {
        svg.appendChild(svgEl('text', {
          x: fx + 2,
          y: fileAreaY + fh - 2,
          'font-size': 7,
          fill: 'var(--text-muted)',
        }, `+${extra}`));
      }

      fx += fw + 2;
    });
  });

  el.floorplanEmpty.style.display = 'none';
}

// ============================================================
// Selection helpers
// ============================================================

function clearSvgSelection() {
  el.floorplan.querySelectorAll('.selected').forEach((n) => n.classList.remove('selected'));
}

function selectModule(name) {
  if (!state.result) return;
  state.selectedModule = name;
  state.selectedFile = null;
  state.selectedGhostId = null;

  clearSvgSelection();
  el.floorplan.querySelectorAll(`[data-module="${CSS.escape(name)}"]`).forEach((n) => n.classList.add('selected'));
  el.moduleList.querySelectorAll('.module-item').forEach((n) => {
    n.classList.toggle('selected', n.dataset.module === name);
  });

  const mod = state.result.modules.find((m) => m.name === name);
  if (mod) renderDetailModule(mod);
}

function selectFile(path) {
  if (!state.result) return;
  state.selectedFile = path;
  state.selectedGhostId = null;

  clearSvgSelection();
  el.floorplan.querySelectorAll(`[data-file="${CSS.escape(path)}"]`).forEach((n) => n.classList.add('selected'));

  const fileReport = state.result.files.find((f) => f.path === path);
  if (fileReport) renderDetailFile(fileReport);
}

function selectGhost(ghostId, filePath) {
  if (!state.result) return;
  state.selectedGhostId = ghostId;
  state.selectedFile = filePath;

  clearSvgSelection();
  el.floorplan.querySelectorAll(`[data-file="${CSS.escape(filePath)}"]`).forEach((n) => n.classList.add('selected'));
  el.floorplan.querySelectorAll(`[data-ghost-id="${CSS.escape(ghostId)}"]`).forEach((n) => n.classList.add('selected'));

  const ghost = state.result.ghosts.find((g) => g.id === ghostId);
  if (ghost) renderDetailGhost(ghost);
}

// Scroll the floor plan to bring a file rect into view
function scrollToFile(filePath) {
  const fileRect = el.floorplan.querySelector(`rect[data-file="${CSS.escape(filePath)}"]`);
  if (!fileRect) return;
  const x = parseFloat(fileRect.getAttribute('x'));
  const y = parseFloat(fileRect.getAttribute('y'));
  const wrap = document.getElementById('floorplan-wrap');
  if (wrap) {
    wrap.scrollTo({ left: Math.max(0, x - 60), top: Math.max(0, y - 60), behavior: 'smooth' });
  }
  selectFile(filePath);
}

// ============================================================
// Detail panel renderers
// ============================================================

function renderDetailEmpty() {
  el.detailContent.className = 'detail-empty';
  el.detailContent.innerHTML = 'Click a room, file, or ghost in the floor plan to inspect it.';
}

function renderDetailGhost(ghost) {
  const meta = GHOST_META[ghost.type] ?? { emoji: '👻', label: ghost.type, color: '#ccc' };
  el.detailContent.className = '';
  el.detailContent.innerHTML = `
    <div class="detail-title">
      <span style="font-size:1.3rem" aria-hidden="true">${meta.emoji}</span>
      <span style="color:${meta.color}">${escHtml(meta.label)}</span>
    </div>
    <div class="detail-subtitle">${escHtml(ghost.file)}${ghost.line ? `:${ghost.line}` : ''}</div>

    <div class="detail-section">
      <div class="detail-section-label">Description</div>
      <div class="detail-section-body">${escHtml(ghost.description)}</div>
    </div>

    <div class="exorcism-box">
      <div class="exorcism-title">🧹 Exorcism Report</div>
      <div class="detail-section-label" style="margin-top:0.4rem">Why it haunts</div>
      <div class="detail-section-body">${escHtml(ghost.exorcism?.explanation ?? '—')}</div>
      <div class="detail-section-label" style="margin-top:0.5rem">Fix suggestion</div>
      <div class="detail-section-body">${escHtml(ghost.exorcism?.fixSuggestion ?? '—')}</div>
      <div>
        <span class="score-reduction">
          −${ghost.exorcism?.estimatedScoreReduction ?? 0} pts if resolved
        </span>
      </div>
    </div>
  `;
}

function renderDetailFile(fileReport) {
  const m = fileReport.metrics;
  el.detailContent.className = '';

  const ghostsHtml = fileReport.ghosts.length
    ? `<div class="ghost-list" id="detail-ghost-list">
        ${fileReport.ghosts.map((g) => {
          const meta = GHOST_META[g.type] ?? { emoji: '👻', label: g.type };
          return `<div class="ghost-item" data-ghost-id="${escHtml(g.id)}" data-file="${escHtml(g.file)}" tabindex="0" role="button" aria-label="${escHtml(meta.label)}">
            <span class="ghost-emoji">${meta.emoji}</span>
            <span class="ghost-name">${escHtml(meta.label)}</span>
            <span class="ghost-line">:${g.line}</span>
          </div>`;
        }).join('')}
      </div>`
    : '<div class="detail-section-body" style="color:var(--score-calm)">✨ No ghosts detected</div>';

  el.detailContent.innerHTML = `
    <div class="detail-title">
      <span style="font-size:1rem" aria-hidden="true">📄</span>
      <span>${escHtml(basename(fileReport.path))}</span>
      <span class="score-label ${scoreSeverity(fileReport.hauntingScore)}" style="font-size:0.75rem">${fileReport.hauntingScore}/100</span>
    </div>
    <div class="detail-subtitle">${escHtml(fileReport.path)}</div>

    <div class="detail-metric-grid">
      <div class="detail-metric"><div class="detail-metric-val">${m.loc}</div><div class="detail-metric-key">Lines</div></div>
      <div class="detail-metric"><div class="detail-metric-val">${m.functions.length}</div><div class="detail-metric-key">Functions</div></div>
      <div class="detail-metric"><div class="detail-metric-val">${m.maxNestingDepth}</div><div class="detail-metric-key">Max Depth</div></div>
      <div class="detail-metric"><div class="detail-metric-val">${m.cyclomaticComplexity}</div><div class="detail-metric-key">Complexity</div></div>
      <div class="detail-metric"><div class="detail-metric-val">${m.todos.length}</div><div class="detail-metric-key">TODOs</div></div>
      <div class="detail-metric"><div class="detail-metric-val">${m.deadExports.length}</div><div class="detail-metric-key">Dead Exports</div></div>
    </div>

    <div class="detail-section" style="margin-top:0.75rem">
      <div class="detail-section-label">Ghosts (${fileReport.ghosts.length})</div>
      ${ghostsHtml}
    </div>
  `;

  // Wire ghost-item clicks
  el.detailContent.querySelectorAll('.ghost-item').forEach((item) => {
    const handler = () => selectGhost(item.dataset.ghostId, item.dataset.file);
    item.addEventListener('click', handler);
    item.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') handler(); });
  });
}

function renderDetailModule(mod) {
  el.detailContent.className = '';
  const color = scoreColor(mod.hauntingScore);
  const topGhostHtml = mod.topGhosts.length
    ? mod.topGhosts.map((t) => {
        const meta = GHOST_META[t] ?? { emoji: '👻', label: t };
        return `<span class="chip" style="cursor:default">${meta.emoji} ${meta.label}</span>`;
      }).join('')
    : '<span style="color:var(--score-calm)">None — module is clean ✨</span>';

  el.detailContent.innerHTML = `
    <div class="detail-title">
      <span style="font-size:1rem" aria-hidden="true">🏚</span>
      <span>${escHtml(mod.name)}</span>
      <span class="score-label ${scoreSeverity(mod.hauntingScore)}">${mod.hauntingScore}/100</span>
    </div>
    <div class="detail-section">
      <div class="detail-metric-grid">
        <div class="detail-metric"><div class="detail-metric-val">${mod.files.length}</div><div class="detail-metric-key">Files</div></div>
        <div class="detail-metric"><div class="detail-metric-val">${mod.ghostCount}</div><div class="detail-metric-key">Ghosts</div></div>
      </div>
    </div>
    <div class="detail-section">
      <div class="detail-section-label">Top haunting types</div>
      <div class="seance-chips" style="margin-top:0.3rem">${topGhostHtml}</div>
    </div>
    <div class="detail-section">
      <div class="detail-section-label">Files</div>
      <div class="ghost-list">
        ${mod.files.map((fp) => {
          const fr = state.result.files.find((f) => f.path === fp);
          const score = fr ? fr.hauntingScore : 0;
          const fcolor = scoreColor(score);
          return `<div class="ghost-item" data-file="${escHtml(fp)}" tabindex="0" role="button" aria-label="${escHtml(basename(fp))} score ${score}">
            <span class="ghost-emoji">📄</span>
            <span class="ghost-name" style="font-family:monospace;font-size:0.78rem">${escHtml(basename(fp))}</span>
            <span class="ghost-line" style="color:${fcolor}">${score}</span>
          </div>`;
        }).join('')}
      </div>
    </div>
  `;

  // Wire file-item clicks
  el.detailContent.querySelectorAll('.ghost-item[data-file]').forEach((item) => {
    const handler = () => selectFile(item.dataset.file);
    item.addEventListener('click', handler);
    item.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') handler(); });
  });
}

// ============================================================
// Séance
// ============================================================

function enableSeance() {
  el.seanceInput.disabled = false;
  el.seanceBtn.disabled = false;
  el.seanceAnswer.textContent = 'Ask the spirits a question about the codebase…';
  el.seanceAnswer.className = 'seance-answer empty';
}

function renderSeanceChips() {
  el.seanceChips.innerHTML = '';
  for (const q of SEANCE_CHIPS) {
    const chip = document.createElement('button');
    chip.className = 'chip';
    chip.type = 'button';
    chip.textContent = q;
    chip.addEventListener('click', () => {
      el.seanceInput.value = q;
      submitSeance();
    });
    el.seanceChips.appendChild(chip);
  }
}

async function submitSeance() {
  const question = el.seanceInput.value.trim();
  if (!question) return;
  if (!state.result) {
    el.seanceAnswer.textContent = 'No analysis loaded yet. Summon a codebase first.';
    el.seanceAnswer.className = 'seance-answer empty';
    return;
  }

  el.seanceBtn.disabled = true;
  el.seanceAnswer.textContent = 'Consulting the spirits…';
  el.seanceAnswer.className = 'seance-answer empty';

  try {
    const resp = await apiSeance(question, state.result);
    renderSeanceAnswer(resp);
  } catch (err) {
    el.seanceAnswer.textContent = `Séance failed: ${err.message}`;
    el.seanceAnswer.className = 'seance-answer empty';
  } finally {
    el.seanceBtn.disabled = false;
  }
}

function renderSeanceAnswer(resp) {
  el.seanceAnswer.className = 'seance-answer';
  el.seanceAnswer.innerHTML = '';

  // Answer text
  const answerP = document.createElement('p');
  answerP.style.marginBottom = '0.5rem';
  answerP.textContent = resp.answer;
  el.seanceAnswer.appendChild(answerP);

  // Citations
  if (resp.citations && resp.citations.length > 0) {
    const citDiv = document.createElement('div');
    citDiv.style.marginTop = '0.4rem';
    for (const cit of resp.citations) {
      const link = document.createElement('span');
      link.className = 'citation-link';
      link.setAttribute('role', 'button');
      link.setAttribute('tabindex', '0');
      link.textContent = `${cit.file}:${cit.line}`;
      link.title = cit.snippet || '';
      link.addEventListener('click', () => scrollToFile(cit.file));
      link.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') scrollToFile(cit.file); });
      citDiv.appendChild(link);
    }
    el.seanceAnswer.appendChild(citDiv);
  }
}

// ============================================================
// Input event handlers
// ============================================================

function bindInputs() {
  // URL submit
  el.urlBtn.addEventListener('click', async () => {
    const url = el.urlInput.value.trim();
    if (!url) { showError('Please enter a GitHub repository URL.'); return; }
    if (!url.startsWith('https://github.com/')) {
      showError('URL must start with https://github.com/');
      return;
    }
    clearError();
    setLoading('Fetching repository tarball…');
    try {
      const result = await apiAnalyzeUrl(url);
      clearLoading();
      applyResult(result);
    } catch (err) {
      clearLoading();
      showError(`Analysis failed: ${err.message}`);
    }
  });

  el.urlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') el.urlBtn.click(); });

  // Folder upload — enable button when files are selected
  el.folderInput.addEventListener('change', () => {
    const count = el.folderInput.files?.length ?? 0;
    el.folderBtn.disabled = count === 0;
    if (count > 0) {
      el.folderLabelText.textContent = `${count} file(s) selected`;
    } else {
      el.folderLabelText.textContent = 'Upload a local folder';
    }
  });

  el.folderBtn.addEventListener('click', async () => {
    const fileList = el.folderInput.files;
    if (!fileList || fileList.length === 0) return;
    clearError();
    setLoading(`Reading ${fileList.length} files…`);
    try {
      const files = await readFilesFromInput(fileList);
      if (files.length === 0) {
        clearLoading();
        showError('No supported source files found (.ts, .tsx, .js, .jsx, .mjs, .cjs).');
        return;
      }
      setLoading(`Analysing ${files.length} files…`);
      const result = await apiAnalyzeFiles(files);
      clearLoading();
      applyResult(result);
    } catch (err) {
      clearLoading();
      showError(`Upload failed: ${err.message}`);
    }
  });

  // Demo
  el.demoBtn.addEventListener('click', async () => {
    clearError();
    setLoading('Analysing the Poltergeist repo itself…');
    try {
      const result = await apiDemo();
      clearLoading();
      applyResult(result);
    } catch (err) {
      clearLoading();
      showError(`Demo analysis failed: ${err.message}`);
    }
  });

  // Séance
  el.seanceBtn.addEventListener('click', submitSeance);
  el.seanceInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitSeance(); });
}

// ============================================================
// Bootstrap
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  resolveElements();
  renderSeanceChips();
  bindInputs();
});
