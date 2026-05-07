# Spec: UI Redesign — Almoxarifado → Aparência Gestão Efetivo

**Data:** 2026-05-07  
**Status:** Aprovado pelo usuário

---

## Objetivo

Aplicar o design system visual do sistema Gestão Efetivo ao sistema Almoxarifado EPI, incluindo paleta de cores, tipografia, topbar com hamburger menu, sidebar de navegação deslizante e estilo de cards/painéis. A lógica JavaScript permanece intacta — apenas o HTML dos templates e o CSS mudam.

---

## Arquitetura

### O que é removido do `<head>`
- `<script src="https://cdn.tailwindcss.com">` e seu bloco de config inline
- Comentário `tailwind.config` com `darkMode: 'class'`
- Bloco `<style>` interno com override de background e demais regras inline

### O que é adicionado ao `<head>`
- `<link>` para Google Fonts Inter (weights 300, 400, 500, 600, 700)
- Links para os 10 arquivos CSS modulares (em ordem de dependência)

### Phosphor Icons
Mantido (`@phosphor-icons/web`). Os ícones continuam funcionando; apenas as classes de cor Tailwind são substituídas por classes CSS do novo design system.

---

## Estrutura de Arquivos CSS

```
Almoxarifado/css/
  variables.css   → design tokens
  base.css        → reset, body, layout, botões, formulários, loading
  auth.css        → tela de login
  topbar.css      → topbar + sidebar hamburger
  dashboard.css   → stat cards, quick actions, recent items
  stock.css       → view de estoque (tabela, filtros, badges)
  history.css     → view de histórico
  analytics.css   → view de analytics/gráficos
  movement.css    → formulários de movimentação e transferência
  modal.css       → modais e overlays
```

---

## Design Tokens (`variables.css`)

Idênticos ao Gestão Efetivo:

```css
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
  --shadow: 0 2px 12px #0000000a;
  --shadow-lg: 0 6px 28px #00000010;
}
```

---

## Componente: Login (`auth.css` + `renderLogin()`)

### Estrutura HTML do novo template
```
#login-screen
  .login-box
    .login-header
      .login-header-title
        .login-brand-label  "Central GPS · Grupo GPS"
        .login-brand-name   "Mecanizada"
      .login-icon  (SVG grade 4x4)
    .login-system-row
      .login-system-icon  (SVG caixa/package)
      .login-system-name  "Almoxarifado EPI"
    .login-form-area
      .login-form-section
        .login-input-group  EMAIL
        .login-input-group  SENHA
        button.login-btn  "ENTRAR"
        .login-error  (mensagem de erro)
  .login-footer  "Desenvolvido por ... — Grupo GPS"
```

### CSS
Arquivo `auth.css` copiado do Gestão Efetivo com adaptação do `.login-system-icon` para usar ícone de caixa (package) no lugar do ícone de pessoas.

---

## Componente: Topbar + Sidebar (`topbar.css` + `renderHeader()`)

### Estrutura HTML do novo template
```
#global-sync-bar  (barra de progresso 3px, opcional)
#topbar
  #topbar-left
    button#nav-menu-btn  (hamburger)
  .logo (centro absoluto)
    .logo-gps     "Grupo GPS"
    .logo-divider
    .logo-gestao  "Almoxarifado EPI"
  #topbar-right
    button#dark-mode-btn  (lua/sol SVG)
    button#topbar-export-btn  (download SVG)
    button#logout-btn  (sair SVG)

#nav-menu-overlay.hidden
  .nav-menu-panel
    .nav-menu-header  (Logo GPS SVG grande)
    .nav-menu-body
      button.nav-menu-item[data-view="dashboard"]   Dashboard
      button.nav-menu-item[data-view="stock"]        Estoque
      button.nav-menu-item[data-view="history"]      Histórico
      button.nav-menu-item[data-view="analytics"]    Analytics
      button.nav-menu-item[data-view="transfer"]     Transferência
      button.nav-menu-item[data-view="warehouses"]   Almoxarifados
    .nav-menu-footer
      .nav-menu-user-info  (nome do usuário)
      button.nav-logout-btn  Sair
```

### Comportamento JS
- `nav-menu-btn` click → remove classe `hidden` do overlay
- Click no overlay → adiciona `hidden`
- `data-view` nos botões → chama `navigateTo(view)`
- Item ativo recebe classe `.active` baseado em `state.view`

### CSS
Arquivo `topbar.css` copiado do Gestão Efetivo sem alterações funcionais.

