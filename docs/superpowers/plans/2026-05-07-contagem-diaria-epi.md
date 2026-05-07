# Contagem Diária EPI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remover campos CA/Validade/Localização da interface e implementar sistema de contagem diária por diferença para o Almoxarifado 2.

**Architecture:** Todo o sistema está em um único arquivo `index.html` com JS inline. Mudanças são cirúrgicas: edições nas funções `renderStock`, `renderEditItem`, `handleSaveItem`, `getFilteredItems` e na exportação Excel para remover campos. Em seguida, adicionar estado `contagem`, funções `navigateToContagem/loadContagem/saveContagem/loadContagemHistory/switchContagemTab` e a função `renderContagem`. CSS de suporte adicionado ao final de `base.css`.

**Tech Stack:** HTML/CSS/JS puro, Supabase JS v2 (CDN), Phosphor Icons, design system GPS (CSS custom properties). Sem framework de testes — verificação manual no browser.

---

## File Map

| Arquivo | Operação | O que muda |
|---|---|---|
| `Almoxarifado/index.html` | Modify | Remoção de CA/validade/localizacao de 6 locais; adição de estado, 5 funções e `renderContagem`; atualização do `render()` switch e `renderHeader()` |
| `Almoxarifado/css/base.css` | Modify | 7 novas classes CSS para a view de contagem |

---

## Task 1: Remover CA / Validade / Localização da lógica JS

**Files:**
- Modify: `Almoxarifado/index.html` (linhas ~83-93, ~1155-1168, ~1286-1299, ~1443-1461)

- [ ] **Step 1: Abrir o arquivo e localizar `state.filters`**

  Localizar o bloco `filters` dentro do `state` (aproximadamente linha 83). Ele contém `location: ''`. Remover apenas essa linha:

  **Antes:**
  ```js
              filters: {
                  startDate: getFirstDayOfMonth(),
                  endDate: getCurrentDate(),
                  type: 'TODOS',
                  searchTerm: '',
                  category: 'TODAS',
                  minQuantity: '',
                  maxQuantity: '',
                  location: '',
                  lowStockOnly: false
              },
  ```

  **Depois:**
  ```js
              filters: {
                  startDate: getFirstDayOfMonth(),
                  endDate: getCurrentDate(),
                  type: 'TODOS',
                  searchTerm: '',
                  category: 'TODAS',
                  minQuantity: '',
                  maxQuantity: '',
                  lowStockOnly: false
              },
  ```

- [ ] **Step 2: Remover ca/validade/localizacao do objeto `newItem` (linha ~1163)**

  Dentro da função `handleMovement` ou similar, localizar o objeto `newItem = { ... }` que contém `ca: '', validade: '', localizacao: ''`. Remover essas 3 linhas:

  **Antes:**
  ```js
                  ca: '',
                  validade: '',
                  localizacao: '',
                  observacoes: '',
  ```

  **Depois:**
  ```js
                  observacoes: '',
  ```

- [ ] **Step 3: Remover leituras de itemCA/itemValidity/itemLocation de `handleSaveItem` (linha ~1294)**

  Dentro de `handleSaveItem`, localizar o objeto `itemData = { ... }`. Remover as 3 linhas que lêem os campos removidos:

  **Antes:**
  ```js
                  ca: document.getElementById('itemCA').value,
                  validade: document.getElementById('itemValidity').value,
                  localizacao: document.getElementById('itemLocation').value,
                  observacoes: document.getElementById('itemObs').value,
  ```

  **Depois:**
  ```js
                  observacoes: document.getElementById('itemObs').value,
  ```

- [ ] **Step 4: Remover filtro de localização de `getFilteredItems` (linha ~1458)**

  Dentro de `getFilteredItems`, remover o bloco inteiro do filtro por localização:

  **Antes:**
  ```js
              // Filtro por localização
              if (state.filters.location) {
                  const loc = state.filters.location.toLowerCase();
                  filtered = filtered.filter(i => i.localizacao?.toLowerCase().includes(loc));
              }

              // Filtro por quantidade mínima
  ```

  **Depois:**
  ```js
              // Filtro por quantidade mínima
  ```

