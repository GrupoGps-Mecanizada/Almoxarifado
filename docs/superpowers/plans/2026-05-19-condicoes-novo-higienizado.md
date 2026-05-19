# Classificação NOVO / HIGIENIZADO — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar classificação NOVO/HIGIENIZADO aos itens, funcionando em estoque, movimentações, contagem e exportação.

**Architecture:** Chaves compostas com separador `|` no campo `tamanhos` existente (ex: `"P|NOVO": 5`). Chaves compostas com `::` no estado de contagem em memória (ex: `"ITEM-123::P|NOVO"`). O campo `size` da tabela `daily_counts` precisa ser adicionado via migration.

**Tech Stack:** Vanilla JS, HTML5, Supabase (PostgreSQL), SheetJS

---

## Mapa de Arquivos

| Arquivo | Mudanças |
|---|---|
| `index.html` (linha ~430) | +5 funções helper globais |
| `index.html` (linha 1391) | `toggleSizesSection` → `updateItemFormLayout` |
| `index.html` (linha 1411) | `addSizeRow` — modo combinado |
| `index.html` (linha 1424) | `handleSaveItem` — coleta tamanhos+condições |
| `index.html` (linha 1889) | `loadContagem` — chaves compostas |
| `index.html` (linha 1820) | `loadContagemAndBuildResult` — chaves compostas |
| `index.html` (linha 1972) | `saveContagem` — inclui `size`, parse de chaves |
| `index.html` (linha 2064) | `aplicarBaixaContagem` — tamanhos por variação |
| `index.html` (linha 2145) | `desfazerBaixaContagem` — restaura por `size` |
| `index.html` (linha 2217) | `confirmDarBaixa` / `openBaixaModal` — selectors |
| `index.html` (linha 3193) | `renderMovement` — dropdown de condição |
| `index.html` (linha 3348) | `renderStock` — chips de variação |
| `index.html` (linha 3660) | emergencial — chips de variação |
| `index.html` (linha 3722) | `renderTransfer` — dropdown de condição |
| `index.html` (linha 3966) | `renderEditItem` — 2 checkboxes, 3 modos |
| `index.html` (linha 4068) | `renderContagem` — linhas por variação |
| `index.html` (linha 1084) | `exportStockToXLSX` — labels de colunas |

---

## Task 1: Funções Helper Globais

**Arquivo:** `index.html` — inserir após linha ~429 (antes de `async function getItems`)

- [ ] **1.1 Inserir o bloco de helpers**

Localizar a linha com `async function getItems(forceRefresh = false) {` (~linha 431) e inserir **antes** dela:

```javascript
        // ── Variação: helpers para chaves compostas (tamanho|condição) ──────────
        const CONDICOES = ['NOVO', 'HIGIENIZADO'];

        function parseVariationKey(key) {
            if (!key) return { size: null, condicao: null };
            if (key.includes('|')) {
                const idx = key.indexOf('|');
                return { size: key.slice(0, idx), condicao: key.slice(idx + 1) };
            }
            if (CONDICOES.includes(key)) return { size: null, condicao: key };
            return { size: key, condicao: null };
        }

        function buildVariationKey(size, condicao) {
            if (size && condicao) return `${size}|${condicao}`;
            if (condicao) return condicao;
            return size || null;
        }

        function hasCondicoes(item) {
            if (!item || !item.tamanhos) return false;
            return Object.keys(item.tamanhos).some(k => CONDICOES.includes(k) || k.includes('|'));
        }

        function hasTamanhos(item) {
            if (!item || !item.tamanhos) return false;
            return Object.keys(item.tamanhos).some(k => !CONDICOES.includes(k) && !k.includes('|'));
        }

        function formatVariationLabel(key) {
            if (!key) return '';
            return key.replace('|', ' — ');
        }
        // ─────────────────────────────────────────────────────────────────────────
```

- [ ] **1.2 Verificar sintaxe — abrir o app no browser e ver console sem erros**

- [ ] **1.3 Commit**

```
git add index.html
git commit -m "feat: helpers parseVariationKey, hasCondicoes, hasTamanhos, formatVariationLabel"
```

---

## Task 2: Migration — Coluna `size` em `daily_counts`

O campo `size` é necessário para armazenar a variação (condição/tamanho) nas contagens.

- [ ] **2.1 Executar SQL no Supabase**

No painel Supabase → SQL Editor, executar:

```sql
ALTER TABLE daily_counts ADD COLUMN IF NOT EXISTS size text;
```

- [ ] **2.2 Verificar que a coluna existe**

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'daily_counts' AND column_name = 'size';
```

Esperado: 1 row com `size`.

- [ ] **2.3 Commit**

```
git commit -m "docs: migration daily_counts.size adicionada no Supabase"
```

---

## Task 3: Formulário de Edição de Item

**Arquivo:** `index.html`

### 3a — `updateItemFormLayout` (substitui `toggleSizesSection`)

- [ ] **3a.1 Localizar e substituir `toggleSizesSection`** (linha ~1391)

Substituir o bloco inteiro:

```javascript
        function toggleSizesSection(show) {
            ...
        }
