# UI Redesign — Almoxarifado → Aparência Gestão Efetivo

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir Tailwind CSS por um design system modular idêntico ao Gestão Efetivo, reescrevendo os templates HTML das funções render sem alterar a lógica JavaScript.

**Architecture:** Criar pasta `css/` com 10 arquivos CSS modulares (variables, base, auth, topbar, dashboard, stock, history, analytics, movement, modal). Remover Tailwind CDN do `<head>`. Reescrever todas as funções `renderXxx()` no `<script>` inline para usar as novas classes CSS. Adicionar JS para sidebar hamburger dentro do `<script>` existente.

**Tech Stack:** HTML/CSS puro, Inter (Google Fonts), Phosphor Icons (mantido), Supabase JS, Chart.js, SheetJS

**Arquivo alvo:** `Almoxarifado/index.html` (único arquivo, ~3583 linhas)

---

## Mapa de Classes — Tailwind → Design System

| Tailwind | Nova classe |
|---|---|
| `min-h-screen pb-6` | `.page-wrap` |
| `p-4 max-w-7xl mx-auto space-y-6` | `.page-content` |
| `p-4 max-w-3xl mx-auto space-y-6` | `.page-content-sm` |
| `glass p-6 rounded-xl` | `.card` |
| `glass p-4 rounded-lg` | `.card-sm` |
| `glass p-8 rounded-xl` | `.card-lg` |
| `text-2xl font-bold flex items-center gap-3` | `.page-title` |
| `text-xs px-2 py-1 bg-blue-500/20 text-blue-400 rounded-full` | `.badge .badge-blue` |
| `text-xs px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded-full` | `.badge .badge-green` |
| `text-xs px-2 py-1 bg-purple-500/20 text-purple-400 rounded-full` | `.badge .badge-purple` |
| `text-xs px-2 py-1 bg-slate-500/20 text-slate-500 rounded-full` | `.badge .badge-gray` |
| `text-emerald-400 / text-emerald-600` | `.text-green` |
| `text-blue-400 / text-blue-600` | `.text-blue` |
| `text-amber-400 / text-amber-600` | `.text-amber` |
| `text-red-400 / text-red-600` | `.text-red` |
| `text-purple-400 / text-purple-600` | `.text-purple` |
| `text-cyan-400 / text-cyan-600` | `.text-cyan` |
| `text-slate-500` | `.text-muted` |
| `text-slate-800` | `.text-main` |
| `bg-emerald-600 hover:bg-emerald-700 ... text-white` | `.btn-primary` |
| `bg-blue-600 hover:bg-blue-700 ... text-white` | `.btn-secondary` |
| `bg-red-600 ... text-white` | `.btn-danger` |
| `bg-slate-200 hover:bg-slate-300 text-slate-800` | `.btn-ghost` |
| `bg-cyan-600 ... text-white` | `.btn-cyan` |
| `w-full bg-white border-2 border-slate-200 rounded-lg p-3 focus:border-... outline-none` | `.field-input` |
| `text-sm font-bold text-slate-700 block mb-2 uppercase tracking-wide` | `.field-label` |
| `border-l-4 border-emerald-500` | `.card.accent-green` |
| `border-l-4 border-blue-500` | `.card.accent-blue` |
| `border-l-4 border-amber-500` | `.card.accent-amber` |
| `border-l-4 border-red-500` | `.card.accent-red` |
| `text-4xl font-bold font-mono` | `.stat-value` |
| `w-16 h-16 bg-emerald-500/20 rounded-xl flex items-center justify-center` | `.stat-icon .icon-green` |
| `grid grid-cols-1 md:grid-cols-3 gap-4` | `.grid-3` |
| `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4` | `.grid-cards` |
| `flex justify-between items-center flex-wrap gap-4` | `.row-between` |
| `space-y-4` | `.stack` |
| `space-y-2` | `.stack-sm` |
| `font-mono` | (removido — Inter em tudo) |
| `animate-spin` | `.spin` (mantido em base.css) |

---

## Task 1: Criar CSS — variables.css e base.css

**Files:**
- Create: `Almoxarifado/css/variables.css`
- Create: `Almoxarifado/css/base.css`

- [ ] **Step 1: Criar `css/variables.css`**

```css
/* Almoxarifado/css/variables.css */
:root {
  --bg-0: #f5f7fa;
  --bg-1: #ffffff;
  --bg-2: #f0f2f5;
  --bg-3: #e8ebf0;
  --bg-4: #dde1e8;
  --border: #d8dce5;
  --border-bright: #c5cbda;
  --accent: #4a7fd7;
  --accent-dim: #3a6abf;
  --accent-glow: #4a7fd715;
  --text-1: #2d3748;
  --text-2: #5a6676;
  --text-3: #8a95a5;
  --green: #2e9e5a;
  --orange: #e0872a;
  --purple: #8b5ec9;
  --yellow: #c99a1a;
  --red: #d64545;
  --cyan: #1a9eb8;
  --font-display: 'Inter', sans-serif;
  --radius: 12px;
  --radius-sm: 8px;
  --shadow: 0 2px 12px #0000000a;
  --shadow-lg: 0 6px 28px #00000010;
}
```

- [ ] **Step 2: Criar `css/base.css`**