---

## Mapeamento de Classes Tailwind → Design System

| Tailwind | Nova Classe / CSS |
|---|---|
| `glass p-6 rounded-xl` | `.card` |
| `glass p-4 rounded-lg` | `.card-sm` |
| `min-h-screen pb-6` | `.page-wrap` |
| `main p-4 max-w-7xl mx-auto space-y-6` | `.page-content` |
| `text-emerald-400/600` | `color: var(--green)` |
| `text-blue-400/600` | `color: var(--accent)` |
| `text-amber-400/600` | `color: var(--orange)` |
| `text-red-400/600` | `color: var(--red)` |
| `text-purple-400/600` | `color: var(--purple)` |
| `text-cyan-400/600` | `color: var(--cyan)` |
| `text-slate-500/600` | `color: var(--text-2)` |
| `text-slate-800` | `color: var(--text-1)` |
| `bg-emerald-500/20` | `background: color-mix(in srgb, var(--green) 15%, transparent)` |
| `font-mono` | `font-family: var(--font-display)` |
| `uppercase tracking-wider` | mantido inline ou classe `.label-caps` |
| `border-l-4 border-emerald-500` | `.stat-card.green` |
| `border-l-4 border-blue-500` | `.stat-card.blue` |
| `border-l-4 border-amber-500` | `.stat-card.amber` |

---

## Componente: Stat Cards (`dashboard.css`)

```css
.card {
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 24px;
}
.card-sm { padding: 16px; }

.stat-card { border-left: 3px solid var(--border); }
.stat-card.green { border-left-color: var(--green); }
.stat-card.blue  { border-left-color: var(--accent); }
.stat-card.amber { border-left-color: var(--orange); }
.stat-card.red   { border-left-color: var(--red); }

.stat-icon {
  width: 48px; height: 48px;
  border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
}
.stat-icon.green { background: color-mix(in srgb, var(--green) 12%, transparent); }
.stat-icon.blue  { background: var(--accent-glow); }
```

---

## Componente: Botões de Ação

```css
.btn-primary  → background: var(--accent)
.btn-danger   → background: var(--red)20, border var(--red)40
.btn-cancel   → background: var(--bg-2), border var(--border)
.action-btn   → quick action cards (hover border accent)
```

---

## Escopo de Mudanças — Funções Render

Todas as funções render no `<script>` têm seu HTML atualizado:

| Função | Linha | Mudança principal |
|---|---|---|
| `renderLogin()` | ~2035 | Novo HTML login-box conforme spec |
| `renderHeader()` | ~3497 | Novo topbar + overlay sidebar |
| `renderDashboard()` | ~2093 | Classes `.card`, `.stat-card`, `.page-content` |
| `renderAnalytics()` | ~2243 | Classes `.card`, `.page-content` |
| `renderMovementSelector()` | ~2314 | Classes `.card`, `.action-btn` |
| `renderMovement()` | ~2352 | Formulário com `.form-field`, `.card` |
| `renderStock()` | ~2598 | Tabela, filtros, badges com design system |
| `renderWarehouses()` | ~2832 | Cards com `.card`, `.form-field` |
| `renderTransfer()` | ~2920 | Formulário com `.form-field` |
| `renderHistory()` | ~3056 | Tabela com classes do design system |
| `renderEditItem()` | ~3274 | Formulário com `.form-field`, `.card` |
| `renderCharts()` | ~1803 | Wrapper `.card` para canvas |
| `renderCategoryChart()` | ~1818 | Wrapper `.card` |
| `renderTopItemsChart()` | ~1876 | Wrapper `.card` |
| `renderMovementsTypeChart()` | ~1936 | Wrapper `.card` |
| `showToast()` | ~547 | Classes `.toast`, `.toast-success`, etc. |

---

## O que NÃO muda

- Toda a lógica de negócio em JavaScript (Supabase, estado, cache, navegação)
- Estrutura do `<body>` base (`<div id="app">`, `<div id="toast-container">`)
- Bibliotecas externas: Supabase JS, Chart.js, SheetJS
- Phosphor Icons

---

## Critério de Sucesso

O Almoxarifado, quando aberto no browser, deve ser visualmente indistinguível do Gestão Efetivo em:
1. Paleta de cores (azuis GPS, cinzas, branco)
2. Tipografia (Inter em todas as telas)
3. Topbar com hamburger e sidebar deslizante
4. Login card com branding GPS
5. Cards/painéis com bordas sutis, sombras leves, raio 12px