```

Por:

```javascript
        function updateItemFormLayout() {
            const hasSzChk = document.getElementById('hasSizes')?.checked;
            const hasCondChk = document.getElementById('hasCondicoes')?.checked;
            const singleQtyArea = document.getElementById('singleQuantityArea');
            const sizesConfigArea = document.getElementById('sizesConfigArea');
            const condicoesOnlyArea = document.getElementById('condicoesOnlyArea');
            const itemQtyInput = document.getElementById('itemQuantity');
            const addSizeBtn = document.getElementById('addSizeBtn');
            const sizeListLabel = document.getElementById('sizeListLabel');

            if (!hasSzChk && !hasCondChk) {
                singleQtyArea.className = 'block';
                sizesConfigArea.className = 'hidden';
                condicoesOnlyArea.className = 'hidden';
                if (itemQtyInput) itemQtyInput.required = true;
            } else if (hasSzChk && !hasCondChk) {
                singleQtyArea.className = 'hidden';
                sizesConfigArea.className = 'block';
                condicoesOnlyArea.className = 'hidden';
                if (itemQtyInput) itemQtyInput.required = false;
                if (sizeListLabel) sizeListLabel.textContent = 'Tamanhos e Quantidades';
                if (addSizeBtn) addSizeBtn.style.display = '';
            } else if (!hasSzChk && hasCondChk) {
                singleQtyArea.className = 'hidden';
                sizesConfigArea.className = 'hidden';
                condicoesOnlyArea.className = 'block';
                if (itemQtyInput) itemQtyInput.required = false;
            } else {
                // ambos: sizes + condições
                singleQtyArea.className = 'hidden';
                sizesConfigArea.className = 'block';
                condicoesOnlyArea.className = 'hidden';
                if (itemQtyInput) itemQtyInput.required = false;
                if (sizeListLabel) sizeListLabel.textContent = 'Tamanhos × Condição (NOVO / HIGIENIZADO)';
                if (addSizeBtn) addSizeBtn.style.display = '';
            }
        }

        function toggleSizesSection(show) { updateItemFormLayout(); }
```

### 3b — `addSizeRow` (modo combinado)

- [ ] **3b.1 Localizar e substituir `addSizeRow`** (linha ~1411)

```javascript
        function addSizeRow() {
            const hasCondChk = document.getElementById('hasCondicoes')?.checked;
            const list = document.getElementById('sizesList');
            const row = document.createElement('div');
            row.className = 'size-row';
            row.style.cssText = 'display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:6px;';
            if (hasCondChk) {
                row.innerHTML = `
                    <input type="text" class="size-name field-input" style="width:90px;" placeholder="Ex: P ou 40" required>
                    <span style="font-size:12px;color:var(--green);font-weight:600;">NOVO:</span>
                    <input type="number" class="size-qty-novo field-input" style="width:80px;" placeholder="0" value="0" min="0">
                    <span style="font-size:12px;color:var(--accent);font-weight:600;">HIG:</span>
                    <input type="number" class="size-qty-hig field-input" style="width:80px;" placeholder="0" value="0" min="0">
                    <button type="button" onclick="this.parentElement.remove()" class="btn-icon" style="color:var(--red)"><i class="ph-bold ph-trash"></i></button>
                `;
            } else {
                row.innerHTML = `
                    <input type="text" class="size-name field-input" style="width:120px;" placeholder="Ex: 40 ou M" required>
                    <input type="number" class="size-qty field-input" style="width:100px;" placeholder="Qtd" value="0" min="0">
                    <button type="button" onclick="this.parentElement.remove()" class="btn-icon" style="color:var(--red)"><i class="ph-bold ph-trash"></i></button>
                `;
            }
            list.appendChild(row);
        }