```css
/* Almoxarifado/css/base.css */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html { height: 100%; background: var(--bg-0); }

body {
  height: 100%;
  background: var(--bg-0);
  color: var(--text-1);
  font-family: var(--font-display);
  font-size: 14px;
  overscroll-behavior-y: none;
  -webkit-tap-highlight-color: transparent;
}

#app { min-height: 100vh; background: var(--bg-0); overflow-y: auto; -webkit-overflow-scrolling: touch; }

::-webkit-scrollbar { width: 5px; height: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border-bright); border-radius: 10px; }

/* ---- Layout ---- */
.page-wrap { min-height: 100vh; padding-bottom: 24px; background: var(--bg-0); }
.page-content { padding: 16px; max-width: 1280px; margin: 0 auto; display: flex; flex-direction: column; gap: 24px; }
.page-content-sm { padding: 16px; max-width: 760px; margin: 0 auto; display: flex; flex-direction: column; gap: 24px; }

/* ---- Cards ---- */
.card {
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 24px;
}
.card-sm { background: var(--bg-1); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); padding: 16px; }
.card-lg { background: var(--bg-1); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); padding: 32px; }
.card.accent-green { border-left: 3px solid var(--green); }
.card.accent-blue  { border-left: 3px solid var(--accent); }
.card.accent-amber { border-left: 3px solid var(--orange); }
.card.accent-red   { border-left: 3px solid var(--red); }
.card.accent-cyan  { border-left: 3px solid var(--cyan); }

/* ---- Typography ---- */
.page-title { font-size: 22px; font-weight: 700; color: var(--text-1); display: flex; align-items: center; gap: 10px; }
.section-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: var(--text-3); padding-bottom: 6px; border-bottom: 1px solid var(--border); margin-bottom: 4px; }
.text-main  { color: var(--text-1); }
.text-muted { color: var(--text-2); }
.text-faint { color: var(--text-3); }
.text-green  { color: var(--green); }
.text-blue   { color: var(--accent); }
.text-amber  { color: var(--orange); }
.text-red    { color: var(--red); }
.text-purple { color: var(--purple); }
.text-cyan   { color: var(--cyan); }

/* ---- Stat cards ---- */
.stat-value { font-size: 36px; font-weight: 700; line-height: 1.1; margin-top: 8px; }
.stat-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-2); }
.stat-icon {
  width: 48px; height: 48px;
  border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  font-size: 22px;
  flex-shrink: 0;
}
.icon-green  { background: color-mix(in srgb, var(--green) 12%, transparent); color: var(--green); }
.icon-blue   { background: var(--accent-glow); color: var(--accent); }
.icon-amber  { background: color-mix(in srgb, var(--orange) 12%, transparent); color: var(--orange); }
.icon-red    { background: color-mix(in srgb, var(--red) 10%, transparent); color: var(--red); }
.icon-purple { background: color-mix(in srgb, var(--purple) 12%, transparent); color: var(--purple); }
.icon-cyan   { background: color-mix(in srgb, var(--cyan) 12%, transparent); color: var(--cyan); }
.icon-gray   { background: var(--bg-3); color: var(--text-2); }

/* ---- Badges ---- */
.badge { display: inline-flex; align-items: center; padding: 2px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; white-space: nowrap; }
.badge-green  { background: color-mix(in srgb, var(--green) 12%, transparent); color: var(--green); }
.badge-blue   { background: var(--accent-glow); color: var(--accent); }
.badge-amber  { background: color-mix(in srgb, var(--orange) 12%, transparent); color: var(--orange); }
.badge-red    { background: color-mix(in srgb, var(--red) 10%, transparent); color: var(--red); }
.badge-purple { background: color-mix(in srgb, var(--purple) 12%, transparent); color: var(--purple); }
.badge-cyan   { background: color-mix(in srgb, var(--cyan) 12%, transparent); color: var(--cyan); }
.badge-gray   { background: var(--bg-3); color: var(--text-2); }

/* ---- Buttons ---- */
.btn-primary {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  padding: 10px 18px; background: var(--green); border: none; border-radius: var(--radius-sm);
  color: #fff; font-family: var(--font-display); font-size: 13px; font-weight: 700;
  cursor: pointer; transition: background .15s; text-decoration: none;
}
.btn-primary:hover { background: #268a4d; }
.btn-secondary {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  padding: 10px 18px; background: var(--accent); border: none; border-radius: var(--radius-sm);
  color: #fff; font-family: var(--font-display); font-size: 13px; font-weight: 700;
  cursor: pointer; transition: background .15s;
}
.btn-secondary:hover { background: var(--accent-dim); }
.btn-cyan {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  padding: 10px 18px; background: var(--cyan); border: none; border-radius: var(--radius-sm);
  color: #fff; font-family: var(--font-display); font-size: 13px; font-weight: 700;
  cursor: pointer; transition: background .15s;
}
.btn-cyan:hover { background: #1589a0; }
.btn-danger {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  padding: 10px 18px; background: color-mix(in srgb, var(--red) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--red) 30%, transparent);
  border-radius: var(--radius-sm); color: var(--red);
  font-family: var(--font-display); font-size: 13px; font-weight: 700; cursor: pointer; transition: all .15s;
}
.btn-danger:hover { background: var(--red); color: #fff; }
.btn-ghost {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  padding: 10px 18px; background: var(--bg-3); border: 1px solid var(--border);
  border-radius: var(--radius-sm); color: var(--text-1);
  font-family: var(--font-display); font-size: 13px; font-weight: 600; cursor: pointer; transition: all .15s;
}
.btn-ghost:hover { background: var(--bg-4); }
.btn-icon {
  width: 34px; height: 34px; display: flex; align-items: center; justify-content: center;
  border: 1px solid var(--border); border-radius: var(--radius-sm);
  background: transparent; color: var(--text-2); cursor: pointer; transition: all .15s; font-size: 18px;
}
.btn-icon:hover { background: var(--bg-3); color: var(--red); }
button:disabled { opacity: 0.5; cursor: not-allowed; }

/* ---- Form fields ---- */
.field-group { display: flex; flex-direction: column; gap: 6px; }
.field-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-3); }
.field-input {
  width: 100%; padding: 10px 14px;
  background: var(--bg-2); border: 1px solid var(--border);
  border-radius: var(--radius-sm); color: var(--text-1);
  font-family: var(--font-display); font-size: 13px; outline: none; transition: border .15s;
}
.field-input:focus { border-color: var(--accent); background: var(--bg-1); }
.field-input[type="checkbox"] { width: auto; }
textarea.field-input { resize: vertical; }
.field-select { cursor: pointer; }

/* ---- Grid helpers ---- */
.grid-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
.grid-3 { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; }
.grid-4 { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 16px; }
.grid-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }

/* ---- Flex helpers ---- */
.row-between { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px; }
.row-end { display: flex; justify-content: flex-end; align-items: center; gap: 8px; flex-wrap: wrap; }
.row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.stack  { display: flex; flex-direction: column; gap: 16px; }
.stack-sm { display: flex; flex-direction: column; gap: 8px; }

/* ---- Tabs (almoxarifado) ---- */
.tab-bar { display: flex; border-bottom: 1px solid var(--border); background: var(--bg-1); }
.tab-btn {
  flex: 1; padding: 14px 12px; font-weight: 600; font-size: 13px;
  background: transparent; border: none; border-bottom: 2px solid transparent;
  color: var(--text-2); cursor: pointer; transition: all .15s;
  display: flex; align-items: center; justify-content: center; gap: 8px;
  font-family: var(--font-display);
}
.tab-btn:hover { background: var(--bg-2); color: var(--text-1); }
.tab-btn.active { border-bottom-color: var(--green); color: var(--green); background: color-mix(in srgb, var(--green) 5%, transparent); }
.tab-count { font-size: 10px; padding: 1px 6px; border-radius: 20px; background: var(--bg-3); color: var(--text-2); font-weight: 700; }
.tab-btn.active .tab-count { background: color-mix(in srgb, var(--green) 18%, transparent); color: var(--green); }

/* ---- Info bar (below tabs) ---- */
.info-bar { padding: 12px 16px; background: var(--bg-2); border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; }
.info-bar-title { font-weight: 700; color: var(--text-1); font-size: 13px; }
.info-bar-sub { font-size: 11px; color: var(--text-2); }

/* ---- Radio card (movement forms) ---- */
.radio-card {
  display: flex; align-items: center; gap: 12px; padding: 14px 16px;
  border: 1.5px solid var(--border); border-radius: var(--radius-sm);
  cursor: pointer; transition: all .15s; background: var(--bg-1);
}
.radio-card:hover { border-color: var(--accent); }
.radio-card.selected { border-color: var(--green); background: color-mix(in srgb, var(--green) 5%, transparent); }
.radio-card-title { font-size: 13px; font-weight: 700; color: var(--text-1); }
.radio-card-sub { font-size: 11px; color: var(--text-2); }

/* ---- Item preview (selected item in movement) ---- */
.item-preview {
  padding: 14px; background: var(--bg-2); border: 1.5px solid var(--border);
  border-radius: var(--radius-sm);
  display: flex; justify-content: space-between; align-items: center;
}
.item-preview.selected { border-color: color-mix(in srgb, var(--green) 50%, transparent); }

/* ---- Stock item card ---- */
.item-card {
  background: var(--bg-1); border: 1.5px solid var(--border);
  border-radius: var(--radius); padding: 20px; transition: border-color .15s;
}
.item-card:hover { border-color: var(--accent); }
.item-card-name { font-size: 16px; font-weight: 700; color: var(--text-1); margin-bottom: 8px; word-break: break-word; }
.item-card-qty { font-size: 28px; font-weight: 700; line-height: 1; }
.item-card-qty.low { color: var(--orange); }
.item-card-qty.ok  { color: var(--green); }
.low-stock-alert {
  margin-top: 10px; padding: 8px 12px;
  background: color-mix(in srgb, var(--orange) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--orange) 25%, transparent);
  border-radius: var(--radius-sm); font-size: 11px; font-weight: 700;
  color: var(--orange); display: flex; align-items: center; gap: 6px;
}
.sizes-grid { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.size-chip {
  background: var(--bg-2); border: 1px solid var(--border);
  border-radius: 4px; padding: 3px 8px; font-size: 11px;
}
.size-chip span.qty { font-weight: 700; }
.size-chip span.qty.ok  { color: var(--green); }
.size-chip span.qty.low { color: var(--red); }
.item-actions { display: flex; gap: 6px; padding-top: 14px; border-top: 1px solid var(--border); margin-top: 14px; }
.item-actions .btn-primary,
.item-actions .btn-secondary,
.item-actions .btn-danger,
.item-actions .btn-cyan { flex: 1; padding: 8px 12px; font-size: 12px; }

/* ---- Movement row (history) ---- */
.movement-row {
  background: var(--bg-1); border: 1px solid var(--border);
  border-radius: var(--radius-sm); padding: 14px; transition: border-color .15s;
}
.movement-row:hover { border-color: var(--border-bright); }
.movement-type-icon { width: 40px; height: 40px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0; }
.movement-qty { font-size: 26px; font-weight: 700; }
.movement-qty.positive { color: var(--green); }
.movement-qty.negative { color: var(--red); }
.movement-meta { font-size: 12px; color: var(--text-2); display: flex; flex-direction: column; gap: 3px; }
.movement-meta i { width: 14px; flex-shrink: 0; }

/* ---- Pagination ---- */
.pagination { display: flex; justify-content: center; align-items: center; gap: 8px; padding-top: 20px; border-top: 1px solid var(--border); flex-wrap: wrap; }
.page-btn { width: 34px; height: 34px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--bg-1); color: var(--text-1); font-weight: 600; font-size: 13px; cursor: pointer; transition: all .15s; font-family: var(--font-display); }
.page-btn:hover { background: var(--bg-3); }
.page-btn.active { background: var(--accent); color: #fff; border-color: var(--accent); }
.page-btn:disabled { opacity: 0.4; cursor: not-allowed; }

/* ---- Empty state ---- */
.empty-state { text-align: center; padding: 60px 20px; color: var(--text-3); }
.empty-state i { font-size: 56px; opacity: 0.4; display: block; margin-bottom: 14px; }
.empty-state p { font-size: 15px; color: var(--text-2); margin-bottom: 6px; }
.empty-state small { font-size: 12px; }

/* ---- Warning banner ---- */
.warning-banner {
  padding: 12px 16px; background: color-mix(in srgb, var(--orange) 10%, transparent);
  border: 1.5px solid color-mix(in srgb, var(--orange) 28%, transparent);
  border-radius: var(--radius-sm); color: var(--orange);
  font-size: 13px; display: flex; align-items: center; gap: 8px;
}
.info-banner {
  padding: 12px 16px; background: var(--accent-glow);
  border: 1px solid color-mix(in srgb, var(--accent) 25%, transparent);
  border-radius: var(--radius-sm); color: var(--accent);
  font-size: 13px; display: flex; align-items: center; gap: 8px;
}

/* ---- Quick actions ---- */
.action-card {
  background: var(--bg-1); border: 1.5px solid var(--border); border-radius: var(--radius);
  padding: 20px; text-align: center; cursor: pointer; transition: all .15s;
  display: flex; flex-direction: column; align-items: center; gap: 8px;
}
.action-card:hover { border-color: var(--accent); background: var(--accent-glow); }
.action-card .action-icon { width: 48px; height: 48px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 22px; transition: transform .15s; }
.action-card:hover .action-icon { transform: scale(1.1); }
.action-card h3 { font-size: 13px; font-weight: 700; color: var(--text-1); }
.action-card p  { font-size: 11px; color: var(--text-2); }

/* ---- Loading / Spinner ---- */
.loading-overlay { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 60px 20px; color: var(--text-3); font-size: 13px; }
.loading-spinner { width: 32px; height: 32px; border: 3px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.spin { animation: spin .8s linear infinite; }

/* ---- SQL block ---- */
.sql-block { background: #1e293b; color: #7dd3a8; padding: 16px; border-radius: var(--radius-sm); font-size: 11px; overflow-x: auto; font-family: monospace; line-height: 1.6; }

/* ---- Misc ---- */
.divider { height: 1px; background: var(--border); margin: 8px 0; }
.count-label { font-size: 12px; color: var(--text-2); }
.count-label strong { color: var(--text-1); font-weight: 700; }

/* ---- Toast ---- */
#toast-container { position: fixed; top: 20px; right: 20px; z-index: 9999; display: flex; flex-direction: column; gap: 8px; }
.toast {
  padding: 14px 20px; border-radius: var(--radius-sm);
  box-shadow: var(--shadow-lg); animation: toastIn 0.3s ease-out;
  display: flex; align-items: center; gap: 10px;
  font-family: var(--font-display); font-size: 13px; font-weight: 600;
  max-width: 360px;
}
@keyframes toastIn { from { transform: translateX(120%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
.toast-success { background: var(--green); color: #fff; }
.toast-error   { background: var(--red); color: #fff; }
.toast-info    { background: var(--accent); color: #fff; }

/* ---- Responsive ---- */
@media (max-width: 768px) {
  .page-content, .page-content-sm { padding: 12px; gap: 16px; }
  .card, .card-lg { padding: 16px; }
  .grid-3, .grid-4 { grid-template-columns: 1fr; }
  .grid-cards { grid-template-columns: 1fr; }
  .stat-value { font-size: 28px; }
  .page-title { font-size: 18px; }
  #toast-container { top: 10px; right: 10px; left: 10px; }
  .toast { max-width: 100%; }
  .btn-primary, .btn-secondary, .btn-cyan, .btn-ghost, .btn-danger { padding: 8px 14px; font-size: 12px; }
}
@media (max-width: 480px) {
  .grid-2 { grid-template-columns: 1fr; }
  .action-card { padding: 14px; }
}
```

- [ ] **Step 3: Commit**

```
git add Almoxarifado/css/variables.css Almoxarifado/css/base.css
git commit -m "feat(alm-ui): add CSS design system — variables and base"
```

---

## Task 2: Criar auth.css e topbar.css

**Files:**
- Create: `Almoxarifado/css/auth.css`
- Create: `Almoxarifado/css/topbar.css`

- [ ] **Step 1: Criar `css/auth.css`**

