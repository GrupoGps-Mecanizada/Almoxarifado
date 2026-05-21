# Entrada em Lote de Estoque — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar uma tela de "carrinho" onde o usuário escolhe um almoxarifado, adiciona linhas (item + tamanho + quantidade) e confirma tudo de uma vez, gerando um movimento COMPRA por linha.

**Architecture:** Nova view `batchMovement` seguindo os padrões existentes do app (vanilla JS SPA, render() switch, estado global). Estado em `state.batchOperation`. Funções de controle em `js/app.js`. Sem novo arquivo — segue o padrão do projeto onde tudo vive em app.js.

**Tech Stack:** Vanilla JS ES6, HTML5 string templates, Supabase JS v2, Phosphor Icons. Sem framework de testes — verificação é manual no browser.

---

## Arquivos Modificados

| Arquivo | Mudança |
|---------|---------|
| `js/state.js` | Adicionar `batchOperation` ao estado inicial |
| `js/app.js` | 4 funções novas + `renderBatchMovement()` + case no switch + botão em `renderStock()` |

---

## Task 1: Adicionar `batchOperation` ao estado em state.js

**Files:**
- Modify: `js/state.js:57-58` (após o bloco `movementOperation`)

- [ ] **Step 1: Inserir `batchOperation` no estado**

Em `js/state.js`, localizar o fim do bloco `movementOperation`:
```javascript
        newItemCategory: '',
        newItemUnit: 'UN'
    },

    editingItem: null,
```
Substituir por:
```javascript
        newItemCategory: '',
        newItemUnit: 'UN'
    },

    batchOperation: {
        active: false,
        targetWarehouse: 'alm-1',
        form: {
            createNewItem: false,
            selectedItem: null,
            newItemName: '',
            newItemCategory: '',
            newItemUnit: 'UN',
            size: '',
            quantity: 1
        },
        lines: []
    },

    editingItem: null,
```

- [ ] **Step 2: Verificar no browser (console)**

Abrir o app. No console:
```javascript
console.log(state.batchOperation);
// Esperado: { active: false, targetWarehouse: 'alm-1', form: {...}, lines: [] }
```

- [ ] **Step 3: Commit**

```bash
git add js/state.js
git commit -m "feat: adicionar batchOperation ao estado global"
```

---

## Task 2: Adicionar funções de controle da entrada em lote

**Files:**
- Modify: `js/app.js` — inserir após `startMovementForItem()` (após linha ~648)

- [ ] **Step 1: Inserir as 5 funções após `startMovementForItem()`**