- [ ] **Step 5: Verificar no browser**

  Abrir `index.html` no browser (ou Live Server). Fazer login. Navegar para Estoque → Editar um item. Confirmar que os campos CA, Validade e Localização não aparecem mais no formulário. O formulário deve ter: Nome, Categoria, Unidade, Quantidade Inicial, Unidades por Caixa, Observações.

- [ ] **Step 6: Commit**

  ```bash
  git -C "Almoxarifado" add index.html
  git -C "Almoxarifado" commit -m "feat(epi): remove campos CA, validade e localizacao da logica JS"
  ```

---

## Task 2: Remover CA / Validade / Localização das funções de renderização e exportação

**Files:**
- Modify: `Almoxarifado/index.html` (linhas ~927, ~968-978, ~2140-2175, ~2190-2215, ~2550-2561)

- [ ] **Step 1: Atualizar `BASE_COLS` na exportação Excel (linha ~927)**

  Localizar a linha com `const BASE_COLS = [...]`. Remover as colunas CA, Validade, Localização:

  **Antes:**
  ```js
                  const BASE_COLS = ['#', 'Nome do Item', 'Categoria', 'Unidade', 'Qtd Total', 'CA', 'Validade', 'Localização', 'Observações'];
  ```

  **Depois:**
  ```js
                  const BASE_COLS = ['#', 'Nome do Item', 'Categoria', 'Unidade', 'Qtd Total', 'Observações'];
  ```

- [ ] **Step 2: Remover valores correspondentes na linha de dados do Excel (linha ~974)**

  Logo abaixo de `const BASE_COLS`, dentro de `buildSheet`, remover as 3 linhas de dados:

  **Antes:**
  ```js
                              item.quantidade || 0,
                              item.ca || '',
                              item.validade ? formatDate(item.validade) : '',
                              item.localizacao || '',
                              item.observacoes || '',
  ```

  **Depois:**
  ```js
                              item.quantidade || 0,
                              item.observacoes || '',
  ```

- [ ] **Step 3: Remover campo Localização dos filtros em `renderStock` (linha ~2150)**

  Dentro de `renderStock`, localizar a `<div class="grid-3"` que contém os filtros. Ela tem 3 campos: Categoria, Localização, e Estoque Baixo. Remover o campo Localização e mudar `grid-3` para `grid-2`:

  **Antes:**
  ```html
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
  ```

  **Depois:**
  ```html
                  <div class="grid-2" style="margin-bottom:12px;">
                      <div class="field-group">
                          <label class="field-label">Categoria</label>
                          <select class="field-input field-select" onchange="state.filters.category=this.value;render()">
                              <option value="TODAS">Todas</option>
                              ${categories.map(c => `<option value="${c}" ${state.filters.category===c?'selected':''}>${c}</option>`).join('')}
                          </select>
                      </div>
                      <div class="field-group" style="justify-content:flex-end;">
                          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding-top:20px;">
                              <input type="checkbox" ${state.filters.lowStockOnly?'checked':''} onchange="state.filters.lowStockOnly=this.checked;render()" style="width:16px;height:16px;">
                              <span style="font-size:13px;font-weight:600;color:var(--orange);">Estoque Baixo</span>
                          </label>
                      </div>
                  </div>
  ```