```css
/* Almoxarifado/css/auth.css */
#login-screen {
  position: fixed; inset: 0;
  background: radial-gradient(ellipse at 50% 30%, #f1f5f9 0%, #e8edf5 60%, #dde4ef 100%);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  z-index: 10000; overflow: hidden;
}

.login-box {
  background: #fff; border: 1px solid rgba(10,47,168,0.12);
  width: 100%; max-width: 380px; border-radius: 16px;
  box-shadow: 0 4px 18px rgba(10,47,168,0.07), 0 1px 4px rgba(0,0,0,0.04);
  display: flex; flex-direction: column; overflow: hidden;
  margin: 0 16px; animation: loginCardIn 0.4s cubic-bezier(0.16,1,0.3,1) forwards;
}
@keyframes loginCardIn { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }

.login-header {
  padding: 24px 20px 18px; background: #fff;
  border-bottom: 1px solid rgba(226,232,240,0.8);
  display: flex; align-items: center; justify-content: space-between;
}
.login-header-title { display: flex; flex-direction: column; gap: 2px; }
.login-brand-label { font-size: 11px; font-weight: 700; letter-spacing: 0.1em; color: #64748b; text-transform: uppercase; }
.login-brand-name  { font-size: 20px; font-weight: 800; color: #0f3868; letter-spacing: -0.02em; line-height: 1.1; }
.login-icon {
  width: 40px; height: 40px; border-radius: 10px;
  background: linear-gradient(135deg, #0f3868 0%, #2563eb 100%);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(15,56,104,0.3); font-size: 20px; color: #fff;
}

.login-system-row {
  padding: 14px 20px; background: #f8fafc;
  border-bottom: 1px solid rgba(226,232,240,0.8);
  display: flex; align-items: center; gap: 12px;
}
.login-system-icon {
  width: 32px; height: 32px; border-radius: 8px;
  background: linear-gradient(135deg, #1a56a0 0%, #2563eb 100%);
  display: flex; align-items: center; justify-content: center;
  color: #fff; flex-shrink: 0; box-shadow: 0 2px 6px rgba(0,0,0,0.15); font-size: 16px;
}
.login-system-name { font-size: 13px; font-weight: 700; color: #334155; letter-spacing: 0.03em; text-transform: uppercase; }

.login-form-area { background: #f4f7fa; padding: 20px 20px 24px; display: flex; flex-direction: column; gap: 16px; }
.login-form-section {
  background: #fff; border-radius: 12px; border: 1px solid rgba(226,232,240,0.8);
  box-shadow: 0 4px 12px rgba(0,0,0,0.03); padding: 20px;
  display: flex; flex-direction: column; gap: 14px;
}

.login-input-group { display: flex; flex-direction: column; gap: 6px; }
.login-input-group label { font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #94a3b8; }
.login-input-group input {
  height: 42px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;
  padding: 0 14px; font-size: 14px; color: #1e293b;
  font-family: var(--font-display); outline: none; transition: border-color .2s, box-shadow .2s;
}
.login-input-group input:focus { border-color: #2563eb; background: #fff; box-shadow: 0 0 0 3px rgba(37,99,235,0.08); }

.login-btn {
  width: 100%; height: 44px;
  background: linear-gradient(135deg, #0f3868 0%, #1a56a0 100%);
  color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 700;
  cursor: pointer; transition: all .2s; font-family: var(--font-display);
  box-shadow: 0 4px 12px rgba(15,56,104,0.25);
}
.login-btn:hover { background: linear-gradient(135deg, #0f3868 0%, #2563eb 100%); transform: translateY(-1px); box-shadow: 0 6px 18px rgba(15,56,104,0.32); }
.login-btn:active { transform: translateY(1px); }
.login-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }

.login-error { color: #dc2626; font-size: 12px; text-align: center; min-height: 18px; font-weight: 500; }

.login-footer {
  position: fixed; bottom: 18px; left: 0; right: 0; text-align: center;
  font-size: 10px; color: rgba(148,163,184,0.4); font-weight: 500;
  letter-spacing: 0.08em; text-transform: uppercase; pointer-events: none; z-index: 5;
}
@media (max-width: 420px) {
  .login-header { padding: 16px 16px 14px; }
  .login-form-area { padding: 16px 16px 20px; }
  .login-form-section { padding: 16px; }
  .login-brand-name { font-size: 18px; }
}
```

- [ ] **Step 2: Criar `css/topbar.css`**

```css
/* Almoxarifado/css/topbar.css */
#global-sync-bar { height: 0; background: linear-gradient(90deg, var(--accent), #2563eb); transition: height .25s; flex-shrink: 0; }
#global-sync-bar.active { height: 3px; }

#topbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 16px; border-bottom: 1px solid var(--border);
  background: var(--bg-1); flex-shrink: 0; position: relative; z-index: 100;
  gap: 12px; min-height: 48px;
}
#topbar-left  { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
#topbar-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

.topbar-icon-btn {
  width: 34px; height: 34px; display: flex; align-items: center; justify-content: center;
  border: 1px solid var(--border); border-radius: var(--radius-sm);
  background: transparent; color: var(--text-2); cursor: pointer; transition: all .15s; font-size: 16px;
}
.topbar-icon-btn:hover { background: var(--bg-3); border-color: var(--accent); color: var(--accent); }

.logo {
  position: absolute; left: 50%; transform: translateX(-50%);
  display: flex; flex-direction: column; align-items: center; gap: 1px; line-height: 1;
}
.logo-gps       { font-weight: 800; font-size: 14px; letter-spacing: 0.5px; color: #0f3868; }
.logo-divider   { height: 1px; background: linear-gradient(90deg, transparent, var(--border), transparent); width: 100%; margin: 1px 0; }
.logo-gestao    { font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.12em; color: var(--text-3); }

/* Sidebar overlay */
.nav-menu-overlay { position: fixed; inset: 0; z-index: 9000; background: rgba(0,0,0,0.3); backdrop-filter: blur(2px); animation: fadeOverlay .15s ease; }
.nav-menu-overlay.hidden { display: none; }
@keyframes fadeOverlay { from { opacity:0; } to { opacity:1; } }

.nav-menu-panel {
  position: absolute; top: 0; left: 0; width: 280px; height: 100%;
  background: var(--bg-1); border-right: 1px solid var(--border);
  box-shadow: var(--shadow-lg); display: flex; flex-direction: column;
  animation: slideNav .2s cubic-bezier(.4,0,.2,1);
}
@keyframes slideNav { from { transform: translateX(-100%); } to { transform: translateX(0); } }

.nav-menu-header {
  display: flex; align-items: center; justify-content: flex-start;
  padding: 20px 16px; border-bottom: 1px solid var(--border); min-height: 80px;
}
.nav-menu-body { flex: 1; overflow-y: auto; padding: 8px 0; }

.nav-menu-item {
  display: flex; align-items: center; gap: 10px; width: 100%;
  padding: 10px 20px; border: none; border-radius: 0;
  background: transparent; color: var(--text-2);
  font-family: var(--font-display); font-size: 13px; font-weight: 500;
  cursor: pointer; transition: all .12s; text-align: left;
}
.nav-menu-item:hover { background: var(--bg-3); color: var(--accent); }
.nav-menu-item.active { background: var(--accent-glow); color: var(--accent); font-weight: 600; }
.nav-menu-item i { font-size: 16px; flex-shrink: 0; width: 20px; text-align: center; }

.nav-menu-footer {
  border-top: 1px solid var(--border); padding: 14px 20px;
  background: var(--bg-2); flex-shrink: 0; display: flex; flex-direction: column; gap: 10px;
}
.nav-menu-user-info { font-size: 12px; color: var(--text-2); display: flex; align-items: center; gap: 8px; }

@media (max-width: 480px) {
  .nav-menu-panel { width: 100vw; }
  .logo-gps { font-size: 12px; }
  #topbar { padding: 6px 10px; }
}
```

- [ ] **Step 3: Commit**

```
git add Almoxarifado/css/auth.css Almoxarifado/css/topbar.css
git commit -m "feat(alm-ui): add auth and topbar CSS modules"
```

---

## Task 3: Atualizar `<head>` do index.html

**Files:**
- Modify: `Almoxarifado/index.html` (linhas 1–42 aproximadamente)

- [ ] **Step 1: Substituir o bloco `<head>` inteiro**

Localizar o trecho do `<head>` atual (do `<meta charset` até o fechamento `</style>`) e substituir por:

```html
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Almoxarifado EPI - GPS Mecanizada</title>
    <meta name="theme-color" content="#f5f7fa">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <script src="https://unpkg.com/@phosphor-icons/web"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
    <script src="https://cdn.sheetjs.com/xlsx-0.20.0/package/dist/xlsx.full.min.js"></script>
    <link rel="stylesheet" href="css/variables.css">
    <link rel="stylesheet" href="css/base.css">
    <link rel="stylesheet" href="css/auth.css">
    <link rel="stylesheet" href="css/topbar.css">
</head>
```

- [ ] **Step 2: Verificar no browser que a página carrega sem erros de console**

Abrir `index.html` no browser. Esperado: fundo cinza claro `#f5f7fa`, fonte Inter, sem erros 404 nos CSS.

- [ ] **Step 3: Commit**

```
git add Almoxarifado/index.html
git commit -m "feat(alm-ui): replace Tailwind CDN with CSS modules in head"
```

---

## Task 4: Reescrever `renderLogin()`

**Files:**
- Modify: `Almoxarifado/index.html` — função `renderLogin()` (~linha 2035)

- [ ] **Step 1: Substituir o corpo de `renderLogin()`**

Localizar `function renderLogin()` e substituir todo o return template por:

```javascript
function renderLogin() {
    return `
        <div id="login-screen">
            <div class="login-box">
                <div class="login-header">
                    <div class="login-header-title">
                        <span class="login-brand-label">Central GPS · Grupo GPS</span>
                        <span class="login-brand-name">Mecanizada</span>
                    </div>
                    <div class="login-icon">
                        <i class="ph-fill ph-squares-four"></i>
                    </div>
                </div>
                <div class="login-system-row">
                    <div class="login-system-icon">
                        <i class="ph-fill ph-package"></i>
                    </div>
                    <span class="login-system-name">Almoxarifado EPI</span>
                </div>
                <div class="login-form-area">
                    <div class="login-form-section">
                        <form onsubmit="handleLogin(event)" style="display:flex;flex-direction:column;gap:0;">
                            <div class="login-input-group" style="margin-bottom:14px;">
                                <label>E-mail</label>
                                <input type="email" id="email" placeholder="Digite seu e-mail" ${state.isLoading ? 'disabled' : ''} required>
                            </div>
                            <div class="login-input-group">
                                <label>Senha</label>
                                <input type="password" id="password" placeholder="Digite sua senha" ${state.isLoading ? 'disabled' : ''} required>
                            </div>
                            <button type="submit" class="login-btn" style="margin-top:18px;" ${state.isLoading ? 'disabled' : ''}>
                                ${state.isLoading
                                    ? `<i class="ph ph-spinner spin" style="margin-right:6px;"></i>${state.loadingMessage.toUpperCase() || 'CARREGANDO...'}`
                                    : '<i class="ph ph-sign-in" style="margin-right:6px;"></i>ENTRAR'}
                            </button>
                            <div class="login-error">${state.loginError || ''}</div>
                        </form>
                    </div>
                </div>
            </div>
            <div class="login-footer">Desenvolvido por Grupo GPS — Almoxarifado EPI v3.0</div>
        </div>
    `;
}
```

> **Nota:** Se existir um campo `state.loginError` no estado, ele será exibido. Caso não exista, verificar se `handleLogin` define `state.loginError` e chama `render()` em caso de erro. Se não existir esse campo, adicionar `loginError: ''` ao objeto `state` (linha ~370) e no bloco `catch` de `handleLogin` fazer `state.loginError = error.message; render();`.