```

### 3c — `handleSaveItem` (coleta tamanhos + condições)

- [ ] **3c.1 Localizar o bloco `if (hasSizes) {` dentro de `handleSaveItem`** (linha ~1431) e substituir toda a lógica de coleta:

```javascript
            const hasSizesChecked = document.getElementById('hasSizes')?.checked;
            const hasCondicoesChecked = document.getElementById('hasCondicoes')?.checked;
            let tamanhos = null;
            let quantidade = 0;

            if (hasSizesChecked && hasCondicoesChecked) {
                tamanhos = {};
                document.querySelectorAll('.size-row').forEach(row => {
                    const name = row.querySelector('.size-name')?.value.trim();
                    if (!name) return;
                    const novoQty = parseInt(row.querySelector('.size-qty-novo')?.value) || 0;
                    const higQty  = parseInt(row.querySelector('.size-qty-hig')?.value)  || 0;
                    tamanhos[`${name}|NOVO`]        = novoQty;
                    tamanhos[`${name}|HIGIENIZADO`] = higQty;
                    quantidade += novoQty + higQty;
                });
            } else if (hasSizesChecked) {
                tamanhos = {};
                document.querySelectorAll('.size-row').forEach(row => {
                    const name = row.querySelector('.size-name')?.value.trim();
                    const qty  = parseInt(row.querySelector('.size-qty')?.value) || 0;
                    if (name) { tamanhos[name] = qty; quantidade += qty; }
                });
            } else if (hasCondicoesChecked) {
                tamanhos = {};
                const novoQty = parseInt(document.getElementById('condicaoNovo')?.value) || 0;
                const higQty  = parseInt(document.getElementById('condicaoHig')?.value)  || 0;
                tamanhos['NOVO']        = novoQty;
                tamanhos['HIGIENIZADO'] = higQty;
                quantidade = novoQty + higQty;
            } else {
                quantidade = parseInt(document.getElementById('itemQuantity')?.value) || 0;
            }
```

### 3d — `renderEditItem` (2 checkboxes + 3 áreas)

- [ ] **3d.1 Substituir o bloco de `<!-- Tamanhos / Numeração -->` até o fechamento de `</div>` do `sizesConfigArea`** (linhas 4019–4053)

Primeiro, calcular flags iniciais do item. Adicionar antes do return do HTML (dentro da função, antes do template literal):

```javascript
        function renderEditItem() {
            const item = state.editingItem || {};
            const itemHasTam   = hasTamanhos(item);
            const itemHasCond  = hasCondicoes(item);
```

Depois, substituir a seção de tamanhos no HTML pelo bloco abaixo:

```html
                        <!-- Tamanhos / Numeração -->
                        <div class="field-group" style="grid-column:1/-1;">
                            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-weight:600;font-size:13px;color:var(--text-2);">
                                <input type="checkbox" id="hasSizes" style="width:18px;height:18px;accent-color:var(--accent);"
                                    ${itemHasTam ? 'checked' : ''}
                                    onchange="updateItemFormLayout()">
                                Este item tem tamanhos / numerações diferentes
                            </label>
                        </div>
                        <div class="field-group" style="grid-column:1/-1;">
                            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-weight:600;font-size:13px;color:var(--text-2);">
                                <input type="checkbox" id="hasCondicoes" style="width:18px;height:18px;accent-color:var(--green);"
                                    ${itemHasCond ? 'checked' : ''}
                                    onchange="updateItemFormLayout()">
                                Este item tem condição (NOVO / HIGIENIZADO)
                            </label>
                        </div>

                        <!-- Quantidade única -->
                        <div id="singleQuantityArea" class="${!itemHasTam && !itemHasCond ? 'block' : 'hidden'}" style="grid-column:1/-1;">
                            <div class="field-group">
                                <label class="field-label">Quantidade</label>
                                <input class="field-input" type="number" id="itemQuantity" value="${item.quantidade || 0}" min="0">
                            </div>
                        </div>

                        <!-- Só condição (NOVO / HIGIENIZADO) -->
                        <div id="condicoesOnlyArea" class="${!itemHasTam && itemHasCond ? 'block' : 'hidden'}" style="grid-column:1/-1;">
                            <div class="field-group">
                                <label class="field-label">Quantidades por Condição</label>
                                <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;">
                                    <label style="display:flex;align-items:center;gap:8px;font-weight:600;font-size:13px;color:var(--green);">
                                        NOVO:
                                        <input type="number" id="condicaoNovo" class="field-input" style="width:100px;"
                                            value="${item.tamanhos?.['NOVO'] ?? 0}" min="0">
                                    </label>
                                    <label style="display:flex;align-items:center;gap:8px;font-weight:600;font-size:13px;color:var(--accent);">
                                        HIGIENIZADO:
                                        <input type="number" id="condicaoHig" class="field-input" style="width:100px;"
                                            value="${item.tamanhos?.['HIGIENIZADO'] ?? 0}" min="0">
                                    </label>
                                </div>
                            </div>
                        </div>

                        <!-- Tamanhos (com ou sem condição) -->
                        <div id="sizesConfigArea" class="${itemHasTam ? 'block' : 'hidden'}" style="grid-column:1/-1;">
                            <div class="field-group">
                                <label class="field-label" id="sizeListLabel">${itemHasTam && itemHasCond ? 'Tamanhos × Condição (NOVO / HIGIENIZADO)' : 'Tamanhos e Quantidades'}</label>
                                <div id="sizesList" class="stack-sm">
                                    ${(() => {
                                        if (!itemHasTam) return '';
                                        if (itemHasCond) {
                                            // Agrupa por tamanho e mostra NOVO + HIG
                                            const sizes = [...new Set(
                                                Object.keys(item.tamanhos)
                                                    .filter(k => k.includes('|'))
                                                    .map(k => k.split('|')[0])
                                            )];
                                            return sizes.map(s => `
                                                <div class="size-row" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:6px;">
                                                    <input type="text" class="size-name field-input" style="width:90px;" placeholder="Ex: P ou 40" value="${s}" required>
                                                    <span style="font-size:12px;color:var(--green);font-weight:600;">NOVO:</span>
                                                    <input type="number" class="size-qty-novo field-input" style="width:80px;" value="${item.tamanhos[s+'|NOVO'] ?? 0}" min="0">
                                                    <span style="font-size:12px;color:var(--accent);font-weight:600;">HIG:</span>
                                                    <input type="number" class="size-qty-hig field-input" style="width:80px;" value="${item.tamanhos[s+'|HIGIENIZADO'] ?? 0}" min="0">
                                                    <button type="button" onclick="this.parentElement.remove()" class="btn-icon" style="color:var(--red)"><i class="ph-bold ph-trash"></i></button>
                                                </div>`).join('');
                                        } else {
                                            return Object.entries(item.tamanhos).map(([s, q]) => `
                                                <div class="flex gap-3 items-center size-row mb-2" style="display:flex;gap:10px;align-items:center;">
                                                    <input type="text" class="size-name field-input" style="width:120px;" placeholder="Ex: 40 ou M" value="${s}" required>
                                                    <input type="number" class="size-qty field-input" style="width:100px;" placeholder="Qtd" value="${q}" min="0" required>
                                                    <button type="button" onclick="this.parentElement.remove()" class="btn-icon" style="color:var(--red)"><i class="ph-bold ph-trash"></i></button>
                                                </div>`).join('');
                                        }
                                    })()}
                                </div>
                                <button type="button" id="addSizeBtn" onclick="addSizeRow()" class="btn-secondary" style="margin-top:10px;">
                                    <i class="ph ph-plus"></i> Adicionar Tamanho
                                </button>
                            </div>
                        </div>
```

- [ ] **3d.2 Testar no browser: criar item só com condição, item com tamanho+condição, item só com tamanho**

- [ ] **3d.3 Commit**

```
git add index.html
git commit -m "feat: formulário de edição com checkbox de condição NOVO/HIGIENIZADO"
```

---

## Task 4: Exibição no Estoque — Cards e Emergencial

**Arquivo:** `index.html`

- [ ] **4.1 Substituir bloco de renderização de size chips em `renderStock`** (linha ~3454)

Localizar:
```javascript
${item.tamanhos && Object.keys(item.tamanhos).length > 0 ? `
    <div class="sizes-grid">
        ${Object.entries(item.tamanhos).map(([s, q]) => `
            <div class="size-chip"><strong>${s}:</strong> <span class="qty ${q > 0 ? 'ok' : 'low'}">${q}</span></div>
        `).join('')}
    </div>` : ''}
```

Substituir por:

```javascript
${item.tamanhos && Object.keys(item.tamanhos).length > 0 ? `
    <div class="sizes-grid">
        ${renderVariationChips(item)}
    </div>` : ''}
```

- [ ] **4.2 Substituir bloco idêntico na seção emergencial** (linha ~3660)

Localizar o segundo bloco igual com `sizes-grid` (dentro da lista de itens emergenciais) e aplicar a mesma substituição:

```javascript
${item.tamanhos && Object.keys(item.tamanhos).length > 0 ? `
    <div class="sizes-grid" style="margin-top:8px;">
        ${renderVariationChips(item)}
    </div>` : ''}
```

- [ ] **4.3 Adicionar função `renderVariationChips`** junto aos helpers (Task 1) ou antes de `renderStock`:

```javascript
        function renderVariationChips(item) {
            if (!item.tamanhos) return '';
            const hasTam = hasTamanhos(item);
            const hasCond = hasCondicoes(item);

            if (hasTam && hasCond) {
                // Agrupa por tamanho: P → { NOVO: 5, HIGIENIZADO: 3 }
                const sizeMap = {};
                Object.entries(item.tamanhos).forEach(([k, q]) => {
                    const { size, condicao } = parseVariationKey(k);
                    if (!size) return;
                    if (!sizeMap[size]) sizeMap[size] = {};
                    sizeMap[size][condicao] = q;
                });
                return Object.entries(sizeMap).map(([s, conds]) => {
                    const novo = conds['NOVO'] ?? 0;
                    const hig  = conds['HIGIENIZADO'] ?? 0;
                    return `<div class="size-chip" style="flex-direction:column;align-items:flex-start;gap:2px;min-width:110px;">
                        <strong style="font-size:11px;">${s}</strong>
                        <span style="display:flex;gap:8px;font-size:11px;">
                            <span style="color:var(--green);font-weight:700;">N:${novo}</span>
                            <span style="color:var(--accent);font-weight:700;">H:${hig}</span>
                        </span>
                    </div>`;
                }).join('');
            }

            if (!hasTam && hasCond) {
                const novo = item.tamanhos['NOVO'] ?? 0;
                const hig  = item.tamanhos['HIGIENIZADO'] ?? 0;
                return `
                    <div class="size-chip"><strong style="color:var(--green);">NOVO:</strong> <span class="qty ${novo > 0 ? 'ok' : 'low'}">${novo}</span></div>
                    <div class="size-chip"><strong style="color:var(--accent);">HIGIENIZADO:</strong> <span class="qty ${hig > 0 ? 'ok' : 'low'}">${hig}</span></div>
                `;
            }

            // Tamanhos simples (comportamento original)
            return Object.entries(item.tamanhos).map(([s, q]) =>
                `<div class="size-chip"><strong>${s}:</strong> <span class="qty ${q > 0 ? 'ok' : 'low'}">${q}</span></div>`
            ).join('');
        }
```

- [ ] **4.4 Verificar no browser que cards exibem corretamente para os 3 casos**

- [ ] **4.5 Commit**

```
git add index.html
git commit -m "feat: cards de estoque exibem chips NOVO/HIGIENIZADO por variação"
```

---

## Task 5: Formulário de Movimentação e Modal de Baixa

**Arquivo:** `index.html`

### 5a — `renderMovement` — dropdown de variação

- [ ] **5a.1 Localizar o bloco do dropdown de tamanho em `renderMovement`** (linha ~3271)

Localizar:
```javascript
${selectedItem.tamanhos && Object.keys(selectedItem.tamanhos).length > 0 ? `
    ...
    ${Object.entries(selectedItem.tamanhos).map(([s, q]) => `<option value="${s}" ...>${s} (Estoque: ${q})</option>`).join('')}
` : ''}
```

Substituir por:

```javascript
${selectedItem.tamanhos && Object.keys(selectedItem.tamanhos).length > 0 ? `
    <div class="field-group">
        <label class="field-label">Variação</label>
        <select class="field-input field-select" onchange="state.movementOperation.size=this.value;render()" required>
            <option value="">Selecione...</option>
            ${Object.entries(selectedItem.tamanhos).map(([k, q]) =>
                `<option value="${k}" ${op.size === k ? 'selected' : ''}>${formatVariationLabel(k)} (Estoque: ${q})</option>`
            ).join('')}
        </select>
    </div>
` : ''}
```

### 5b — `renderBaixaModal` / `openBaixaModal` — selector de variação

- [ ] **5b.1 Localizar o bloco do seletor de tamanho na baixa modal** (linha ~3485)

Localizar:
```javascript
const hasSizes = item.tamanhos && Object.keys(item.tamanhos).length > 0;
const sizeKeys = hasSizes ? Object.entries(item.tamanhos).filter(([, q]) => q > 0).map(([s]) => s) : [];
```

Substituir por:

```javascript
const hasSizes = item.tamanhos && Object.keys(item.tamanhos).length > 0;
const sizeKeys = hasSizes
    ? Object.entries(item.tamanhos).filter(([, q]) => q > 0).map(([s]) => s)
    : [];
```

(sem mudança aqui — mas atualizar o dropdown de opções abaixo)

- [ ] **5b.2 Localizar o `<select>` de tamanhos na baixa modal** (linha ~3512) e substituir as opções:

```javascript
${sizeKeys.map(s => `<option value="${s}" ${m.size === s ? 'selected' : ''}>${formatVariationLabel(s)} — disponível: ${item.tamanhos[s]}</option>`).join('')}
```

- [ ] **5b.3 Atualizar `confirmDarBaixa`** (linha ~2222) — alterar mensagem de toast:

```javascript
if (hasSizes && !m.size) {
    showToast('Selecione a variação primeiro', 'error');
    return;
}
```

- [ ] **5b.4 Verificar no browser: movimento e baixa modal mostram variações formatadas**

- [ ] **5b.5 Commit**

```
git add index.html
git commit -m "feat: movimentação e baixa modal exibem variações NOVO/HIGIENIZADO"
```

---

## Task 6: Formulário de Transferência

**Arquivo:** `index.html`

- [ ] **6.1 Localizar o dropdown de tamanho em `renderTransfer`** (linha ~3813)

Localizar:
```javascript
${Object.entries(selectedItem.tamanhos).filter(([, q]) => q > 0).map(([s, q]) => `<option value="${s}" ${op.size === s ? 'selected' : ''}>${s} — ${q} disponível${q !== 1 ? 'is' : ''}</option>`).join('')}
```

Substituir por:

```javascript
${Object.entries(selectedItem.tamanhos).filter(([, q]) => q > 0).map(([s, q]) =>
    `<option value="${s}" ${op.size === s ? 'selected' : ''}>${formatVariationLabel(s)} — ${q} disponível${q !== 1 ? 'is' : ''}</option>`
).join('')}
```

- [ ] **6.2 Localizar o label de item na lista de seleção de item de transferência** (linha ~3787)

```javascript
const label = i.tamanhos && Object.keys(i.tamanhos).length > 0
    ? `${i.nome} — ${Object.entries(i.tamanhos).filter(([, q]) => q > 0).map(([s, q]) => `${formatVariationLabel(s)}: ${q}`).join(', ')}`
    : i.nome;
```

- [ ] **6.3 Commit**

```
git add index.html
git commit -m "feat: transferência exibe variações formatadas NOVO/HIGIENIZADO"
```

---

## Task 7: Carregamento de Contagens — `loadContagem` e `loadContagemAndBuildResult`

O ponto central: usar chave composta `"item_id::variationKey"` no estado de contagem para itens com condições/tamanhos.

**Arquivo:** `index.html`

### 7a — `loadContagemAndBuildResult` (linha ~1820)

- [ ] **7a.1 Substituir o bloco que monta `c1Map`, `c2Map`, `c3Map`** (linha ~1858):

```javascript
                const c1Map = {}, c2Map = {}, c3Map = {};
                (data || []).forEach(r => {
                    const k = r.size ? `${r.item_id}::${r.size}` : r.item_id;
                    if (r.contagem_num === 1) c1Map[k] = r;
                    if (r.contagem_num === 2) c2Map[k] = r;
                    if (r.contagem_num === 3) c3Map[k] = r;
                });

                const allKeys = new Set([...Object.keys(c1Map), ...Object.keys(c2Map), ...Object.keys(c3Map)]);
                const result = Array.from(allKeys).map(compoundKey => {
                    const c1 = c1Map[compoundKey];
                    const c2 = c2Map[compoundKey];
                    const c3 = c3Map[compoundKey];
                    const baseRow = c1 || c2 || c3;
                    const variationKey = baseRow.size || null;
                    const itemName = variationKey
                        ? `${baseRow.item_name} — ${formatVariationLabel(variationKey)}`
                        : baseRow.item_name;
                    return {
                        item_id: baseRow.item_id,
                        item_name: itemName,
                        variation_key: variationKey,
                        saida:     (c1 != null && c2 != null) ? c1.quantidade - c2.quantidade : null,
                        saida_adm: (c2 != null && c3 != null) ? c2.quantidade - c3.quantidade : null,
                        c1_qtd: c1?.quantidade ?? null,
                        c1_date: c1?.date ?? null,
                        c2_qtd: c2?.quantidade ?? null,
                        c3_qtd: c3?.quantidade ?? null
                    };
                });
                state.contagem.savedResult = result.length > 0 ? result : null;
                state.contagem.lastC1 = c1Map;
                state.contagem.lastC2 = c2Map;
```

### 7b — `loadContagem` (linha ~1889)

- [ ] **7b.1 Substituir os blocos que montam `lastC1`, `lastC2` e `todayCounts`:**

**lastC1** (linha ~1908):
```javascript
                const lastC1 = {};
                if (allC1) allC1.forEach(row => {
                    const k = row.size ? `${row.item_id}::${row.size}` : row.item_id;
                    if (!lastC1[k]) lastC1[k] = row;
                });
                state.contagem.lastC1 = lastC1;
```

**lastC2** (linha ~1920):
```javascript
                const lastC2 = {};
                if (allC2) allC2.forEach(row => {
                    const k = row.size ? `${row.item_id}::${row.size}` : row.item_id;
                    if (!lastC2[k]) lastC2[k] = row;
                });
                state.contagem.lastC2 = lastC2;
```

**todayCounts** (linha ~1937):
```javascript
                const todayCounts = {};
                if (todayData) {
                    todayData.forEach(row => {
                        const k = row.size ? `${row.item_id}::${row.size}` : row.item_id;
                        if (!todayCounts[k]) todayCounts[k] = {};
                        if (row.contagem_num === 1) todayCounts[k].c1 = row;
                        if (row.contagem_num === 2) todayCounts[k].c2 = row;
                        if (row.contagem_num === 3) todayCounts[k].c3 = row;
                    });
                }
                state.contagem.todayCounts = todayCounts;
```

**entries** (linha ~1948):
```javascript
                const entries1 = {}, entries2 = {}, entries3 = {};
                Object.entries(todayCounts).forEach(([compoundKey, counts]) => {
                    if (counts.c1) entries1[compoundKey] = String(counts.c1.quantidade);
                    if (counts.c2) entries2[compoundKey] = String(counts.c2.quantidade);
                    if (counts.c3) entries3[compoundKey] = String(counts.c3.quantidade);
                });
                if (isVinculoAlmoxEnabled()) {
                    alm2Items.forEach(item => {
                        if (hasCondicoes(item)) {
                            Object.keys(item.tamanhos).forEach(varKey => {
                                const ek = `${item.id}::${varKey}`;
                                if (entries1[ek] === undefined) entries1[ek] = String(item.tamanhos[varKey] ?? 0);
                            });
                        } else if (hasTamanhos(item)) {
                            Object.keys(item.tamanhos).forEach(varKey => {
                                const ek = `${item.id}::${varKey}`;
                                if (entries1[ek] === undefined) entries1[ek] = String(item.tamanhos[varKey] ?? 0);
                            });
                        } else {
                            if (entries1[item.id] === undefined && item.quantidade != null) {
                                entries1[item.id] = String(item.quantidade);
                            }
                        }
                    });
                }
                state.contagem.entries1 = entries1;
                state.contagem.entries2 = entries2;
                state.contagem.entries3 = entries3;
```

- [ ] **7b.2 Commit**

```
git add index.html
git commit -m "feat: loadContagem usa chaves compostas item_id::variação para condições"
```

---

## Task 8: `renderContagem` — Linhas por Variação

**Arquivo:** `index.html` (linha ~4235)

- [ ] **8.1 Substituir o bloco `const tableRows = alm2Items.map(...)` (linha 4235)**

O bloco atual gera uma linha por item. O novo gera uma linha por variação:

```javascript
                // Expande itens com variações (tamanhos e/ou condições) em múltiplas linhas
                function expandItemRows(item) {
                    if (!item.tamanhos || Object.keys(item.tamanhos).length === 0) {
                        return [{ item, varKey: null, label: item.nome }];
                    }
                    return Object.keys(item.tamanhos).map(varKey => ({
                        item,
                        varKey,
                        label: `${item.nome} — ${formatVariationLabel(varKey)}`
                    }));
                }

                const expandedRows = alm2Items.flatMap(expandItemRows);

                const tableRows = expandedRows.map(({ item, varKey, label }, idx) => {
                    const ek = varKey ? `${item.id}::${varKey}` : item.id;
                    const saved1 = state.contagem.todayCounts[ek]?.c1;
                    const saved2 = state.contagem.todayCounts[ek]?.c2;
                    const saved3 = state.contagem.todayCounts[ek]?.c3;
                    const val1 = state.contagem.entries1[ek] ?? '';
                    const val2 = state.contagem.entries2[ek] ?? '';
                    const val3 = state.contagem.entries3[ek] ?? '';
                    const rowBg = idx % 2 === 0 ? 'var(--bg-1)' : 'var(--bg-2)';
                    const cell1Bg = saved1 ? '#e8f5ee' : val1 !== '' ? '#f0f4ff' : rowBg;
                    const cell2Bg = saved2 ? '#e8f5ee' : val2 !== '' ? '#f0f4ff' : rowBg;
                    const cell3Bg = saved3 ? '#e8f5ee' : val3 !== '' ? '#f0f4ff' : rowBg;
                    const ekEscaped = ek.replace(/'/g, "\\'").replace(/\|/g, '\\|');
                    function cellInput(stKey, val, cellBg) {
                        return `<td style="padding:3px 4px;background:${cellBg};border-left:1px solid var(--border);text-align:center;">
                            <input type="number" min="0" placeholder="—" value="${val}"
                                style="width:72px;height:32px;border:1px solid var(--border);border-radius:6px;text-align:center;
                                       font-size:13px;font-weight:600;background:transparent;color:var(--text-1);
                                       outline:none;padding:0 4px;"
                                onfocus="this.style.borderColor='var(--accent)';this.style.boxShadow='0 0 0 2px var(--accent-glow)'"
                                onblur="this.style.borderColor='var(--border)';this.style.boxShadow=''"
                                oninput="state.contagem.${stKey}['${ek}']=this.value">
                        </td>`;
                    }
                    // Cor do label conforme condição
                    const parsed = varKey ? parseVariationKey(varKey) : {};
                    const condColor = parsed.condicao === 'NOVO' ? 'var(--green)'
                        : parsed.condicao === 'HIGIENIZADO' ? 'var(--accent)' : 'var(--text-2)';
                    return `<tr style="border-bottom:1px solid var(--border);">
                        <td style="padding:9px 12px;font-weight:500;font-size:13px;background:${rowBg};white-space:nowrap;">
                            ${item.nome}
                            ${varKey ? `<span style="font-size:11px;color:${condColor};font-weight:700;margin-left:6px;">— ${formatVariationLabel(varKey)}</span>` : ''}
                            <span style="font-size:10px;color:var(--text-3);font-weight:400;margin-left:4px;">${item.unidade}</span>
                        </td>
                        ${cellInput('entries1', val1, cell1Bg)}
                        ${cellInput('entries2', val2, cell2Bg)}
                        ${cellInput('entries3', val3, cell3Bg)}
                    </tr>`;
                }).join('');
```

- [ ] **8.2 Atualizar contador de itens no header** (linha ~4294): substituir `alm2Items.length` por `expandedRows.length` OU manter ambos:

```javascript
<span style="font-size:10px;...">(${alm2Items.length} itens · ${expandedRows.length} linhas)</span>
```

- [ ] **8.3 Verificar no browser: itens sem variação têm 1 linha, itens com condição têm 2+ linhas**

- [ ] **8.4 Commit**

```
git add index.html
git commit -m "feat: tabela de contagem expande linhas por variação NOVO/HIGIENIZADO"
```

---

## Task 9: `saveContagem` — Salvar com `size`

**Arquivo:** `index.html` (linha ~1972)

- [ ] **9.1 Substituir o bloco `const rows = validEntries.map(...)` (linha ~1984)**

```javascript
                const rows = validEntries.map(([compoundKey, qty]) => {
                    const hasSep = compoundKey.includes('::');
                    const itemId = hasSep ? compoundKey.split('::')[0] : compoundKey;
                    const varKey = hasSep ? compoundKey.slice(compoundKey.indexOf('::') + 2) : null;
                    const item   = state.items.find(i => i.id === itemId);
                    return {
                        date:         state.contagem.date,
                        item_id:      itemId,
                        item_name:    item?.nome || itemId,
                        size:         varKey || null,
                        quantidade:   Math.max(0, parseInt(qty) || 0),
                        user_name:    state.user.nome,
                        contagem_num: num,
                        turno:        state.contagem.turno  || null,
                        horario:      state.contagem.horario || null
                    };
                });
```

- [ ] **9.2 Atualizar o bloco de delete** (linha ~1997) para incluir filtragem por `size`:

O delete precisa remover apenas os registros com o mesmo `item_id` E `size`. Como o Supabase não suporta delete com composição `(item_id, size)` diretamente, deletar todos os registros do `item_id` na mesma data/turno/num e reinserir:

```javascript
                // Remove anteriores do mesmo num/data/turno para os item_ids afetados
                const uniqueItemIds = [...new Set(rows.map(r => r.item_id))];
                let delQuery = sbClient.from('daily_counts')
                    .delete()
                    .eq('date', state.contagem.date)
                    .eq('contagem_num', num)
                    .in('item_id', uniqueItemIds);
                if (state.contagem.turno) delQuery = delQuery.eq('turno', state.contagem.turno);
                await delQuery;
```

- [ ] **9.3 Atualizar `todayCounts` local** (linha ~2011):

```javascript
                rows.forEach(row => {
                    const ek = row.size ? `${row.item_id}::${row.size}` : row.item_id;
                    if (!state.contagem.todayCounts[ek]) state.contagem.todayCounts[ek] = {};
                    const key = num === 1 ? 'c1' : num === 2 ? 'c2' : 'c3';
                    state.contagem.todayCounts[ek][key] = row;
                });
```

- [ ] **9.4 Atualizar `savedResult` (bloco `if (num === 3)`)** (linha ~2019):

```javascript
                    const result = rows.map(row => {
                        const ek = row.size ? `${row.item_id}::${row.size}` : row.item_id;
                        const c2 = state.contagem.todayCounts[ek]?.c2 ?? state.contagem.lastC2[ek];
                        const c1 = state.contagem.lastC1[ek];
                        const saidaADM   = c2 != null ? c2.quantidade - row.quantidade : null;
                        const saidaTurno = c1 != null && c2 != null ? c1.quantidade - c2.quantidade : null;
                        const itemName   = row.size
                            ? `${row.item_name} — ${formatVariationLabel(row.size)}`
                            : row.item_name;
                        return {
                            item_id:       row.item_id,
                            item_name:     itemName,
                            variation_key: row.size || null,
                            c1_qtd:        c1?.quantidade ?? null,
                            c1_date:       c1?.date       ?? null,
                            c2_qtd:        c2?.quantidade ?? null,
                            c3_qtd:        row.quantidade,
                            saida:         saidaTurno,
                            saida_adm:     saidaADM,
                        };
                    });
```

- [ ] **9.5 Atualizar `lastC1` / `lastC2` nos blocos de C1/C2 salvo** (linha ~2044 e ~2050):

```javascript
                } else if (num === 2) {
                    rows.forEach(row => {
                        const ek = row.size ? `${row.item_id}::${row.size}` : row.item_id;
                        state.contagem.lastC2[ek] = { item_id: row.item_id, date: row.date, quantidade: row.quantidade, size: row.size };
                    });
                    state.contagem.contagemStep = 3;
                    ...
                } else {
                    rows.forEach(row => {
                        const ek = row.size ? `${row.item_id}::${row.size}` : row.item_id;
                        state.contagem.lastC1[ek] = { item_id: row.item_id, date: row.date, quantidade: row.quantidade, size: row.size };
                    });
                    state.contagem.contagemStep = 2;
                    ...
                }
```

- [ ] **9.6 Verificar no browser: salvar C1 com item condicional, verificar daily_counts no Supabase com `size` preenchido**

- [ ] **9.7 Commit**

```
git add index.html
git commit -m "feat: saveContagem salva campo size e usa chaves compostas nas entries"
```

---

## Task 10: `aplicarBaixaContagem` e `desfazerBaixaContagem`

**Arquivo:** `index.html`

### 10a — `aplicarBaixaContagem` — baixa por variação

- [ ] **10a.1 Substituir os dois `for` loops** (linha ~2095):

```javascript
            for (const r of itensNoite) {
                const item = state.items.find(i => i.id === r.item_id);
                if (!item) continue;
                let updPayload;
                if (r.variation_key && item.tamanhos) {
                    const novosTam = { ...item.tamanhos };
                    novosTam[r.variation_key] = Math.max(0, (novosTam[r.variation_key] || 0) - r.saida);
                    const novaQtd = Object.values(novosTam).reduce((a, b) => a + b, 0);
                    updPayload = { tamanhos: novosTam, quantidade: novaQtd };
                    item.tamanhos = novosTam;
                    item.quantidade = novaQtd;
                } else {
                    const novaQtd = Math.max(0, item.quantidade - r.saida);
                    updPayload = { quantidade: novaQtd };
                    item.quantidade = novaQtd;
                }
                const { error: updErr } = await sbClient.from('items').update(updPayload).eq('id', r.item_id);
                if (updErr) throw updErr;
                await sbClient.from('movements').insert({
                    date, type: 'SAIDA',
                    item_id: r.item_id, item_name: r.item_name,
                    quantity: r.saida,
                    size: r.variation_key || null,
                    warehouse_id: targetWh,
                    user_name: state.user.nome,
                    observations: `Baixa Contagem Diária ${dateLabel}${turnoLabel} — Noite — ${targetWhNome}`
                });
            }
            for (const r of itensAdm) {
                const item = state.items.find(i => i.id === r.item_id);
                if (!item) continue;
                let updPayload;
                if (r.variation_key && item.tamanhos) {
                    const novosTam = { ...item.tamanhos };
                    novosTam[r.variation_key] = Math.max(0, (novosTam[r.variation_key] || 0) - r.saida_adm);
                    const novaQtd = Object.values(novosTam).reduce((a, b) => a + b, 0);
                    updPayload = { tamanhos: novosTam, quantidade: novaQtd };
                    item.tamanhos = novosTam;
                    item.quantidade = novaQtd;
                } else {
                    const novaQtd = Math.max(0, item.quantidade - r.saida_adm);
                    updPayload = { quantidade: novaQtd };
                    item.quantidade = novaQtd;
                }
                const { error: updErr } = await sbClient.from('items').update(updPayload).eq('id', r.item_id);
                if (updErr) throw updErr;
                await sbClient.from('movements').insert({
                    date, type: 'DISTRIBUICAO',
                    item_id: r.item_id, item_name: r.item_name,
                    quantity: r.saida_adm,
                    size: r.variation_key || null,
                    warehouse_id: targetWh,
                    user_name: state.user.nome,
                    observations: `Baixa Contagem Diária ${dateLabel}${turnoLabel} — ADM — ${targetWhNome}`
                });
            }
```

### 10b — `desfazerBaixaContagem` — restaura por `size`

- [ ] **10b.1 Substituir o `for` loop de restauração** (linha ~2166):

```javascript
                for (const m of filtered) {
                    const item = state.items.find(i => i.id === m.item_id);
                    if (!item) continue;
                    if (m.size && item.tamanhos) {
                        const novosTam = { ...item.tamanhos };
                        novosTam[m.size] = (novosTam[m.size] || 0) + m.quantity;
                        const novaQtd = Object.values(novosTam).reduce((a, b) => a + b, 0);
                        await sbClient.from('items').update({ tamanhos: novosTam, quantidade: novaQtd }).eq('id', m.item_id);
                        item.tamanhos = novosTam;
                        item.quantidade = novaQtd;
                    } else {
                        const novaQtd = item.quantidade + m.quantity;
                        await sbClient.from('items').update({ quantidade: novaQtd }).eq('id', m.item_id);
                        item.quantidade = novaQtd;
                    }
                }
```

- [ ] **10b.2 Verificar no browser: aplicar baixa com item condicional, verificar que tamanhos são atualizados corretamente. Desfazer baixa e verificar restauração.**

- [ ] **10b.3 Commit**

```
git add index.html
git commit -m "feat: aplicarBaixaContagem e desfazer suportam variações NOVO/HIGIENIZADO"
```

---

## Task 11: Exportação XLSX

**Arquivo:** `index.html` (linha ~1084)

- [ ] **11.1 Substituir o bloco que coleta `allSizes`** (linha ~1099):

```javascript
                const allSizes = [...new Set(
                    state.items.flatMap(i => i.tamanhos ? Object.keys(i.tamanhos) : [])
                )].sort();
```

(sem mudança na coleta — mas atualizar os headers)

- [ ] **11.2 Substituir o cabeçalho de colunas na planilha** (linha ~1130, onde monta o array de headers):

Localizar linha que faz algo como:
```javascript
const headers = ['#', 'Item', 'Categoria', 'Unidade', 'Total', ...allSizes, 'Observações'];
```

Substituir para formatar as chaves:
```javascript
const headers = ['#', 'Item', 'Categoria', 'Unidade', 'Total', ...allSizes.map(s => formatVariationLabel(s)), 'Observações'];
```

- [ ] **11.3 Verificar exportação com itens condicionais — colunas devem mostrar "P — NOVO", "HIGIENIZADO", etc.**

- [ ] **11.4 Commit**

```
git add index.html
git commit -m "feat: exportação XLSX formata colunas de variação com condicoes"
```

---

## Task 12: Histórico de Movimentações

**Arquivo:** `index.html` (linha ~3854 em `renderHistory`)

- [ ] **12.1 Localizar onde o campo `size` é exibido no histórico** e substituir exibição crua pela formatada:

Procurar por `m.size` ou `movement.size` no `renderHistory` e onde aparecer como texto, usar `formatVariationLabel(m.size)`.

Exemplo: se houver `${m.size ? ` [${m.size}]` : ''}`, substituir por `${m.size ? ` [${formatVariationLabel(m.size)}]` : ''}`.

- [ ] **12.2 Verificar no browser que histórico mostra "P — NOVO" em vez de "P|NOVO"**

- [ ] **12.3 Commit final**

```
git add index.html
git commit -m "feat: histórico exibe labels de variação formatados"
```

---

## Checklist de Auto-Revisão

### Cobertura do Spec
- [x] Funções helper centrais → Task 1
- [x] Migration `daily_counts.size` → Task 2
- [x] Formulário de edição (2 checkboxes, 3 modos) → Task 3
- [x] Cards de estoque com chips agrupados → Task 4
- [x] Dropdown de variação em movimentação → Task 5
- [x] Dropdown de variação em transferência → Task 6
- [x] Carregamento de contagens com chaves compostas → Task 7
- [x] Tabela de contagem com linhas por variação → Task 8
- [x] saveContagem com `size` e chaves compostas → Task 9
- [x] Baixa e desfazer por variação → Task 10
- [x] Exportação XLSX → Task 11
- [x] Histórico formatado → Task 12

### Consistência de Tipos
- `compoundKey` sempre `"item_id::varKey"` — sem exceções
- `varKey` sempre `"P|NOVO"`, `"NOVO"`, `"P"` — nunca formatado
- `formatVariationLabel` aplicado apenas na **exibição** (HTML/labels)
- `variation_key` no `savedResult` é o `varKey` bruto (para uso em `saveMovement`)