- [ ] **Step 4: Atualizar placeholder da busca e condição de "Limpar Filtros" (linha ~2163 e ~2172)**

  **Alterar placeholder da busca:**

  **Antes:**
  ```html
                      <input class="field-input" type="text" value="${state.filters.searchTerm}" oninput="handleSearchInput(this.value)" placeholder="Buscar por nome, categoria, CA...">
  ```

  **Depois:**
  ```html
                      <input class="field-input" type="text" value="${state.filters.searchTerm}" oninput="handleSearchInput(this.value)" placeholder="Buscar por nome ou categoria...">
  ```

  **Alterar condição e reset do botão Limpar Filtros:**

  **Antes:**
  ```js
                      ${state.filters.searchTerm || state.filters.category !== 'TODAS' || state.filters.location || state.filters.lowStockOnly ? `
                          <div style="margin-top:16px;">
                              <button onclick="state.filters={startDate:getFirstDayOfMonth(),endDate:getCurrentDate(),type:'TODOS',searchTerm:'',category:'TODAS',minQuantity:'',maxQuantity:'',location:'',lowStockOnly:false};render()" class="btn-secondary">Limpar Filtros</button>
                          </div>
  ```

  **Depois:**
  ```js
                      ${state.filters.searchTerm || state.filters.category !== 'TODAS' || state.filters.lowStockOnly ? `
                          <div style="margin-top:16px;">
                              <button onclick="state.filters={startDate:getFirstDayOfMonth(),endDate:getCurrentDate(),type:'TODOS',searchTerm:'',category:'TODAS',minQuantity:'',maxQuantity:'',lowStockOnly:false};render()" class="btn-secondary">Limpar Filtros</button>
                          </div>
  ```

- [ ] **Step 5: Remover badge CA e linhas de validade/localização dos cards em `renderStock` (linha ~2193)**

  **Antes (trecho dentro do `.map(item => ...`):**
  ```html
                              <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;">
                                  <span class="badge badge-blue">${item.categoria}</span>
                                  <span class="badge badge-gray">${item.unidade}</span>
                                  ${item.ca ? `<span class="badge badge-purple">CA ${item.ca}</span>` : ''}
                              </div>
  ```

  **Depois:**
  ```html
                              <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;">
                                  <span class="badge badge-blue">${item.categoria}</span>
                                  <span class="badge badge-gray">${item.unidade}</span>
                              </div>
  ```

  **Antes (linhas de localização e validade):**
  ```html
                              ${item.localizacao ? `<div style="font-size:12px;color:var(--text-2);margin-top:8px;"><i class="ph ph-map-pin"></i> ${item.localizacao}</div>` : ''}
                              ${item.validade ? `<div style="font-size:12px;color:var(--text-2);margin-top:4px;"><i class="ph ph-calendar"></i> Val: ${formatDate(item.validade)}</div>` : ''}
                              <div class="item-actions">
  ```

  **Depois:**
  ```html
                              <div class="item-actions">
  ```

- [ ] **Step 6: Remover 3 field-groups de CA, Localização e Validade de `renderEditItem` (linha ~2550)**

  Dentro da `<form>` em `renderEditItem`, localizar e remover os 3 blocos:

  **Remover integralmente (3 `<div class="field-group">` consecutivos):**
  ```html
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
                              <input class="field-input" type="date" id="itemValidity" value="${item.validade||''}">
                          </div>
  ```

  Substituir por nada (deletar as 12 linhas).

- [ ] **Step 7: Verificar no browser**

  1. Abrir Estoque → confirmar que cards não mostram CA, Validade, Localização.
  2. Exportar Excel → confirmar que planilha não tem colunas CA, Validade, Localização.
  3. Filtros de busca → confirmar que campo Localização sumiu e restaram 2 campos na grid.

- [ ] **Step 8: Commit**

  ```bash
  git -C "Almoxarifado" add index.html
  git -C "Almoxarifado" commit -m "feat(epi): remove CA, validade e localizacao de renderStock, renderEditItem e exportacao"
  ```

---

## Task 3: Criar tabela `daily_counts` no Supabase + adicionar estado e funções JS

**Files:**
- Modify: `Almoxarifado/index.html` (estado ~linha 143, novas funções após `navigateToDashboardAnalytics` ~linha 1408)

- [ ] **Step 1: Criar tabela `daily_counts` no Supabase**

  Acessar o painel do Supabase → SQL Editor → executar:

  ```sql
  CREATE TABLE IF NOT EXISTS daily_counts (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    date        DATE NOT NULL,
    item_id     TEXT NOT NULL,
    item_name   TEXT NOT NULL,
    quantidade  INTEGER NOT NULL DEFAULT 0,
    user_name   TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS idx_daily_counts_item_date
    ON daily_counts (item_id, date DESC);
  ```

  Verificar no painel Table Editor que a tabela `daily_counts` aparece com as colunas corretas.

- [ ] **Step 2: Adicionar `contagem` ao objeto `state`**

  Localizar o final do objeto `state`, que termina com `editingWarehouse: null`. Adicionar vírgula após essa linha e inserir o novo campo:

  **Antes:**
  ```js
              // Edição de almoxarifado
              editingWarehouse: null
          };
  ```

  **Depois:**
  ```js
              // Edição de almoxarifado
              editingWarehouse: null,

              // Contagem Diária
              contagem: {
                  loading: false,
                  date: getCurrentDate(),
                  entries: {},
                  lastCounts: {},
                  saving: false,
                  savedResult: null,
                  tab: 'count',
                  history: [],
                  historyLoading: false
              }
          };
  ```

- [ ] **Step 3: Adicionar 5 funções após `navigateToDashboardAnalytics` (linha ~1408)**

  Localizar o final de `navigateToDashboardAnalytics` (que termina com `setTimeout(() => renderCharts(), 100);` e `}`). Logo após, inserir:

  ```js
        async function navigateToContagem() {
            state.contagem.entries = {};
            state.contagem.savedResult = null;
            state.contagem.tab = 'count';
            state.contagem.date = getCurrentDate();
            state.contagem.loading = true;
            navigateTo('contagem');
            render();
            await loadContagem();
        }

        async function loadContagem() {
            const alm2Items = state.items.filter(i => (i.warehouse_id || 'alm-1') === 'alm-2');
            if (alm2Items.length === 0) {
                state.contagem.loading = false;
                render();
                return;
            }
            try {
                const itemIds = alm2Items.map(i => i.id);
                const { data, error } = await sbClient
                    .from('daily_counts')
                    .select('*')
                    .in('item_id', itemIds)
                    .order('date', { ascending: false });
                if (!error && data) {
                    const lastCounts = {};
                    data.forEach(row => {
                        if (!lastCounts[row.item_id]) lastCounts[row.item_id] = row;
                    });
                    state.contagem.lastCounts = lastCounts;
                }
            } catch (e) {
                console.error('Erro ao carregar contagens:', e);
            }
            state.contagem.loading = false;
            render();
        }

        async function saveContagem() {
            const validEntries = Object.entries(state.contagem.entries)
                .filter(([, qty]) => qty !== '' && qty !== null && qty !== undefined);
            if (validEntries.length === 0) {
                showToast('Preencha ao menos um item', 'error');
                return;
            }
            state.contagem.saving = true;
            render();
            const rows = validEntries.map(([item_id, qty]) => ({
                date: state.contagem.date,
                item_id,
                item_name: state.items.find(i => i.id === item_id)?.nome || item_id,
                quantidade: parseInt(qty) || 0,
                user_name: state.user.nome
            }));
            try {
                const { error } = await sbClient.from('daily_counts').insert(rows);
                if (error) throw error;
                const result = rows.map(row => {
                    const prev = state.contagem.lastCounts[row.item_id];
                    const saida = prev != null ? prev.quantidade - row.quantidade : null;
                    return { item_name: row.item_name, saida, date_anterior: prev?.date || null };
                });
                rows.forEach(row => {
                    state.contagem.lastCounts[row.item_id] = {
                        item_id: row.item_id, date: row.date, quantidade: row.quantidade
                    };
                });
                state.contagem.savedResult = result;
                state.contagem.entries = {};
                showToast('Contagem salva!', 'success');
            } catch (e) {
                showToast('Erro ao salvar contagem', 'error');
                console.error(e);
            }
            state.contagem.saving = false;
            render();
        }

        async function loadContagemHistory() {
            state.contagem.historyLoading = true;
            render();
            try {
                const { data, error } = await sbClient
                    .from('daily_counts')
                    .select('*')
                    .order('date', { ascending: false })
                    .limit(300);
                if (!error && data) state.contagem.history = data;
            } catch (e) {
                console.error('Erro ao carregar histórico de contagens:', e);
            }
            state.contagem.historyLoading = false;
            render();
        }

        function switchContagemTab(tab) {
            state.contagem.tab = tab;
            if (tab === 'history' && state.contagem.history.length === 0) {
                loadContagemHistory();
            } else {
                render();
            }
        }
  ```

- [ ] **Step 4: Verificar que não há erros de sintaxe**

  Abrir o browser, pressionar F12 → Console. Fazer login. Não deve haver erros JS. O estado `state.contagem` deve existir (pode verificar digitando `state.contagem` no console).

- [ ] **Step 5: Commit**

  ```bash
  git -C "Almoxarifado" add index.html
  git -C "Almoxarifado" commit -m "feat(contagem): adiciona estado e funcoes JS para contagem diaria"
  ```

---

## Task 4: Adicionar CSS para a view de contagem

**Files:**
- Modify: `Almoxarifado/css/base.css` (adicionar antes do bloco `/* ---- Responsive ----`)

- [ ] **Step 1: Adicionar classes CSS ao final de base.css (antes do bloco Responsive)**

  Localizar o comentário `/* ---- Responsive ----` no final de `base.css`. Inserir imediatamente antes:

  ```css
  /* ---- Contagem Diária ---- */
  .contagem-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 0;
    border-bottom: 1px solid var(--border);
  }
  .contagem-row:last-child { border-bottom: none; }
  .contagem-row.filled .contagem-input { border-color: var(--accent); background: var(--bg-1); }
  .contagem-nome { flex: 1; font-weight: 500; color: var(--text-1); font-size: 14px; }
  .contagem-ref  { font-size: 11px; color: var(--text-3); min-width: 140px; text-align: right; }
  .contagem-input {
    width: 80px; text-align: center; font-size: 16px; font-weight: 600;
    padding: 6px 8px; border: 1px solid var(--border); border-radius: var(--radius-sm);
    background: var(--bg-0); color: var(--text-1); font-family: var(--font-display);
    transition: border-color 0.2s, background 0.2s;
  }
  .contagem-input:focus { outline: none; border-color: var(--accent); background: var(--bg-1); }
  .resultado-row {
    display: flex; justify-content: space-between; align-items: center;
    padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 13px;
  }
  .resultado-row:last-child { border-bottom: none; }
  .resultado-saida-out  { color: var(--red);    font-weight: 700; }
  .resultado-saida-in   { color: var(--green);  font-weight: 700; }
  .resultado-saida-zero { color: var(--text-3); }

  @media (max-width: 600px) {
    .contagem-row { flex-wrap: wrap; }
    .contagem-ref { min-width: unset; text-align: left; order: 3; width: 100%; }
    .contagem-input { width: 70px; }
  }
  ```

- [ ] **Step 2: Verificar que base.css abre sem erro de sintaxe**

  Abrir o browser → F12 → aba Network ou Console. Navegar para o sistema. Verificar que `base.css` carrega sem erro 404 ou parsing error.

- [ ] **Step 3: Commit**

  ```bash
  git -C "Almoxarifado" add css/base.css
  git -C "Almoxarifado" commit -m "feat(contagem): adiciona classes CSS para view de contagem diaria"
  ```

---

## Task 5: Adicionar `renderContagem()` + conectar navegação

**Files:**
- Modify: `Almoxarifado/index.html` (render switch ~linha 1726, renderHeader views array ~linha 2585, nova função renderContagem após renderEditItem ~linha 2583)

- [ ] **Step 1: Adicionar `case 'contagem'` ao switch do `render()`**

  Localizar o `switch (state.view)` dentro da função `render()`. Adicionar o novo case antes do `default` ou logo antes do `case 'transfer'`:

  **Antes:**
  ```js
                  case 'transfer':
                      app.innerHTML = renderTransfer();
                      break;
              }
  ```

  **Depois:**
  ```js
                  case 'contagem':
                      app.innerHTML = renderContagem();
                      break;
                  case 'transfer':
                      app.innerHTML = renderTransfer();
                      break;
              }
  ```

- [ ] **Step 2: Adicionar contagem ao array `views` de `renderHeader()` e atualizar onclick**

  Localizar o array `views` dentro de `renderHeader()`:

  **Antes:**
  ```js
          const views = [
              { id: 'dashboard',   label: 'Dashboard',      icon: 'ph-fill ph-house' },
              { id: 'stock',       label: 'Estoque',         icon: 'ph-fill ph-warehouse' },
              { id: 'history',     label: 'Histórico',       icon: 'ph-fill ph-clock-counter-clockwise' },
              { id: 'analytics',   label: 'Analytics',       icon: 'ph-fill ph-chart-line' },
              { id: 'warehouses',  label: 'Almoxarifados',   icon: 'ph-fill ph-gear' },
          ];
  ```

  **Depois:**
  ```js
          const views = [
              { id: 'dashboard',   label: 'Dashboard',       icon: 'ph-fill ph-house' },
              { id: 'stock',       label: 'Estoque',          icon: 'ph-fill ph-warehouse' },
              { id: 'contagem',    label: 'Contagem Diária',  icon: 'ph-fill ph-clipboard-text' },
              { id: 'history',     label: 'Histórico',        icon: 'ph-fill ph-clock-counter-clockwise' },
              { id: 'analytics',   label: 'Analytics',        icon: 'ph-fill ph-chart-line' },
              { id: 'warehouses',  label: 'Almoxarifados',    icon: 'ph-fill ph-gear' },
          ];
  ```

  Localizar o `onclick` dos botões do sidebar que usa `navigateTo('${v.id}')` e atualizar para chamar `navigateToContagem()` no caso do contagem:

  **Antes:**
  ```js
                          <button class="nav-menu-item ${state.view === v.id ? 'active' : ''}"
                              onclick="closeSidebar(); navigateTo('${v.id}')">
  ```

  **Depois:**
  ```js
                          <button class="nav-menu-item ${state.view === v.id ? 'active' : ''}"
                              onclick="closeSidebar(); ${v.id === 'contagem' ? 'navigateToContagem()' : `navigateTo('${v.id}')`}">
  ```

- [ ] **Step 3: Adicionar a função `renderContagem()` após `renderEditItem()`**

  Localizar o final de `renderEditItem()` (a linha que fecha a função com `}`). Logo após, inserir a nova função:

  ```js
        function renderContagem() {
            const alm2Items = state.items
                .filter(i => (i.warehouse_id || 'alm-1') === 'alm-2')
                .sort((a, b) => a.nome.localeCompare(b.nome));

            if (state.contagem.loading) {
                return `
                <div class="page-wrap">
                    ${renderHeader()}
                    <div class="page-content-sm">
                        <div class="card" style="text-align:center;padding:48px;">
                            <div class="loading-spinner" style="margin:0 auto 16px;"></div>
                            <p style="color:var(--text-2);">Carregando contagem...</p>
                        </div>
                    </div>
                </div>`;
            }

            // ---- Aba Histórico ----
            let historyContent = '';
            if (state.contagem.tab === 'history') {
                if (state.contagem.historyLoading) {
                    historyContent = `<div class="card" style="text-align:center;padding:48px;">
                        <div class="loading-spinner" style="margin:0 auto 16px;"></div>
                        <p style="color:var(--text-2);">Carregando histórico...</p>
                    </div>`;
                } else if (state.contagem.history.length === 0) {
                    historyContent = `<div class="card"><div class="empty-state">
                        <i class="ph ph-clipboard-text"></i>
                        <p>Nenhuma contagem registrada ainda</p>
                    </div></div>`;
                } else {
                    // Agrupar por data
                    const byDate = {};
                    state.contagem.history.forEach(row => {
                        if (!byDate[row.date]) byDate[row.date] = [];
                        byDate[row.date].push(row);
                    });
                    // Mapa item_id → array de registros (já ordenado por date DESC pelo Supabase)
                    const itemHist = {};
                    state.contagem.history.forEach(row => {
                        if (!itemHist[row.item_id]) itemHist[row.item_id] = [];
                        itemHist[row.item_id].push(row);
                    });
                    historyContent = Object.entries(byDate).map(([date, rows]) => {
                        const rowsHtml = rows.map(row => {
                            const hist = itemHist[row.item_id];
                            const idx = hist.findIndex(h => h.id === row.id);
                            const prev = hist[idx + 1];
                            const saida = prev != null ? prev.quantidade - row.quantidade : null;
                            let saidaTag = '';
                            if (saida === null) saidaTag = `<span class="resultado-saida-zero">primeira contagem</span>`;
                            else if (saida > 0) saidaTag = `<span class="resultado-saida-out">▼ ${saida} saíram</span>`;
                            else if (saida < 0) saidaTag = `<span class="resultado-saida-in">▲ ${Math.abs(saida)} entraram</span>`;
                            else saidaTag = `<span class="resultado-saida-zero">= sem movimento</span>`;
                            return `<div class="resultado-row">
                                <span style="font-weight:500">${row.item_name}</span>
                                <span style="display:flex;align-items:center;gap:12px;">
                                    <span style="color:var(--text-3);font-size:12px;">${row.quantidade} unid.</span>
                                    ${saidaTag}
                                </span>
                            </div>`;
                        }).join('');
                        return `<div class="card card-sm">
                            <div style="font-weight:700;color:var(--text-1);margin-bottom:12px;font-size:14px;">
                                <i class="ph ph-calendar-blank"></i> ${formatDate(date)}
                            </div>
                            ${rowsHtml}
                        </div>`;
                    }).join('');
                }
            }

            // ---- Aba Contagem ----
            let countContent = '';
            if (state.contagem.savedResult) {
                countContent = `<div class="card">
                    <div class="section-title" style="margin-bottom:16px;">
                        <i class="ph-fill ph-check-circle" style="color:var(--green);margin-right:6px;"></i>
                        Resultado — ${formatDate(state.contagem.date)}
                    </div>
                    ${state.contagem.savedResult.map(r => {
                        let saidaTag = '';
                        if (r.saida === null) saidaTag = `<span class="resultado-saida-zero">primeira contagem</span>`;
                        else if (r.saida > 0) saidaTag = `<span class="resultado-saida-out">▼ ${r.saida} saíram</span>`;
                        else if (r.saida < 0) saidaTag = `<span class="resultado-saida-in">▲ ${Math.abs(r.saida)} entraram</span>`;
                        else saidaTag = `<span class="resultado-saida-zero">= sem movimento</span>`;
                        const refDate = r.date_anterior ? ` desde ${formatDate(r.date_anterior)}` : '';
                        return `<div class="resultado-row">
                            <span style="font-weight:500">${r.item_name}</span>
                            <span>${saidaTag}<span style="font-size:11px;color:var(--text-3);">${refDate}</span></span>
                        </div>`;
                    }).join('')}
                    <div style="margin-top:20px;">
                        <button onclick="state.contagem.savedResult=null;state.contagem.entries={};render()" class="btn-primary">
                            <i class="ph ph-arrow-counter-clockwise"></i> Nova Contagem
                        </button>
                    </div>
                </div>`;
            } else {
                countContent = `<div class="card">
                    <div class="section-title" style="margin-bottom:4px;">
                        <i class="ph ph-clipboard-text"></i> Almoxarifado Distribuição
                    </div>
                    <p style="font-size:12px;color:var(--text-3);margin-bottom:20px;">
                        Digite a quantidade contada fisicamente para cada EPI
                    </p>
                    ${alm2Items.length === 0 ? `
                        <div class="empty-state">
                            <i class="ph ph-package"></i>
                            <p>Nenhum item encontrado no Almoxarifado Distribuição</p>
                            <div style="margin-top:16px;">
                                <button onclick="navigateTo('stock')" class="btn-secondary">Ver Estoque</button>
                            </div>
                        </div>` :
                        alm2Items.map(item => {
                            const prev = state.contagem.lastCounts[item.id];
                            const prevText = prev
                                ? `Anterior: ${prev.quantidade} (${formatDate(prev.date)})`
                                : '— primeira contagem';
                            const sizesRef = item.tamanhos && Object.keys(item.tamanhos).length > 0
                                ? `<div style="font-size:11px;color:var(--text-3);margin-top:2px;">${Object.entries(item.tamanhos).map(([s,q])=>`${s}:${q}`).join(' · ')}</div>`
                                : '';
                            const val = state.contagem.entries[item.id] ?? '';
                            return `<div class="contagem-row ${val !== '' ? 'filled' : ''}">
                                <div class="contagem-nome">
                                    ${item.nome}
                                    <span class="badge badge-gray" style="font-size:10px;margin-left:4px;">${item.unidade}</span>
                                    ${sizesRef}
                                </div>
                                <div class="contagem-ref">${prevText}</div>
                                <input class="contagem-input" type="number" min="0" placeholder="—" value="${val}"
                                    oninput="state.contagem.entries['${item.id}']=this.value;this.closest('.contagem-row').classList.toggle('filled',this.value!=='')">
                            </div>`;
                        }).join('')
                    }
                    ${alm2Items.length > 0 ? `
                    <div style="margin-top:20px;display:flex;justify-content:flex-end;">
                        <button onclick="saveContagem()" class="btn-primary" ${state.contagem.saving ? 'disabled' : ''}>
                            ${state.contagem.saving
                                ? `<span class="loading-spinner" style="width:16px;height:16px;border-width:2px;"></span> Salvando...`
                                : `<i class="ph-fill ph-clipboard-text"></i> Salvar Contagem`}
                        </button>
                    </div>` : ''}
                </div>`;
            }

            return `
            <div class="page-wrap">
                ${renderHeader()}
                <div class="page-content-sm">
                    <div class="card">
                        <div class="row-between">
                            <div>
                                <h1 class="page-title">
                                    <i class="ph-fill ph-clipboard-text text-blue"></i> Contagem Diária
                                </h1>
                                <p style="font-size:12px;color:var(--text-3);margin-top:2px;">Almoxarifado Distribuição</p>
                            </div>
                            <div class="field-group" style="min-width:140px;">
                                <label class="field-label">Data</label>
                                <input class="field-input" type="date" value="${state.contagem.date}"
                                    onchange="state.contagem.date=this.value;state.contagem.entries={};state.contagem.savedResult=null;render()">
                            </div>
                        </div>
                    </div>
                    <div class="tab-bar">
                        <button class="tab-btn ${state.contagem.tab === 'count' ? 'active' : ''}"
                            onclick="switchContagemTab('count')">
                            <i class="ph ph-clipboard-text"></i> Contagem de Hoje
                        </button>
                        <button class="tab-btn ${state.contagem.tab === 'history' ? 'active' : ''}"
                            onclick="switchContagemTab('history')">
                            <i class="ph ph-clock-counter-clockwise"></i> Histórico
                        </button>
                    </div>
                    ${state.contagem.tab === 'count' ? countContent : historyContent}
                </div>
            </div>`;
        }
  ```

- [ ] **Step 4: Verificar a view de contagem no browser**

  1. Clicar no menu hamburger → deve aparecer "Contagem Diária" na lista.
  2. Clicar em "Contagem Diária" → deve abrir a tela com itens do Almoxarifado Distribuição.
  3. Se não houver itens no Alm2, deve mostrar estado vazio com botão "Ver Estoque".
  4. Se houver itens, preencher 2-3 campos e clicar "Salvar Contagem" → deve mostrar a tela de resultado com saídas calculadas.
  5. Clicar "Histórico" → deve carregar e mostrar as contagens salvas.

- [ ] **Step 5: Commit**

  ```bash
  git -C "Almoxarifado" add index.html
  git -C "Almoxarifado" commit -m "feat(contagem): adiciona renderContagem e conecta navegacao"
  ```

---

## Self-review checklist

- [ ] **Spec coverage:**
  - Remover CA: ✅ Tasks 1+2
  - Remover Validade: ✅ Tasks 1+2
  - Remover Localização: ✅ Tasks 1+2 (incluindo filtro)
  - Tabela daily_counts: ✅ Task 3 Step 1
  - Estado contagem: ✅ Task 3 Step 2
  - Funções de load/save: ✅ Task 3 Step 3
  - CSS contagem-row / resultado-row: ✅ Task 4
  - renderContagem com lista de itens Alm2: ✅ Task 5 Step 3
  - Tela de resultado pós-salvar: ✅ Task 5 Step 3 (savedResult branch)
  - Aba histórico: ✅ Task 5 Step 3 (history branch)
  - Botão no sidebar: ✅ Task 5 Step 2
  - navigateToContagem + loadContagem trigger: ✅ Task 5 Step 2 onclick
  - Cálculo saída = anterior − atual: ✅ saveContagem + renderContagem history

- [ ] **Placeholders:** Nenhum. Todo código está completo.
- [ ] **Consistência de nomes:** `state.contagem`, `loadContagem`, `saveContagem`, `loadContagemHistory`, `switchContagemTab`, `navigateToContagem` — usados consistentemente em todos os tasks.