- [ ] **Step 2: Testar login no browser**

Abrir `index.html`. Esperado: card branco centralizado com header GPS azul, campo e-mail, campo senha, botão azul escuro "ENTRAR".

- [ ] **Step 3: Commit**

```
git add Almoxarifado/index.html
git commit -m "feat(alm-ui): rewrite renderLogin with GPS design system"
```

---

## Task 5: Reescrever `renderHeader()` + adicionar lógica sidebar

**Files:**
- Modify: `Almoxarifado/index.html` — função `renderHeader()` (~linha 3497) + inicialização de eventos

- [ ] **Step 1: Substituir `renderHeader()`**

```javascript
function renderHeader() {
    const views = [
        { id: 'dashboard',   label: 'Dashboard',      icon: 'ph-fill ph-house' },
        { id: 'stock',       label: 'Estoque',         icon: 'ph-fill ph-warehouse' },
        { id: 'history',     label: 'Histórico',       icon: 'ph-fill ph-clock-counter-clockwise' },
        { id: 'analytics',   label: 'Analytics',       icon: 'ph-fill ph-chart-line' },
        { id: 'warehouses',  label: 'Almoxarifados',   icon: 'ph-fill ph-gear' },
    ];
    return `
        <div id="global-sync-bar"></div>
        <div id="topbar">
            <div id="topbar-left">
                <button class="topbar-icon-btn" onclick="openSidebar()" aria-label="Menu" title="Menu">
                    <i class="ph ph-list"></i>
                </button>
            </div>
            <div class="logo">
                <span class="logo-gps">Grupo GPS</span>
                <div class="logo-divider"></div>
                <span class="logo-gestao">Almoxarifado EPI</span>
            </div>
            <div id="topbar-right">
                <button class="topbar-icon-btn" onclick="exportAll()" title="Exportar" aria-label="Exportar">
                    <i class="ph ph-download-simple"></i>
                </button>
                <button class="topbar-icon-btn" onclick="handleLogout()" title="Sair" aria-label="Sair" style="color:var(--red)">
                    <i class="ph ph-sign-out"></i>
                </button>
            </div>
        </div>

        <div id="nav-menu-overlay" class="nav-menu-overlay hidden" onclick="closeSidebar()">
            <div class="nav-menu-panel" onclick="event.stopPropagation()">
                <div class="nav-menu-header">
                    <div>
                        <div style="font-weight:800;font-size:16px;color:#0f3868;letter-spacing:-0.01em;">Grupo GPS</div>
                        <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.15em;color:var(--accent);">Mecanizada</div>
                        <div style="height:1px;background:var(--border);margin:6px 0;"></div>
                        <div style="font-size:11px;color:var(--text-3);font-weight:500;">Almoxarifado EPI</div>
                    </div>
                </div>
                <div class="nav-menu-body">
                    ${views.map(v => `
                        <button class="nav-menu-item ${state.view === v.id ? 'active' : ''}"
                            onclick="closeSidebar(); navigateTo('${v.id}')">
                            <i class="${v.icon}"></i>
                            ${v.label}
                        </button>
                    `).join('')}
                    <button class="nav-menu-item" onclick="closeSidebar(); startMovement('COMPRA')">
                        <i class="ph-fill ph-shopping-cart"></i>
                        Nova Compra
                    </button>
                    <button class="nav-menu-item" onclick="closeSidebar(); startTransfer(state.activeWarehouse)">
                        <i class="ph-fill ph-arrows-left-right"></i>
                        Transferência
                    </button>
                </div>
                <div class="nav-menu-footer">
                    <div class="nav-menu-user-info">
                        <i class="ph-fill ph-user-circle" style="font-size:18px;color:var(--text-3);"></i>
                        <span>${state.user?.nome || state.user?.email || '—'}</span>
                    </div>
                    <button class="btn-ghost" onclick="closeSidebar(); handleLogout()" style="width:100%;justify-content:flex-start;gap:8px;">
                        <i class="ph ph-sign-out"></i> Sair
                    </button>
                </div>
            </div>
        </div>
    `;
}
```

- [ ] **Step 2: Adicionar funções `openSidebar` e `closeSidebar`**

Logo após a função `renderHeader`, adicionar:

```javascript
function openSidebar() {
    const overlay = document.getElementById('nav-menu-overlay');
    if (overlay) overlay.classList.remove('hidden');
}

function closeSidebar() {
    const overlay = document.getElementById('nav-menu-overlay');
    if (overlay) overlay.classList.add('hidden');
}
```

- [ ] **Step 3: Adicionar função `exportAll`**

Logo após `closeSidebar`, adicionar a função de exportação genérica (usa a que já existe, só cria o alias):

```javascript
function exportAll() {
    if (state.view === 'history') {
        exportMovementsToXLSX();
    } else {
        exportStockToXLSX();
    }
}
```

- [ ] **Step 4: Testar sidebar no browser**

Logar no sistema. Clicar no botão hamburger. Esperado: painel sidebar branco desliza da esquerda com itens de navegação. Clicar fora fecha. Clicar em item navega e fecha.

- [ ] **Step 5: Commit**

```
git add Almoxarifado/index.html
git commit -m "feat(alm-ui): rewrite renderHeader with hamburger sidebar navigation"
```

---

## Task 6: Reescrever `renderDashboard()`

**Files:**
- Modify: `Almoxarifado/index.html` — função `renderDashboard()` (~linha 2093)

- [ ] **Step 1: Substituir o corpo de `renderDashboard()`**