Localizar em `js/app.js`:
```javascript
    navigateTo('movement');
}

async function confirmMovement() {
```
Substituir por:
```javascript
    navigateTo('movement');
}

function startBatchMovement() {
    state.batchOperation = {
        active: true,
        targetWarehouse: state.activeWarehouse,
        form: {
            createNewItem: false,
            selectedItem: null,
            newItemName: '',
            newItemCategory: '',
            newItemUnit: 'UN',
            size: '',
            quantity: 1
        },
        lines: []
    };
    navigateTo('batchMovement');
}

function addBatchItem() {
    const op = state.batchOperation;
    const f = op.form;

    if (f.createNewItem) {
        if (!f.newItemName.trim()) { showToast('Nome do item é obrigatório', 'error'); return; }
        if (!f.newItemCategory) { showToast('Categoria é obrigatória', 'error'); return; }
    } else {
        if (!f.selectedItem) { showToast('Selecione um item', 'error'); return; }
    }
    if (!f.quantity || f.quantity < 1) { showToast('Quantidade deve ser maior que zero', 'error'); return; }

    const existingItem = f.createNewItem ? null : state.items.find(i => i.id === f.selectedItem);
    const itemName = f.createNewItem
        ? f.newItemName.trim().toUpperCase()
        : (existingItem?.nome || '');

    op.lines.push({
        id: Date.now() + Math.floor(Math.random() * 1000),
        isNew: f.createNewItem,
        itemId: f.createNewItem ? null : f.selectedItem,
        itemName,
        categoria: f.createNewItem ? f.newItemCategory : (existingItem?.categoria || ''),
        unidade: f.createNewItem ? f.newItemUnit : (existingItem?.unidade || 'UN'),
        size: f.size.trim() || null,
        quantity: f.quantity
    });

    op.form.selectedItem = null;
    op.form.newItemName = '';
    op.form.size = '';
    op.form.quantity = 1;
    render();
}

function removeBatchItem(lineId) {
    state.batchOperation.lines = state.batchOperation.lines.filter(l => l.id !== lineId);
    render();
}

function cancelBatchMovement() {
    state.batchOperation = {
        active: false,
        targetWarehouse: state.activeWarehouse,
        form: {
            createNewItem: false,
            selectedItem: null,
            newItemName: '',
            newItemCategory: '',
            newItemUnit: 'UN',
            size: '',
            quantity: 1
        },
        lines: []
    };
    goBack();
}

async function confirmBatchMovement() {
    const op = state.batchOperation;
    if (!op.lines.length) { showToast('Adicione ao menos um item', 'error'); return; }

    showToast('Processando entradas...', 'info', 10000);

    for (const line of op.lines) {
        let itemId = line.itemId;

        if (line.isNew) {
            const newItemId = 'ITEM-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
            const newItem = {
                id: newItemId,
                nome: line.itemName,
                categoria: line.categoria,
                quantidade: 0,
                unidade: line.unidade,
                unidades_por_caixa: 1,
                tamanhos: null,
                observacoes: '',
                warehouse_id: op.targetWarehouse
            };
            const itemResult = await saveItem(newItem);
            if (!itemResult.success) {
                showToast(`Erro ao criar item "${line.itemName}"`, 'error');
                return;
            }
            itemId = newItemId;
        }

        const movement = {
            date: getCurrentDate(),
            type: 'COMPRA',
            item_id: itemId,
            item_name: line.size ? `${line.itemName} (${line.size})` : line.itemName,
            size: line.size || null,
            quantity: line.quantity,
            employee: '',
            supplier: '',
            user_name: state.user.nome,
            observations: '',
            warehouse_id: op.targetWarehouse
        };

        const movResult = await saveMovement(movement);
        if (!movResult.success) {
            showToast(`Erro ao registrar entrada de "${line.itemName}"`, 'error');
            return;
        }
    }

    showToast(`${op.lines.length} entrada(s) registrada(s) com sucesso!`, 'success');
    cancelBatchMovement();
}

async function confirmMovement() {
```

- [ ] **Step 2: Verificar no browser (console)**

Abrir o app. No console:
```javascript
startBatchMovement();
// Esperado: navega para view batchMovement (vai dar erro de render por enquanto — normal, Task 3 ainda não foi feita)
```
Verificar que `state.batchOperation.active === true` e `state.batchOperation.lines` é array vazio.

- [ ] **Step 3: Commit**

```bash
git add js/app.js
git commit -m "feat: funcoes startBatchMovement, addBatchItem, removeBatchItem, cancelBatchMovement, confirmBatchMovement"
```

---

## Task 3: Adicionar `renderBatchMovement()`

**Files:**
- Modify: `js/app.js` — inserir antes de `renderStock()` (antes da linha `function renderStock()`)

- [ ] **Step 1: Inserir `renderBatchMovement()` antes de `renderStock()`**

Localizar em `js/app.js`:
```javascript
function renderStock() {
    const filteredItems = getFilteredItems();
```
Inserir **antes** dessa linha:
```javascript
function renderBatchMovement() {
    const op = state.batchOperation;
    const f = op.form;
    const itemsInWarehouse = state.items.filter(i => (i.warehouse_id || 'alm-1') === op.targetWarehouse);

    return `
<div class="page-wrap">
    ${renderHeader()}
    <div class="page-content-sm">
        <div class="card-lg">
            <div class="row-between" style="margin-bottom:24px;">
                <h1 class="page-title">
                    <i class="ph-fill ph-shopping-cart text-green"></i>
                    Entrada em Lote
                </h1>
                <button onclick="cancelBatchMovement()" class="btn-icon"><i class="ph ph-x"></i></button>
            </div>

            <div class="stack">
                <div class="field-group">
                    <label class="field-label">Almoxarifado de Destino *</label>
                    <div class="grid-2">
                        ${state.warehouses.filter(w => w.id !== 'alm-emergencial').map(wh => `
                            <label class="radio-card ${op.targetWarehouse === wh.id ? 'selected' : ''}">
                                <input type="radio" name="batchWarehouse" value="${wh.id}" ${op.targetWarehouse === wh.id ? 'checked' : ''}
                                    onchange="state.batchOperation.targetWarehouse=this.value;state.batchOperation.form.selectedItem=null;render()" style="width:16px;height:16px;">
                                <div>
                                    <div class="radio-card-title">${wh.nome}</div>
                                    <div class="radio-card-sub">${wh.descricao}</div>
                                </div>
                            </label>
                        `).join('')}
                    </div>
                </div>

                <div class="card-sm" style="border-color:color-mix(in srgb,var(--green) 30%,transparent);background:color-mix(in srgb,var(--green) 4%,transparent);">
                    <div style="font-weight:700;color:var(--green);margin-bottom:12px;font-size:13px;display:flex;align-items:center;gap:6px;">
                        <i class="ph-fill ph-plus-circle"></i> Adicionar Item à Lista
                    </div>
                    <div class="stack-sm">
                        <div class="grid-2">
                            <label class="radio-card ${!f.createNewItem ? 'selected' : ''}">
                                <input type="radio" name="batchEntryType" ${!f.createNewItem ? 'checked' : ''}
                                    onchange="state.batchOperation.form.createNewItem=false;state.batchOperation.form.selectedItem=null;render()" style="width:16px;height:16px;">
                                <div><div class="radio-card-title">Item Existente</div></div>
                            </label>
                            <label class="radio-card ${f.createNewItem ? 'selected' : ''}">
                                <input type="radio" name="batchEntryType" ${f.createNewItem ? 'checked' : ''}
                                    onchange="state.batchOperation.form.createNewItem=true;state.batchOperation.form.selectedItem=null;render()" style="width:16px;height:16px;">
                                <div><div class="radio-card-title">Novo Item</div></div>
                            </label>
                        </div>

                        ${!f.createNewItem ? `
                            <div class="field-group">
                                <label class="field-label">Item *</label>
                                <select class="field-input field-select" onchange="state.batchOperation.form.selectedItem=this.value;render()">
                                    <option value="">-- Escolha um item --</option>
                                    ${itemsInWarehouse.map(item => `<option value="${item.id}" ${f.selectedItem === item.id ? 'selected' : ''}>${item.nome} (${item.quantidade})</option>`).join('')}
                                </select>
                            </div>
                        ` : `
                            <div class="field-group">
                                <label class="field-label">Nome do Item *</label>
                                <input class="field-input" type="text" value="${f.newItemName}"
                                    oninput="state.batchOperation.form.newItemName=this.value"
                                    placeholder="Ex: Capacete de Segurança">
                            </div>
                            <div class="grid-2">
                                <div class="field-group">
                                    <label class="field-label">Categoria *</label>
                                    <select class="field-input field-select" onchange="state.batchOperation.form.newItemCategory=this.value">
                                        <option value="">Selecione...</option>
                                        <option value="Proteção Individual" ${f.newItemCategory === 'Proteção Individual' ? 'selected' : ''}>Proteção Individual</option>
                                        <option value="Ferramentas" ${f.newItemCategory === 'Ferramentas' ? 'selected' : ''}>Ferramentas</option>
                                        <option value="Uniformes" ${f.newItemCategory === 'Uniformes' ? 'selected' : ''}>Uniformes</option>
                                        <option value="Outros" ${f.newItemCategory === 'Outros' ? 'selected' : ''}>Outros</option>
                                    </select>
                                </div>
                                <div class="field-group">
                                    <label class="field-label">Unidade</label>
                                    <select class="field-input field-select" onchange="state.batchOperation.form.newItemUnit=this.value">
                                        <option value="UN" ${f.newItemUnit === 'UN' ? 'selected' : ''}>UN</option>
                                        <option value="PAR" ${f.newItemUnit === 'PAR' ? 'selected' : ''}>PAR</option>
                                        <option value="CX" ${f.newItemUnit === 'CX' ? 'selected' : ''}>CX</option>
                                        <option value="KG" ${f.newItemUnit === 'KG' ? 'selected' : ''}>KG</option>
                                        <option value="LT" ${f.newItemUnit === 'LT' ? 'selected' : ''}>LT</option>
                                    </select>
                                </div>
                            </div>
                        `}

                        <div class="grid-2">
                            <div class="field-group">
                                <label class="field-label">Tamanho / Numeração</label>
                                <input class="field-input" type="text" value="${f.size}"
                                    oninput="state.batchOperation.form.size=this.value"
                                    placeholder="Ex: 38, M, G...">
                            </div>
                            <div class="field-group">
                                <label class="field-label">Quantidade *</label>
                                <input class="field-input" type="number" value="${f.quantity}" min="1"
                                    oninput="state.batchOperation.form.quantity=parseInt(this.value)||1">
                            </div>
                        </div>

                        <button type="button" onclick="addBatchItem()" class="btn-primary" style="width:100%;">
                            <i class="ph ph-plus"></i> Adicionar à Lista
                        </button>
                    </div>
                </div>

                ${op.lines.length === 0 ? `
                    <div style="text-align:center;padding:24px;color:var(--text-3);border:1px dashed var(--border);border-radius:var(--radius-md);">
                        <i class="ph ph-list-bullets" style="font-size:32px;display:block;margin-bottom:8px;"></i>
                        Nenhum item adicionado ainda
                    </div>
                ` : `
                    <div>
                        <div style="font-size:12px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;">
                            Lista — ${op.lines.length} ${op.lines.length === 1 ? 'item' : 'itens'}
                        </div>
                        <div class="stack-sm">
                            ${op.lines.map(line => `
                                <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--bg-2);border-radius:var(--radius-sm);border:1px solid var(--border);">
                                    <div>
                                        <div style="font-weight:600;font-size:13px;color:var(--text-1);">${line.itemName}${line.isNew ? ' <span style="font-size:10px;color:var(--green);font-weight:700;">NOVO</span>' : ''}</div>
                                        <div style="font-size:11px;color:var(--text-3);">${line.size ? `Tam: ${line.size} · ` : ''}${line.quantity} ${line.unidade}</div>
                                    </div>
                                    <button onclick="removeBatchItem(${line.id})" class="btn-icon" style="color:var(--red);"><i class="ph ph-x"></i></button>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `}

                <div class="row-end" style="padding-top:8px;">
                    <button type="button" onclick="cancelBatchMovement()" class="btn-ghost">CANCELAR</button>
                    <button type="button" onclick="confirmBatchMovement()" class="btn-primary" style="min-width:200px;" ${op.lines.length === 0 ? 'disabled' : ''}>
                        <i class="ph ph-check-circle"></i> CONFIRMAR ${op.lines.length} ${op.lines.length === 1 ? 'ENTRADA' : 'ENTRADAS'}
                    </button>
                </div>
            </div>
        </div>
    </div>
</div>
    `;
}