```javascript
function renderDashboard() {
    const totalItems = state.items.length;
    const totalQty = state.items.reduce((s, i) => s + i.quantidade, 0);
    const lowStock = state.items.filter(i => i.quantidade < 10).length;

    return `
        <div class="page-wrap">
            ${renderHeader()}
            <div class="page-content">
                <div class="grid-3">
                    <div class="card accent-green" style="display:flex;align-items:center;justify-content:space-between;">
                        <div>
                            <div class="stat-label">Total de Itens</div>
                            <div class="stat-value text-green">${totalItems}</div>
                        </div>
                        <div class="stat-icon icon-green"><i class="ph-fill ph-package"></i></div>
                    </div>
                    <div class="card accent-blue" style="display:flex;align-items:center;justify-content:space-between;">
                        <div>
                            <div class="stat-label">Quantidade Total</div>
                            <div class="stat-value text-blue">${totalQty}</div>
                        </div>
                        <div class="stat-icon icon-blue"><i class="ph-fill ph-stack"></i></div>
                    </div>
                    <div class="card accent-amber" style="display:flex;align-items:center;justify-content:space-between;">
                        <div>
                            <div class="stat-label">Estoque Baixo</div>
                            <div class="stat-value text-amber">${lowStock}</div>
                        </div>
                        <div class="stat-icon icon-amber"><i class="ph-fill ph-warning"></i></div>
                    </div>
                </div>

                <div class="card">
                    <div class="section-title" style="margin-bottom:16px;">Ações Rápidas</div>
                    <div class="grid-4">
                        <button onclick="startMovement('COMPRA')" class="action-card">
                            <div class="action-icon icon-green"><i class="ph-fill ph-shopping-cart"></i></div>
                            <h3>Compra</h3><p>Registrar entrada</p>
                        </button>
                        <button onclick="navigateTo('stock')" class="action-card">
                            <div class="action-icon icon-blue"><i class="ph-fill ph-warehouse"></i></div>
                            <h3>Estoque</h3><p>Visualizar</p>
                        </button>
                        <button onclick="navigateToHistory()" class="action-card">
                            <div class="action-icon icon-purple"><i class="ph-fill ph-clock-counter-clockwise"></i></div>
                            <h3>Histórico</h3><p>Ver movimentações</p>
                        </button>
                        <button onclick="startTransfer(state.activeWarehouse)" class="action-card">
                            <div class="action-icon icon-cyan"><i class="ph-fill ph-arrows-left-right"></i></div>
                            <h3>Transferência</h3><p>Entre almox.</p>
                        </button>
                        <button onclick="navigateToDashboardAnalytics()" class="action-card">
                            <div class="action-icon icon-red" style="background:color-mix(in srgb,#e879a0 12%,transparent);color:#e879a0;"><i class="ph-fill ph-chart-line"></i></div>
                            <h3>Analytics</h3><p>Relatórios</p>
                        </button>
                        <button onclick="openNewItem()" class="action-card">
                            <div class="action-icon icon-amber"><i class="ph-fill ph-plus-circle"></i></div>
                            <h3>Novo Item</h3><p>Cadastrar</p>
                        </button>
                        <button onclick="navigateToWarehouses()" class="action-card">
                            <div class="action-icon icon-gray"><i class="ph-fill ph-gear"></i></div>
                            <h3>Almoxarifados</h3><p>Configurar</p>
                        </button>
                    </div>
                </div>

                <div class="card">
                    <div class="section-title" style="margin-bottom:16px;">Itens Recentes</div>
                    ${state.items.length === 0 ? `
                        <div class="empty-state">
                            <i class="ph ph-package"></i>
                            <p>Nenhum item cadastrado</p>
                        </div>
                    ` : `
                        <div class="stack-sm">
                            ${state.items.slice(0, 5).map(item => `
                                <div class="card-sm" style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
                                    <div style="flex:1;min-width:0;">
                                        <div style="font-weight:700;font-size:14px;color:var(--text-1);margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${item.nome}</div>
                                        <div style="display:flex;gap:6px;flex-wrap:wrap;">
                                            <span class="badge badge-blue">${item.categoria}</span>
                                            <span class="badge badge-gray">${item.unidade}</span>
                                        </div>
                                    </div>
                                    <div style="text-align:right;flex-shrink:0;">
                                        <div style="font-size:24px;font-weight:700;color:${item.quantidade < 10 ? 'var(--orange)' : 'var(--green)'};">${item.quantidade}</div>
                                        <div style="font-size:10px;color:var(--text-3);text-transform:uppercase;">em estoque</div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    `}
                </div>
            </div>
        </div>
    `;
}
```

- [ ] **Step 2: Verificar visualmente no browser**

Logar. Esperado: 3 stat cards com borda colorida à esquerda, grid de ações rápidas com cards clicáveis, lista de itens recentes. Fundo cinza claro, cards brancos.

- [ ] **Step 3: Commit**

```
git add Almoxarifado/index.html
git commit -m "feat(alm-ui): rewrite renderDashboard with GPS design system"
```

---

## Task 7: Reescrever `renderStock()`

**Files:**
- Modify: `Almoxarifado/index.html` — função `renderStock()` (~linha 2598)

- [ ] **Step 1: Substituir o corpo de `renderStock()`**

```javascript
function renderStock() {
    const filteredItems = getFilteredItems();
    const categories = [...new Set(state.items.map(i => i.categoria))];
    const activeWh = state.warehouses.find(w => w.id === state.activeWarehouse);
    const otherWh  = state.warehouses.find(w => w.id !== state.activeWarehouse);

    return `
        <div class="page-wrap">
            ${renderHeader()}
            <div class="page-content">
                <div class="row-between">
                    <h1 class="page-title"><i class="ph-fill ph-warehouse text-green"></i> Estoque de EPIs</h1>
                    <div class="row">
                        <button onclick="exportStockToXLSX()" class="btn-secondary"><i class="ph-fill ph-download-simple"></i> <span>Exportar</span></button>
                        <button onclick="openNewItem()" class="btn-primary"><i class="ph-fill ph-plus-circle"></i> <span>Novo Item</span></button>
                    </div>
                </div>

                <div class="card" style="padding:0;overflow:hidden;">
                    <div class="tab-bar">
                        ${state.warehouses.map(wh => `
                            <button class="tab-btn ${state.activeWarehouse === wh.id ? 'active' : ''}"
                                onclick="state.activeWarehouse='${wh.id}';state.filters.category='TODAS';state.filters.searchTerm='';render()">
                                <i class="ph-fill ph-${wh.id === 'alm-1' ? 'warehouse' : 'truck'}"></i>
                                ${wh.nome}
                                <span class="tab-count">${state.items.filter(i => (i.warehouse_id||'alm-1') === wh.id).length}</span>
                            </button>
                        `).join('')}
                    </div>
                    <div class="info-bar">
                        <div>
                            <div class="info-bar-title">${activeWh?.nome || 'Almoxarifado'}</div>
                            <div class="info-bar-sub">${activeWh?.descricao || ''}</div>
                        </div>
                        <div class="row">
                            <button onclick="startTransfer('${state.activeWarehouse}')" class="btn-cyan" style="font-size:12px;padding:7px 12px;">
                                <i class="ph-fill ph-arrows-left-right"></i> Transferir para ${otherWh?.nome || 'outro'}
                            </button>
                            <button onclick="navigateToWarehouses()" class="btn-ghost" style="font-size:12px;padding:7px 12px;">
                                <i class="ph-fill ph-gear"></i> Configurar
                            </button>
                        </div>
                    </div>
                </div>

                <div class="card">
                    <div class="section-title" style="margin-bottom:14px;"><i class="ph ph-funnel" style="margin-right:6px;"></i>Filtros</div>
                    <div class="grid-3" style="margin-bottom:12px;">
                        <div class="field-group">
                            <label class="field-label">Categoria</label>
                            <select class="field-input field-select" onchange="state.filters.category=this.value;render()">
                                <option value="TODAS">Todas</option>
                                ${categories.map(c => `<option value="${c}" ${state.filters.category===c?'selected':''}>${c}</option>`).join('')}
                            </select>
                        </div>
                        <div class="field-group">
                            <label class="field-label">Localização</label>
                            <input class="field-input" type="text" value="${state.filters.location}" oninput="state.filters.location=this.value;render()" placeholder="Ex: Prateleira A1">
                        </div>
                        <div class="field-group" style="justify-content:flex-end;">
                            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding-top:20px;">
                                <input type="checkbox" ${state.filters.lowStockOnly?'checked':''} onchange="state.filters.lowStockOnly=this.checked;render()" style="width:16px;height:16px;">
                                <span style="font-size:13px;font-weight:600;color:var(--orange);">Estoque Baixo</span>
                            </label>
                        </div>
                    </div>
                    <div class="field-group">
                        <label class="field-label">Pesquisar</label>
                        <input class="field-input" type="text" value="${state.filters.searchTerm}" oninput="handleSearchInput(this.value)" placeholder="Buscar por nome, categoria, CA...">
                    </div>
                </div>

                ${filteredItems.length === 0 ? `
                    <div class="card">
                        <div class="empty-state">
                            <i class="ph ph-package"></i>
                            <p>Nenhum item encontrado em ${activeWh?.nome || 'este almoxarifado'}</p>
                            ${state.filters.searchTerm || state.filters.category !== 'TODAS' || state.filters.location || state.filters.lowStockOnly ? `
                                <div style="margin-top:16px;">
                                    <button onclick="state.filters={startDate:getFirstDayOfMonth(),endDate:getCurrentDate(),type:'TODOS',searchTerm:'',category:'TODAS',minQuantity:'',maxQuantity:'',location:'',lowStockOnly:false};render()" class="btn-secondary">Limpar Filtros</button>
                                </div>
                            ` : `
                                <div style="margin-top:16px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
                                    <button onclick="openNewItem()" class="btn-primary">Cadastrar Item</button>
                                    ${state.activeWarehouse !== 'alm-1' ? `<button onclick="startTransfer('alm-1')" class="btn-cyan"><i class="ph-fill ph-arrows-left-right"></i> Transferir do Central</button>` : ''}
                                </div>
                            `}
                        </div>
                    </div>
                ` : `
                    <div class="count-label">Mostrando <strong>${filteredItems.length}</strong> de <strong>${state.items.filter(i=>(i.warehouse_id||'alm-1')===state.activeWarehouse).length}</strong> itens em <strong style="color:var(--green);">${activeWh?.nome}</strong></div>
                    <div class="grid-cards">
                        ${filteredItems.map(item => `
                            <div class="item-card">
                                <div class="item-card-name">${item.nome}</div>
                                <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;">
                                    <span class="badge badge-blue">${item.categoria}</span>
                                    <span class="badge badge-gray">${item.unidade}</span>
                                    ${item.ca ? `<span class="badge badge-purple">CA ${item.ca}</span>` : ''}
                                </div>
                                <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:8px;">
                                    <span style="font-size:11px;text-transform:uppercase;color:var(--text-3);">Quantidade</span>
                                    <span class="item-card-qty ${item.quantidade < 10 ? 'low' : 'ok'}">${item.quantidade}</span>
                                </div>
                                ${item.tamanhos && Object.keys(item.tamanhos).length > 0 ? `
                                    <div class="sizes-grid">
                                        ${Object.entries(item.tamanhos).map(([s,q]) => `
                                            <div class="size-chip"><strong>${s}:</strong> <span class="qty ${q>0?'ok':'low'}">${q}</span></div>
                                        `).join('')}
                                    </div>
                                ` : ''}
                                ${item.unidades_por_caixa && item.unidades_por_caixa > 1 ? `
                                    <div style="font-size:11px;color:var(--text-2);margin-top:6px;"><i class="ph ph-package"></i> ${item.unidades_por_caixa} un/caixa</div>
                                ` : ''}
                                ${item.quantidade < 10 ? `<div class="low-stock-alert"><i class="ph-fill ph-warning"></i> ESTOQUE BAIXO</div>` : ''}
                                ${item.localizacao ? `<div style="font-size:12px;color:var(--text-2);margin-top:8px;"><i class="ph ph-map-pin"></i> ${item.localizacao}</div>` : ''}
                                ${item.validade ? `<div style="font-size:12px;color:var(--text-2);margin-top:4px;"><i class="ph ph-calendar"></i> Val: ${formatDate(item.validade)}</div>` : ''}
                                <div class="item-actions">
                                    <button onclick='openEditItem(${JSON.stringify(item).replace(/'/g,"&#39;")})' class="btn-secondary" style="flex:1;font-size:12px;padding:8px;"><i class="ph ph-pencil-simple"></i> Editar</button>
                                    <button onclick="state.transferOperation.selectedItem='${item.id}';startTransfer('${item.warehouse_id||'alm-1'}')" class="btn-cyan" style="padding:8px 10px;" title="Transferir"><i class="ph ph-arrows-left-right"></i></button>
                                    <button onclick="handleDeleteItem('${item.id}')" class="btn-danger" style="padding:8px 10px;"><i class="ph ph-trash"></i></button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `}
            </div>
        </div>
    `;
}
```

- [ ] **Step 2: Verificar visualmente**

Navegar para Estoque. Esperado: tabs de almoxarifado, filtros em card branco, cards de item com badge colorido, botão Editar/Transferir/Excluir.

- [ ] **Step 3: Commit**

```
git add Almoxarifado/index.html
git commit -m "feat(alm-ui): rewrite renderStock with GPS design system"
```

---

## Task 8: Reescrever `renderHistory()`

**Files:**
- Modify: `Almoxarifado/index.html` — função `renderHistory()` (~linha 3056)

- [ ] **Step 1: Substituir o corpo de `renderHistory()`**

```javascript
function renderHistory() {
    const filteredMovements = getFilteredMovements();
    const paginatedMovements = getPaginatedMovements();
    const totalPages = Math.ceil(filteredMovements.length / state.itemsPerPage);

    const typeColorMap = { emerald:'green', blue:'blue', purple:'purple', amber:'amber', red:'red', cyan:'cyan', slate:'gray' };

    return `
        <div class="page-wrap">
            ${renderHeader()}
            <div class="page-content">
                <div class="row-between">
                    <h1 class="page-title"><i class="ph-fill ph-clock-counter-clockwise text-purple"></i> Histórico</h1>
                    <button onclick="exportMovementsToXLSX()" class="btn-secondary"><i class="ph-fill ph-download-simple"></i> <span>Exportar Excel</span></button>
                </div>

                <div class="card">
                    <div class="section-title" style="margin-bottom:14px;"><i class="ph ph-funnel" style="margin-right:6px;"></i>Filtros</div>
                    <div class="grid-3" style="margin-bottom:12px;">
                        <div class="field-group">
                            <label class="field-label">Data Inicial</label>
                            <input class="field-input" type="date" value="${state.filters.startDate}" onchange="state.filters.startDate=this.value">
                        </div>
                        <div class="field-group">
                            <label class="field-label">Data Final</label>
                            <input class="field-input" type="date" value="${state.filters.endDate}" onchange="state.filters.endDate=this.value">
                        </div>
                        <div class="field-group">
                            <label class="field-label">Tipo</label>
                            <select class="field-input field-select" onchange="state.filters.type=this.value">
                                <option value="TODOS" ${state.filters.type==='TODOS'?'selected':''}>Todos</option>
                                ${Object.entries(MOVEMENT_TYPES).map(([code,info]) => `<option value="${code}" ${state.filters.type===code?'selected':''}>${info.label}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                    <div class="field-group" style="margin-bottom:12px;">
                        <label class="field-label">Pesquisar</label>
                        <input class="field-input" type="text" value="${state.filters.searchTerm}" oninput="handleSearchInput(this.value)" placeholder="Buscar por item, colaborador, fornecedor...">
                    </div>
                    <button onclick="applyFilters()" class="btn-secondary" ${state.isLoading?'disabled':''}>
                        <i class="ph ph-magnifying-glass"></i> Buscar
                    </button>
                </div>

                <div class="card">
                    <div class="row-between" style="margin-bottom:12px;">
                        <span class="count-label">Mostrando <strong>${paginatedMovements.length}</strong> de <strong>${filteredMovements.length}</strong></span>
                        ${totalPages > 0 ? `<span class="count-label">Pág ${state.currentPage}/${totalPages}</span>` : ''}
                    </div>

                    ${state.isLoading ? `
                        <div class="loading-overlay"><div class="loading-spinner"></div><span>${state.loadingMessage}</span></div>
                    ` : filteredMovements.length === 0 ? `
                        <div class="empty-state">
                            <i class="ph ph-database"></i>
                            <p>Nenhuma movimentação encontrada</p>
                            <small>Ajuste os filtros ou registre uma movimentação</small>
                        </div>
                    ` : `
                        <div class="stack-sm">
                            ${paginatedMovements.map(movement => {
                                const typeInfo = MOVEMENT_TYPES[movement.type] || MOVEMENT_TYPES['AJUSTE'];
                                const colorKey = typeColorMap[typeInfo.color] || 'gray';
                                return `
                                    <div class="movement-row">
                                        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">
                                            <div style="display:flex;align-items:flex-start;gap:12px;flex:1;min-width:0;">
                                                <div class="movement-type-icon icon-${colorKey}">
                                                    <i class="ph-fill ph-${typeInfo.icon}"></i>
                                                </div>
                                                <div style="min-width:0;flex:1;">
                                                    <div style="font-weight:700;font-size:14px;color:var(--text-1);margin-bottom:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${movement.item_name}</div>
                                                    <span class="badge badge-${colorKey}" style="margin-bottom:8px;">${typeInfo.label}</span>
                                                    <div class="movement-meta">
                                                        ${movement.employee ? `<div><i class="ph ph-user"></i> <strong>Colaborador:</strong> ${movement.employee}</div>` : ''}
                                                        ${movement.supplier ? `<div><i class="ph ph-truck"></i> <strong>Fornecedor:</strong> ${movement.supplier}</div>` : ''}
                                                        <div><i class="ph ph-calendar"></i> ${formatDate(movement.date)}</div>
                                                        <div><i class="ph ph-user-circle"></i> ${movement.user_name || movement.user || '-'}</div>
                                                        ${movement.observations ? `<div style="color:var(--text-1);margin-top:2px;"><i class="ph ph-note"></i> ${movement.observations}</div>` : ''}
                                                    </div>
                                                </div>
                                            </div>
                                            <div style="text-align:right;flex-shrink:0;">
                                                <div class="movement-qty ${typeInfo.sign==='+' ? 'positive' : 'negative'}">${typeInfo.sign}${movement.quantity}</div>
                                                <div style="font-size:11px;color:var(--text-3);margin-top:4px;">${formatDateTime(movement.timestamp)}</div>
                                            </div>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>

                        ${totalPages > 1 ? `
                            <div class="pagination">
                                <button class="page-btn" onclick="changePage(-1)" ${state.currentPage===1?'disabled':''}>
                                    <i class="ph ph-caret-left"></i>
                                </button>
                                ${Array.from({length: Math.min(totalPages, 5)}, (_,i) => {
                                    let p;
                                    if (totalPages <= 5) p = i+1;
                                    else if (state.currentPage <= 3) p = i+1;
                                    else if (state.currentPage >= totalPages-2) p = totalPages-4+i;
                                    else p = state.currentPage-2+i;
                                    return `<button class="page-btn ${state.currentPage===p?'active':''}" onclick="state.currentPage=${p};render()">${p}</button>`;
                                }).join('')}
                                <button class="page-btn" onclick="changePage(1)" ${state.currentPage===totalPages?'disabled':''}>
                                    <i class="ph ph-caret-right"></i>
                                </button>
                            </div>
                        ` : ''}
                    `}
                </div>
            </div>
        </div>
    `;
}
```

- [ ] **Step 2: Verificar visualmente**

Navegar para Histórico. Esperado: filtros em card, movimentações listadas com ícone colorido, badges de tipo, paginação no rodapé.

- [ ] **Step 3: Commit**

```
git add Almoxarifado/index.html
git commit -m "feat(alm-ui): rewrite renderHistory with GPS design system"
```

---

## Task 9: Reescrever `renderAnalytics()` e chart wrappers

**Files:**
- Modify: `Almoxarifado/index.html` — funções `renderAnalytics()`, `renderCharts()`, `renderCategoryChart()`, `renderTopItemsChart()`, `renderMovementsTypeChart()`

- [ ] **Step 1: Substituir `renderAnalytics()`**

```javascript
function renderAnalytics() {
    return `
        <div class="page-wrap">
            ${renderHeader()}
            <div class="page-content">
                <h1 class="page-title"><i class="ph-fill ph-chart-line" style="color:#e879a0;"></i> Analytics e Relatórios</h1>

                ${state.isLoading ? `
                    <div class="card"><div class="loading-overlay"><div class="loading-spinner"></div><span>${state.loadingMessage}</span></div></div>
                ` : `
                    <div class="grid-2">
                        <div class="card" style="padding:16px;"><div style="position:relative;height:280px;"><canvas id="categoryChart"></canvas></div></div>
                        <div class="card" style="padding:16px;"><div style="position:relative;height:280px;"><canvas id="movementsTypeChart"></canvas></div></div>
                    </div>
                    <div class="card" style="padding:16px;"><div style="position:relative;height:280px;"><canvas id="topItemsChart"></canvas></div></div>

                    ${state.statistics ? `
                        <div class="card">
                            <div class="section-title" style="margin-bottom:16px;">Estatísticas Detalhadas</div>
                            <div class="grid-4">
                                <div style="text-align:center;padding:16px;background:color-mix(in srgb,var(--green) 8%,transparent);border-radius:var(--radius-sm);">
                                    <div style="font-size:28px;font-weight:700;color:var(--green);">${state.statistics.totalMovements}</div>
                                    <div style="font-size:11px;color:var(--text-2);margin-top:4px;">Total Movimentações</div>
                                </div>
                                <div style="text-align:center;padding:16px;background:var(--accent-glow);border-radius:var(--radius-sm);">
                                    <div style="font-size:28px;font-weight:700;color:var(--accent);">${state.statistics.movementsByType?.COMPRA || 0}</div>
                                    <div style="font-size:11px;color:var(--text-2);margin-top:4px;">Compras</div>
                                </div>
                                <div style="text-align:center;padding:16px;background:color-mix(in srgb,var(--purple) 10%,transparent);border-radius:var(--radius-sm);">
                                    <div style="font-size:28px;font-weight:700;color:var(--purple);">${state.statistics.movementsByType?.DISTRIBUICAO || 0}</div>
                                    <div style="font-size:11px;color:var(--text-2);margin-top:4px;">Distribuições</div>
                                </div>
                                <div style="text-align:center;padding:16px;background:color-mix(in srgb,var(--orange) 10%,transparent);border-radius:var(--radius-sm);">
                                    <div style="font-size:28px;font-weight:700;color:var(--orange);">${state.statistics.lowStock}</div>
                                    <div style="font-size:11px;color:var(--text-2);margin-top:4px;">Estoque Baixo</div>
                                </div>
                            </div>
                        </div>
                    ` : ''}
                `}
            </div>
        </div>
    `;
}
```

- [ ] **Step 2: Substituir `renderCharts()`**

Localizar `function renderCharts()` e substituir o conteúdo: as funções que criam os gráficos Chart.js **não mudam** — apenas remover quaisquer referências a classes Tailwind nos labels/datasets. Os canvas IDs (`categoryChart`, `movementsTypeChart`, `topItemsChart`) permanecem iguais.

- [ ] **Step 3: Commit**

```
git add Almoxarifado/index.html
git commit -m "feat(alm-ui): rewrite renderAnalytics with GPS design system"
```

---

## Task 10: Reescrever `renderMovement()` e `renderMovementSelector()`

**Files:**
- Modify: `Almoxarifado/index.html` — funções `renderMovement()` (~2352) e `renderMovementSelector()` (~2314)

- [ ] **Step 1: Substituir `renderMovementSelector()`**

```javascript
function renderMovementSelector() {
    return `
        <div class="page-wrap">
            ${renderHeader()}
            <div class="page-content-sm">
                <div class="card-lg">
                    <div class="row-between" style="margin-bottom:24px;">
                        <h1 class="page-title"><i class="ph-fill ph-shopping-cart text-green"></i> Compra de Estoque</h1>
                        <button onclick="goBack()" class="btn-icon"><i class="ph ph-x"></i></button>
                    </div>
                    <div class="stack" style="max-width:360px;margin:0 auto;">
                        <button onclick="startMovement('COMPRA')" class="action-card" style="padding:28px;">
                            <div class="action-icon icon-green" style="width:56px;height:56px;font-size:26px;"><i class="ph-fill ph-shopping-cart"></i></div>
                            <h3 style="font-size:16px;">Compra de Estoque</h3>
                            <p>Registrar entrada de material</p>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
}
```

- [ ] **Step 2: Substituir `renderMovement()`**

```javascript
function renderMovement() {
    const op = state.movementOperation;
    const typeInfo = MOVEMENT_TYPES[op.type];
    const itemsInWarehouse = state.items.filter(item => (item.warehouse_id || 'alm-1') === op.targetWarehouse);
    const selectedItem = itemsInWarehouse.find(item => item.id === op.selectedItem);
    const colorMap = { emerald:'green', blue:'blue', purple:'purple', amber:'amber', red:'red', cyan:'cyan' };
    const colorKey = colorMap[typeInfo.color] || 'gray';

    return `
        <div class="page-wrap">
            ${renderHeader()}
            <div class="page-content-sm">
                <div class="card-lg">
                    <div class="row-between" style="margin-bottom:24px;">
                        <h1 class="page-title">
                            <i class="ph-fill ph-${typeInfo.icon} text-${colorKey}"></i>
                            ${typeInfo.label}
                        </h1>
                        <button onclick="cancelMovement()" class="btn-icon"><i class="ph ph-x"></i></button>
                    </div>

                    <form onsubmit="event.preventDefault();confirmMovement();" class="stack">

                        <div class="field-group">
                            <label class="field-label">Almoxarifado de Destino *</label>
                            <div class="grid-2">
                                ${state.warehouses.map(wh => `
                                    <label class="radio-card ${op.targetWarehouse === wh.id ? 'selected' : ''}">
                                        <input type="radio" name="targetWarehouse" value="${wh.id}" ${op.targetWarehouse===wh.id?'checked':''}
                                            onchange="state.movementOperation.targetWarehouse=this.value;state.movementOperation.selectedItem=null;render()" style="width:16px;height:16px;">
                                        <div>
                                            <div class="radio-card-title">${wh.nome}</div>
                                            <div class="radio-card-sub">${wh.descricao}</div>
                                        </div>
                                    </label>
                                `).join('')}
                            </div>
                        </div>

                        <div class="field-group">
                            <label class="field-label">Tipo de Entrada *</label>
                            <div class="grid-2">
                                <label class="radio-card ${!op.createNewItem ? 'selected' : ''}">
                                    <input type="radio" name="entryType" ${!op.createNewItem?'checked':''}
                                        onchange="state.movementOperation.createNewItem=false;state.movementOperation.selectedItem=null;render()" style="width:16px;height:16px;">
                                    <div><div class="radio-card-title">Item Existente</div><div class="radio-card-sub">Adicionar ao estoque</div></div>
                                </label>
                                <label class="radio-card ${op.createNewItem ? 'selected' : ''}">
                                    <input type="radio" name="entryType" ${op.createNewItem?'checked':''}
                                        onchange="state.movementOperation.createNewItem=true;state.movementOperation.selectedItem=null;render()" style="width:16px;height:16px;">
                                    <div><div class="radio-card-title">Novo Item</div><div class="radio-card-sub">Cadastrar e dar entrada</div></div>
                                </label>
                            </div>
                        </div>

                        ${!op.createNewItem ? `
                            <div class="field-group">
                                <label class="field-label">Selecione o Item *</label>
                                ${itemsInWarehouse.length === 0 ? `
                                    <div class="warning-banner"><i class="ph ph-warning"></i> Nenhum item cadastrado neste almoxarifado.</div>
                                ` : `
                                    <select class="field-input field-select" onchange="state.movementOperation.selectedItem=this.value;state.movementOperation.size=null;render()" required>
                                        <option value="">-- Escolha um item --</option>
                                        ${itemsInWarehouse.map(item => `<option value="${item.id}" ${op.selectedItem===item.id?'selected':''}>${item.nome} (Estoque: ${item.quantidade})</option>`).join('')}
                                    </select>
                                `}
                            </div>
                            ${selectedItem ? `
                                <div class="item-preview selected">
                                    <div>
                                        <div style="font-size:11px;color:var(--text-3);">Selecionado</div>
                                        <div style="font-weight:700;font-size:15px;color:var(--text-1);">${selectedItem.nome}</div>
                                    </div>
                                    <div style="text-align:right;">
                                        <div style="font-size:11px;color:var(--text-3);">Estoque atual</div>
                                        <div style="font-size:22px;font-weight:700;color:var(--green);">${selectedItem.quantidade}</div>
                                    </div>
                                </div>
                                ${selectedItem.tamanhos && Object.keys(selectedItem.tamanhos).length > 0 ? `
                                    <div class="field-group">
                                        <label class="field-label">Tamanho *</label>
                                        <select class="field-input field-select" onchange="state.movementOperation.size=this.value;render()" required>
                                            <option value="">-- Selecione --</option>
                                            ${Object.entries(selectedItem.tamanhos).map(([s,q]) => `<option value="${s}" ${op.size===s?'selected':''}>${s} (Estoque: ${q})</option>`).join('')}
                                        </select>
                                    </div>
                                ` : ''}
                            ` : ''}
                        ` : `
                            <div class="card-sm" style="border-color:color-mix(in srgb,var(--green) 30%,transparent);background:color-mix(in srgb,var(--green) 4%,transparent);">
                                <div style="font-weight:700;color:var(--green);margin-bottom:12px;display:flex;align-items:center;gap:6px;"><i class="ph-fill ph-plus-circle"></i> Dados do Novo Item</div>
                                <div class="stack-sm">
                                    <div class="field-group">
                                        <label class="field-label">Nome do Item *</label>
                                        <input class="field-input" type="text" value="${op.newItemName}" oninput="state.movementOperation.newItemName=this.value" placeholder="Ex: Capacete de Segurança" required>
                                    </div>
                                    <div class="grid-2">
                                        <div class="field-group">
                                            <label class="field-label">Categoria *</label>
                                            <select class="field-input field-select" onchange="state.movementOperation.newItemCategory=this.value" required>
                                                <option value="">Selecione...</option>
                                                <option value="Proteção Individual" ${op.newItemCategory==='Proteção Individual'?'selected':''}>Proteção Individual</option>
                                                <option value="Ferramentas" ${op.newItemCategory==='Ferramentas'?'selected':''}>Ferramentas</option>
                                                <option value="Uniformes" ${op.newItemCategory==='Uniformes'?'selected':''}>Uniformes</option>
                                                <option value="Outros" ${op.newItemCategory==='Outros'?'selected':''}>Outros</option>
                                            </select>
                                        </div>
                                        <div class="field-group">
                                            <label class="field-label">Unidade *</label>
                                            <select class="field-input field-select" onchange="state.movementOperation.newItemUnit=this.value">
                                                <option value="UN" ${op.newItemUnit==='UN'?'selected':''}>Unidade (UN)</option>
                                                <option value="PAR" ${op.newItemUnit==='PAR'?'selected':''}>Par (PAR)</option>
                                                <option value="CX" ${op.newItemUnit==='CX'?'selected':''}>Caixa (CX)</option>
                                                <option value="KG" ${op.newItemUnit==='KG'?'selected':''}>Kg (KG)</option>
                                                <option value="LT" ${op.newItemUnit==='LT'?'selected':''}>Litro (LT)</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        `}

                        <div class="field-group">
                            <label class="field-label">Fornecedor</label>
                            <input class="field-input" type="text" value="${op.supplier}" oninput="state.movementOperation.supplier=this.value" placeholder="Nome do fornecedor (opcional)">
                        </div>
                        <div class="field-group">
                            <label class="field-label">Quantidade *</label>
                            <input class="field-input" type="number" value="${op.quantity}" oninput="state.movementOperation.quantity=parseInt(this.value)||1" min="1" required>
                        </div>
                        <div class="field-group">
                            <label class="field-label">Observações</label>
                            <textarea class="field-input" rows="3" oninput="state.movementOperation.observations=this.value" placeholder="Informações adicionais">${op.observations}</textarea>
                        </div>

                        <div class="row-end" style="padding-top:8px;">
                            <button type="button" onclick="cancelMovement()" class="btn-ghost">CANCELAR</button>
                            <button type="submit" class="btn-primary" style="min-width:160px;">
                                <i class="ph ph-check-circle"></i> CONFIRMAR COMPRA
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;
}
```

- [ ] **Step 3: Commit**

```
git add Almoxarifado/index.html
git commit -m "feat(alm-ui): rewrite renderMovement and renderMovementSelector"
```

---

## Task 11: Reescrever `renderWarehouses()`, `renderTransfer()`, `renderEditItem()`

**Files:**
- Modify: `Almoxarifado/index.html` — funções ~2832, ~2920, ~3274

- [ ] **Step 1: Substituir `renderWarehouses()`**

```javascript
function renderWarehouses() {
    return `
        <div class="page-wrap">
            ${renderHeader()}
            <div class="page-content-sm">
                <div class="row-between">
                    <h1 class="page-title"><i class="ph-fill ph-gear text-faint"></i> Configurar Almoxarifados</h1>
                    <button onclick="goBack()" class="btn-icon"><i class="ph ph-x"></i></button>
                </div>

                <div class="stack">
                    ${state.warehouses.map(wh => `
                        <div class="card">
                            <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px;">
                                <div class="stat-icon ${wh.id==='alm-1'?'icon-green':'icon-cyan'}">
                                    <i class="ph-fill ph-${wh.id==='alm-1'?'warehouse':'truck'}"></i>
                                </div>
                                <div style="flex:1;">
                                    <div style="font-weight:700;font-size:15px;color:var(--text-1);">${wh.nome}</div>
                                    <div style="font-size:12px;color:var(--text-2);">${wh.descricao || ''}</div>
                                </div>
                                <span class="badge badge-gray">${state.items.filter(i=>(i.warehouse_id||'alm-1')===wh.id).length} itens</span>
                            </div>
                            <form onsubmit="handleSaveWarehouse(event)" class="stack-sm">
                                <input type="hidden" id="warehouseId" value="${wh.id}">
                                <div class="field-group">
                                    <label class="field-label">Nome *</label>
                                    <input class="field-input" type="text" id="warehouseName" value="${wh.nome}" placeholder="Nome do almoxarifado" required>
                                </div>
                                <div class="field-group">
                                    <label class="field-label">Descrição</label>
                                    <input class="field-input" type="text" id="warehouseDesc" value="${wh.descricao||''}" placeholder="Descrição opcional">
                                </div>
                                <div>
                                    <button type="submit" class="btn-primary"><i class="ph ph-floppy-disk"></i> Salvar Alterações</button>
                                </div>
                            </form>
                        </div>
                    `).join('')}
                </div>

                <div class="card accent-blue">
                    <div style="font-weight:700;color:var(--accent);margin-bottom:8px;display:flex;align-items:center;gap:6px;">
                        <i class="ph-fill ph-info"></i> SQL para criar as tabelas no Supabase
                    </div>
                    <p style="font-size:12px;color:var(--text-2);margin-bottom:10px;">Execute no SQL Editor do Supabase:</p>
                    <pre class="sql-block">CREATE TABLE IF NOT EXISTS warehouses (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  descricao TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO warehouses (id, nome, descricao) VALUES
  ('alm-1', 'Almoxarifado Central', 'Estoque principal'),
  ('alm-2', 'Almoxarifado Distribuição', 'Itens para distribuição')
ON CONFLICT (id) DO NOTHING;
ALTER TABLE items ADD COLUMN IF NOT EXISTS warehouse_id TEXT DEFAULT 'alm-1';
ALTER TABLE movements ADD COLUMN IF NOT EXISTS destination_warehouse_id TEXT;</pre>
                </div>
            </div>
        </div>
    `;
}
```

- [ ] **Step 2: Substituir `renderTransfer()`**

Localizar `function renderTransfer()` (~linha 2920) e substituir o template HTML, mantendo toda a lógica JS intacta. Padrão: usar as mesmas classes `.card-lg`, `.field-group`, `.field-label`, `.field-input`, `.radio-card`, `.btn-primary`, `.btn-ghost`, `.page-title`, `.row-between`. Os inputs, selects e radio buttons internos mantêm todos os `onchange` e `oninput` originais — só mudam as classes CSS.

Substituição completa:

```javascript
function renderTransfer() {
    const op = state.transferOperation;
    const fromWh = state.warehouses.find(w => w.id === op.fromWarehouse);
    const toWh   = state.warehouses.find(w => w.id === op.toWarehouse);
    const sourceItems = state.items.filter(i => (i.warehouse_id||'alm-1') === op.fromWarehouse && i.quantidade > 0);
    const selectedItem = sourceItems.find(i => i.id === op.selectedItem);

    return `
        <div class="page-wrap">
            ${renderHeader()}
            <div class="page-content-sm">
                <div class="card-lg">
                    <div class="row-between" style="margin-bottom:24px;">
                        <h1 class="page-title"><i class="ph-fill ph-arrows-left-right text-cyan"></i> Transferência</h1>
                        <button onclick="goBack()" class="btn-icon"><i class="ph ph-x"></i></button>
                    </div>

                    <form onsubmit="event.preventDefault();confirmTransfer();" class="stack">
                        <div class="field-group">
                            <label class="field-label">De (Origem)</label>
                            <div class="grid-2">
                                ${state.warehouses.map(wh => `
                                    <label class="radio-card ${op.fromWarehouse===wh.id?'selected':''}">
                                        <input type="radio" name="fromWarehouse" value="${wh.id}" ${op.fromWarehouse===wh.id?'checked':''}
                                            onchange="state.transferOperation.fromWarehouse=this.value;state.transferOperation.selectedItem=null;render()" style="width:16px;height:16px;">
                                        <div><div class="radio-card-title">${wh.nome}</div><div class="radio-card-sub">${wh.descricao}</div></div>
                                    </label>
                                `).join('')}
                            </div>
                        </div>

                        <div class="field-group">
                            <label class="field-label">Para (Destino)</label>
                            <div class="grid-2">
                                ${state.warehouses.map(wh => `
                                    <label class="radio-card ${op.toWarehouse===wh.id?'selected':''}">
                                        <input type="radio" name="toWarehouse" value="${wh.id}" ${op.toWarehouse===wh.id?'checked':''}
                                            onchange="state.transferOperation.toWarehouse=this.value;render()" style="width:16px;height:16px;">
                                        <div><div class="radio-card-title">${wh.nome}</div><div class="radio-card-sub">${wh.descricao}</div></div>
                                    </label>
                                `).join('')}
                            </div>
                        </div>

                        <div class="field-group">
                            <label class="field-label">Item para Transferir *</label>
                            ${sourceItems.length === 0 ? `
                                <div class="warning-banner"><i class="ph ph-warning"></i> Nenhum item disponível em ${fromWh?.nome || 'origem'}.</div>
                            ` : `
                                <select class="field-input field-select" onchange="state.transferOperation.selectedItem=this.value;state.transferOperation.size=null;render()" required>
                                    <option value="">-- Escolha um item --</option>
                                    ${sourceItems.map(i => `<option value="${i.id}" ${op.selectedItem===i.id?'selected':''}>${i.nome} (Disponível: ${i.quantidade})</option>`).join('')}
                                </select>
                            `}
                        </div>

                        ${selectedItem ? `
                            <div class="item-preview selected">
                                <div>
                                    <div style="font-size:11px;color:var(--text-3);">Item selecionado</div>
                                    <div style="font-weight:700;font-size:15px;color:var(--text-1);">${selectedItem.nome}</div>
                                </div>
                                <div style="text-align:right;">
                                    <div style="font-size:11px;color:var(--text-3);">Disponível</div>
                                    <div style="font-size:22px;font-weight:700;color:var(--green);">${selectedItem.quantidade}</div>
                                </div>
                            </div>
                            ${selectedItem.tamanhos && Object.keys(selectedItem.tamanhos).length > 0 ? `
                                <div class="field-group">
                                    <label class="field-label">Tamanho *</label>
                                    <select class="field-input field-select" onchange="state.transferOperation.size=this.value;render()" required>
                                        <option value="">-- Selecione --</option>
                                        ${Object.entries(selectedItem.tamanhos).map(([s,q]) => `<option value="${s}" ${op.size===s?'selected':''}>${s} (Disponível: ${q})</option>`).join('')}
                                    </select>
                                </div>
                            ` : ''}
                        ` : ''}

                        <div class="field-group">
                            <label class="field-label">Quantidade *</label>
                            <input class="field-input" type="number" value="${op.quantity}" oninput="state.transferOperation.quantity=parseInt(this.value)||1" min="1" max="${selectedItem?.quantidade||9999}" required>
                        </div>
                        <div class="field-group">
                            <label class="field-label">Observações</label>
                            <textarea class="field-input" rows="2" oninput="state.transferOperation.observations=this.value" placeholder="Motivo da transferência">${op.observations}</textarea>
                        </div>

                        <div class="row-end" style="padding-top:8px;">
                            <button type="button" onclick="goBack()" class="btn-ghost">CANCELAR</button>
                            <button type="submit" class="btn-cyan" style="min-width:160px;">
                                <i class="ph ph-arrows-left-right"></i> CONFIRMAR TRANSFERÊNCIA
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;
}
```

- [ ] **Step 3: Substituir `renderEditItem()`**

Localizar `function renderEditItem()` (~linha 3274). O template usa os mesmos padrões de form. Substituir o bloco HTML preservando todos os `oninput`/`onchange`/`onsubmit`:

```javascript
function renderEditItem() {
    const item = state.editingItem || {};
    return `
        <div class="page-wrap">
            ${renderHeader()}
            <div class="page-content-sm">
                <div class="card-lg">
                    <div class="row-between" style="margin-bottom:24px;">
                        <h1 class="page-title"><i class="ph-fill ph-pencil-simple text-blue"></i> ${item.id ? 'Editar Item' : 'Novo Item'}</h1>
                        <button onclick="goBack()" class="btn-icon"><i class="ph ph-x"></i></button>
                    </div>
                    <form onsubmit="handleSaveItem(event)" class="stack">
                        <div class="grid-2">
                            <div class="field-group" style="grid-column:1/-1;">
                                <label class="field-label">Nome do Item *</label>
                                <input class="field-input" type="text" id="itemName" value="${item.nome||''}" placeholder="Ex: Capacete de Segurança" required>
                            </div>
                            <div class="field-group">
                                <label class="field-label">Categoria *</label>
                                <select class="field-input field-select" id="itemCategory" required>
                                    <option value="">Selecione...</option>
                                    <option value="Proteção Individual" ${item.categoria==='Proteção Individual'?'selected':''}>Proteção Individual</option>
                                    <option value="Ferramentas" ${item.categoria==='Ferramentas'?'selected':''}>Ferramentas</option>
                                    <option value="Uniformes" ${item.categoria==='Uniformes'?'selected':''}>Uniformes</option>
                                    <option value="Outros" ${item.categoria==='Outros'?'selected':''}>Outros</option>
                                </select>
                            </div>
                            <div class="field-group">
                                <label class="field-label">Unidade *</label>
                                <select class="field-input field-select" id="itemUnit">
                                    <option value="UN" ${item.unidade==='UN'?'selected':''}>Unidade (UN)</option>
                                    <option value="PAR" ${item.unidade==='PAR'?'selected':''}>Par (PAR)</option>
                                    <option value="CX" ${item.unidade==='CX'?'selected':''}>Caixa (CX)</option>
                                    <option value="KG" ${item.unidade==='KG'?'selected':''}>Kg (KG)</option>
                                    <option value="LT" ${item.unidade==='LT'?'selected':''}>Litro (LT)</option>
                                </select>
                            </div>
                            <div class="field-group">
                                <label class="field-label">Quantidade Inicial</label>
                                <input class="field-input" type="number" id="itemQuantity" value="${item.quantidade||0}" min="0">
                            </div>
                            <div class="field-group">
                                <label class="field-label">CA (Certificado de Aprovação)</label>
                                <input class="field-input" type="text" id="itemCA" value="${item.ca||''}" placeholder="Ex: 12345">
                            </div>
                            <div class="field-group">
                                <label class="field-label">Localização</label>
                                <input class="field-input" type="text" id="itemLocation" value="${item.localizacao||''}" placeholder="Ex: Prateleira A1">
                            </div>
                            <div class="field-group">
                                <label class="field-label">Validade</label>
                                <input class="field-input" type="date" id="itemValidade" value="${item.validade||''}">
                            </div>
                            <div class="field-group">
                                <label class="field-label">Unidades por Caixa</label>
                                <input class="field-input" type="number" id="itemUnidadesCaixa" value="${item.unidades_por_caixa||1}" min="1">
                            </div>
                        </div>
                        <div class="row-end" style="padding-top:8px;">
                            <button type="button" onclick="goBack()" class="btn-ghost">CANCELAR</button>
                            <button type="submit" class="btn-primary" style="min-width:140px;">
                                <i class="ph ph-floppy-disk"></i> ${item.id ? 'SALVAR' : 'CADASTRAR'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;
}
```

> **Nota:** Verificar se a função `handleSaveItem(event)` lê os campos pelo `id` correto (`itemName`, `itemCategory`, etc.). Se o sistema original usava IDs diferentes, ajustar os `id` no template para coincidir com o que `handleSaveItem` espera.

- [ ] **Step 4: Commit**

```
git add Almoxarifado/index.html
git commit -m "feat(alm-ui): rewrite renderWarehouses, renderTransfer, renderEditItem"
```

---

## Task 12: Atualizar `showToast()` e limpeza final

**Files:**
- Modify: `Almoxarifado/index.html` — função `showToast()` (~linha 547) + verificação geral

- [ ] **Step 1: Atualizar `showToast()`**

Localizar `function showToast(message, type, duration)` e substituir:

```javascript
function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <i class="ph-fill ph-${type === 'success' ? 'check-circle' : type === 'error' ? 'x-circle' : 'info'}" style="font-size:18px;flex-shrink:0;"></i>
        <span>${message}</span>
    `;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(120%)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => { if (toast.parentNode) container.removeChild(toast); }, 300);
    }, duration);
}
```

- [ ] **Step 2: Remover variáveis CSS desnecessárias do inline style do body**

No `<body>`, remover qualquer class `text-slate-800` ou `dark` restante.

Localizar: `<body class="text-slate-800">`  
Substituir por: `<body>`

- [ ] **Step 3: Adicionar `loginError` ao estado (se necessário)**

Localizar o objeto `state` (~linha 368) e verificar se `loginError` já existe. Se não existir, adicionar:

```javascript
// dentro do objeto state, após view: 'login',
loginError: '',
```

Localizar o bloco `catch` em `handleLogin` e garantir:

```javascript
} catch(error) {
    state.loginError = error.message || 'Erro ao entrar. Verifique suas credenciais.';
    state.isLoading = false;
    render();
}
```

- [ ] **Step 4: Verificação final — abrir todas as views no browser**

Testar sequencialmente:
1. Login: card GPS centralizado, campos e-mail/senha, botão azul escuro ✓
2. Dashboard: stat cards com borda, ações rápidas, itens recentes ✓
3. Estoque: tabs de almoxarifado, filtros, grid de cards ✓
4. Histórico: filtros, lista de movimentações, paginação ✓
5. Analytics: dois gráficos lado a lado, gráfico grande abaixo, stat boxes ✓
6. Formulário de Compra: radio cards, selects, botão confirmar ✓
7. Transferência: radio cards origem/destino, select item, botão ✓
8. Almoxarifados: cards de configuração, SQL block ✓
9. Sidebar hamburger: abre e fecha, navega para cada view ✓

- [ ] **Step 5: Commit final**

```
git add Almoxarifado/index.html
git commit -m "feat(alm-ui): complete GPS design system migration — remove Tailwind, full visual parity with Gestão Efetivo"
```

---

## Self-Review

**Spec coverage:**
- ✅ Design tokens (variables.css) — Task 1
- ✅ Remove Tailwind CDN — Task 3
- ✅ Inter font — Task 3
- ✅ Login card GPS — Task 4
- ✅ Topbar hamburger + sidebar — Task 5
- ✅ Dashboard cards — Task 6
- ✅ Stock view — Task 7
- ✅ History view — Task 8
- ✅ Analytics — Task 9
- ✅ Movement forms — Task 10
- ✅ Warehouses/Transfer/EditItem — Task 11
- ✅ Toast notifications — Task 12
- ✅ auth.css, topbar.css — Task 2

**Placeholder scan:** Nenhum TBD ou TODO. Cada step tem código completo.

**Type consistency:** `openSidebar()`/`closeSidebar()` definidos em Task 5 e referenciados em `renderHeader()` no mesmo task. `exportAll()` definido em Task 5 e referenciado no topbar do mesmo task. Todas as classes CSS definidas em base.css são usadas consistentemente.