function renderStock() {
    const filteredItems = getFilteredItems();
```

- [ ] **Step 2: Verificar no browser**

Abrir o app. No console:
```javascript
startBatchMovement();
```
Esperado: tela "Entrada em Lote" renderiza corretamente com seleção de almoxarifado, mini-form e área de lista vazia.

- [ ] **Step 3: Commit**

```bash
git add js/app.js
git commit -m "feat: renderBatchMovement — tela de entrada em lote com carrinho"
```

---

## Task 4: Conectar view ao switch e adicionar botão em renderStock()

**Files:**
- Modify: `js/app.js:2405` — switch case `'stock'`
- Modify: `js/app.js` — header de `renderStock()` (botão ao lado de "Novo Item")

- [ ] **Step 1: Adicionar case `batchMovement` no switch do render()**

Localizar em `js/app.js`:
```javascript
        case 'stock': app.innerHTML = renderStock(); break;
        case 'movementSelector': app.innerHTML = renderMovementSelector(); break;
```
Substituir por:
```javascript
        case 'stock': app.innerHTML = renderStock(); break;
        case 'batchMovement': app.innerHTML = renderBatchMovement(); break;
        case 'movementSelector': app.innerHTML = renderMovementSelector(); break;
```

- [ ] **Step 2: Adicionar botão "Entrada em Lote" no header do Estoque**

Localizar em `js/app.js` dentro de `renderStock()`:
```javascript
                <button onclick="exportStockToXLSX()" class="btn-secondary"><i class="ph-fill ph-download-simple"></i> <span>Exportar</span></button>
                <button onclick="openNewItem()" class="btn-primary"><i class="ph-fill ph-plus-circle"></i> <span>Novo Item</span></button>
```
Substituir por:
```javascript
                <button onclick="exportStockToXLSX()" class="btn-secondary"><i class="ph-fill ph-download-simple"></i> <span>Exportar</span></button>
                <button onclick="startBatchMovement()" class="btn-secondary"><i class="ph-fill ph-list-plus"></i> <span>Entrada em Lote</span></button>
                <button onclick="openNewItem()" class="btn-primary"><i class="ph-fill ph-plus-circle"></i> <span>Novo Item</span></button>
```

- [ ] **Step 3: Verificar fluxo completo no browser**

1. Ir para tela de Estoque → botão "Entrada em Lote" aparece no header ✓
2. Clicar em "Entrada em Lote" → tela abre com almoxarifado pré-selecionado ✓
3. Selecionar item existente + tamanho + quantidade → clicar "+ Adicionar" → linha aparece na lista ✓
4. Adicionar mais linhas (incluindo uma de novo item) ✓
5. Remover uma linha com o botão × ✓
6. Botão "CONFIRMAR X ENTRADAS" mostra a contagem correta ✓
7. Confirmar → itens aparecem no estoque com quantidades corretas ✓
8. Toast de sucesso e redirecionamento ao estoque ✓

- [ ] **Step 4: Commit**

```bash
git add js/app.js
git commit -m "feat: conectar batchMovement ao router e botao Entrada em Lote no estoque"
```

---

## Self-Review

- [x] **Spec coverage:**
  - Almoxarifado único escolhido no início ✓ (Task 1/3)
  - Item existente ou novo ✓ (Task 2/3)
  - Uma linha por tamanho ✓ (Task 2/3)
  - Confirmar tudo de uma vez ✓ (Task 2)
  - Movimento COMPRA por linha ✓ (confirmBatchMovement)
  - Botão de acesso na tela de Estoque ✓ (Task 4)
- [x] **Sem placeholders** — todo código completo
- [x] **Consistência de nomes:** `batchOperation`, `addBatchItem`, `removeBatchItem`, `cancelBatchMovement`, `confirmBatchMovement`, `startBatchMovement`, `renderBatchMovement` — usados de forma consistente em todas as tasks
- [x] **IDs de linha únicos:** `Date.now() + Math.random()` para evitar colisão em loop rápido
- [x] **saveMovement pode retornar undefined se item não for encontrado:** para linhas de novos itens, `saveItem` adiciona o item a `state.items` de forma otimista antes de retornar, então `saveMovement` encontra o item ✓
