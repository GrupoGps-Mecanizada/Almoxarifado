# Entrada Rápida de Estoque — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar botão `+ Entrada` em cada item da tela de Estoque e simplificar o formulário de COMPRA, removendo campos de fornecedor e observações.

**Architecture:** Vanilla JS SPA sem framework de testes — verificação é manual no browser. Todas as mudanças são em `js/app.js` e `js/config.js`. Nenhuma mudança de schema de banco de dados é necessária; `supplier` e `observations` continuam no objeto de movimento como strings vazias para compatibilidade.

**Tech Stack:** Vanilla JS ES6, HTML5, Supabase JS v2, Phosphor Icons

---

## Arquivos Modificados

| Arquivo | Mudança |
|---------|---------|
| `js/config.js` | Label do tipo COMPRA: "Compra de Estoque" → "Entrada de Estoque" |
| `js/app.js` | Nova função `startMovementForItem()`; `renderMovement()` sem fornecedor/observações; `renderStock()` com botão por item e botão flutuante; textos do seletor e dashboard atualizados |

---

## Task 1: Renomear COMPRA para "Entrada de Estoque" em config.js e textos do app

**Files:**
- Modify: `js/config.js:21`
- Modify: `js/app.js:2501-2502` (dashboard quick action)
- Modify: `js/app.js:2619-2622` (movement selector card)

- [ ] **Step 1: Atualizar label em config.js**

Em `js/config.js`, linha 21, substituir:
```javascript
'COMPRA':       { label: 'Compra de Estoque',   color: 'emerald', icon: 'shopping-cart',    sign: '+' },
```
Por:
```javascript
'COMPRA':       { label: 'Entrada de Estoque',  color: 'emerald', icon: 'shopping-cart',    sign: '+' },
```

- [ ] **Step 2: Atualizar texto do card no dashboard (quick action)**

Em `js/app.js`, localizar o bloco:
```javascript
<button onclick="startMovement('COMPRA')" class="action-card">
    <div class="action-icon icon-green"><i class="ph-fill ph-shopping-cart"></i></div>
    <h3>Compra</h3><p>Registrar entrada</p>
</button>
```
Substituir por:
```javascript
<button onclick="startMovement('COMPRA')" class="action-card">
    <div class="action-icon icon-green"><i class="ph-fill ph-shopping-cart"></i></div>
    <h3>Entrada</h3><p>Adicionar ao estoque</p>
</button>
```

- [ ] **Step 3: Atualizar texto do card no movement selector**

Em `js/app.js`, localizar o bloco no `renderMovementSelector()`:
```javascript
<button onclick="startMovement('COMPRA')" class="action-card" style="padding:28px;">
    <div class="action-icon icon-green" style="width:56px;height:56px;font-size:26px;"><i class="ph-fill ph-shopping-cart"></i></div>
    <h3 style="font-size:16px;">Compra de Estoque</h3>
    <p>Registrar entrada de material</p>
```
Substituir por:
```javascript
<button onclick="startMovement('COMPRA')" class="action-card" style="padding:28px;">
    <div class="action-icon icon-green" style="width:56px;height:56px;font-size:26px;"><i class="ph-fill ph-shopping-cart"></i></div>
    <h3 style="font-size:16px;">Entrada de Estoque</h3>
    <p>Adicionar itens ao almoxarifado</p>
```

- [ ] **Step 4: Verificar no browser**

Abrir o app. Verificar:
- Dashboard: card "Entrada / Adicionar ao estoque" ✓
- Menu de movimentações: card "Entrada de Estoque" ✓
- Ao abrir a tela de compra: título "Entrada de Estoque" ✓

- [ ] **Step 5: Commit**

```bash
git add js/config.js js/app.js
git commit -m "feat: renomear COMPRA para Entrada de Estoque na UI"
```

---

## Task 2: Adicionar função `startMovementForItem()`

**Files:**
- Modify: `js/app.js` — inserir após `cancelMovement()` (após linha 628)

- [ ] **Step 1: Inserir a função após `cancelMovement()`**

Localizar o fim de `cancelMovement()` em `js/app.js`:
```javascript
    goBack();
}

async function confirmMovement() {
```
Substituir por:
```javascript
    goBack();
}

function startMovementForItem(itemId) {
    const item = state.items.find(i => i.id === itemId);
    state.movementOperation = {
        active: true,
        type: 'COMPRA',
        selectedItem: itemId,
        employeeName: '',
        supplier: '',
        quantity: 1,
        observations: '',
        targetWarehouse: item?.warehouse_id || state.activeWarehouse,
        createNewItem: false,
        newItemName: '',
        newItemCategory: '',
        newItemUnit: 'UN'
    };
    navigateTo('movement');
}

async function confirmMovement() {
```

- [ ] **Step 2: Verificar no browser (console)**

Abrir o app na tela de Estoque. No console do browser:
```javascript
// Pegar o id de qualquer item
const item = state.items[0];
startMovementForItem(item.id);
```
Esperado: tela de "Entrada de Estoque" abre com o item pré-selecionado no dropdown e o almoxarifado correto marcado.

- [ ] **Step 3: Commit**

```bash
git add js/app.js
git commit -m "feat: adicionar startMovementForItem() para entrada rápida"
```

---

## Task 3: Simplificar `renderMovement()` — remover fornecedor e observações

**Files:**
- Modify: `js/app.js` — `renderMovement()` linhas ~2762-2773

- [ ] **Step 1: Remover campo Fornecedor**

Em `renderMovement()`, localizar e remover o bloco inteiro:
```javascript
                <div class="field-group">
                    <label class="field-label">Fornecedor</label>
                    <input class="field-input" type="text" value="${op.supplier}" oninput="state.movementOperation.supplier=this.value" placeholder="Nome do fornecedor (opcional)">
                </div>
```

- [ ] **Step 2: Remover campo Observações**

Localizar e remover o bloco inteiro:
```javascript
                <div class="field-group">
                    <label class="field-label">Observações</label>
                    <textarea class="field-input" rows="3" oninput="state.movementOperation.observations=this.value" placeholder="Informações adicionais">${op.observations}</textarea>
                </div>
```

- [ ] **Step 3: Atualizar texto do botão de confirmação**

Localizar:
```javascript
                        <i class="ph ph-check-circle"></i> CONFIRMAR COMPRA
```
Substituir por:
```javascript
                        <i class="ph ph-check-circle"></i> CONFIRMAR ENTRADA
```

- [ ] **Step 4: Verificar no browser**

Abrir o app → clicar em qualquer botão que leve ao formulário de Entrada de Estoque.
Verificar:
- Não existe campo "Fornecedor" ✓
- Não existe campo "Observações" ✓
- Botão mostra "CONFIRMAR ENTRADA" ✓
- Seleção de almoxarifado e item continuam funcionando ✓
- Confirmar uma entrada (item existente, quantidade 1) → item soma +1 no estoque ✓
- Confirmar uma entrada (novo item) → item aparece no estoque com a quantidade informada ✓

- [ ] **Step 5: Commit**

```bash
git add js/app.js
git commit -m "feat: simplificar formulário de entrada — remover fornecedor e observações"
```

---

## Task 4: Adicionar botão `+ Entrada` em cada item e botão flutuante em `renderStock()`

**Files:**
- Modify: `js/app.js` — `renderStock()` bloco `item-actions` (~linha 2902) e antes do `renderBaixaModal` (~linha 2913)

- [ ] **Step 1: Substituir o bloco `item-actions` no card de item**

Localizar o bloco `item-actions` exato dentro do `filteredItems.map`:
```javascript
                        <div class="item-actions">
                            <button onclick='openEditItem(${JSON.stringify(item).replace(/'/g, "&#39;")})' class="btn-secondary" style="flex:1;font-size:12px;padding:8px;"><i class="ph ph-pencil-simple"></i> Editar</button>
                            <button onclick="startTransfer('${item.warehouse_id || 'alm-1'}','${item.id}')" class="btn-cyan" style="padding:8px 12px;font-size:12px;" title="Transferir / Dar Baixa"><i class="ph ph-arrows-left-right"></i> Transferir</button>
                            <button onclick="handleDeleteItem('${item.id}')" class="btn-danger" style="padding:8px 10px;"><i class="ph ph-trash"></i></button>
                        </div>
```
Substituir por:
```javascript
                        <div class="item-actions">
                            <button onclick="startMovementForItem('${item.id}')" class="btn-primary" style="flex:1;font-size:12px;padding:8px;"><i class="ph ph-arrow-down-circle"></i> + Entrada</button>
                            <button onclick='openEditItem(${JSON.stringify(item).replace(/'/g, "&#39;")})' class="btn-secondary" style="padding:8px 10px;font-size:12px;" title="Editar"><i class="ph ph-pencil-simple"></i></button>
                            <button onclick="startTransfer('${item.warehouse_id || 'alm-1'}','${item.id}')" class="btn-cyan" style="padding:8px 10px;font-size:12px;" title="Transferir"><i class="ph ph-arrows-left-right"></i></button>
                            <button onclick="handleDeleteItem('${item.id}')" class="btn-danger" style="padding:8px 10px;"><i class="ph ph-trash"></i></button>
                        </div>
```

- [ ] **Step 2: Adicionar botão flutuante "+ Nova Entrada" antes do renderBaixaModal**

Localizar ao final de `renderStock()`:
```javascript
        ${state.baixaModal.open ? renderBaixaModal() : ''}
    </div>
</div>
```
Substituir por:
```javascript
        ${state.activeWarehouse !== 'alm-emergencial' ? `
        <div style="position:fixed;bottom:80px;right:20px;z-index:100;">
            <button onclick="startMovement('COMPRA')" class="btn-primary"
                style="border-radius:50px;padding:14px 22px;box-shadow:0 4px 24px rgba(0,0,0,0.35);font-size:14px;display:flex;align-items:center;gap:8px;">
                <i class="ph-fill ph-plus-circle"></i> Nova Entrada
            </button>
        </div>` : ''}
        ${state.baixaModal.open ? renderBaixaModal() : ''}
    </div>
</div>
```

- [ ] **Step 3: Verificar no browser**

Abrir app → tela Estoque (aba Central ou Distribuição).
Verificar:
- Cada card de item tem botão "+ Entrada" como ação principal ✓
- Botão "Editar" virou ícone-only sem texto ✓
- Botão "Transferir" virou ícone-only sem texto ✓
- Botão "Excluir" permanece ✓
- Botão flutuante "Nova Entrada" aparece no canto inferior direito ✓
- Clicar em "+ Entrada" de um item específico → formulário abre com item já selecionado ✓
- Clicar em "Nova Entrada" (flutuante) → formulário abre sem item pré-selecionado ✓
- Aba Emergencial: botão flutuante NÃO aparece ✓

- [ ] **Step 4: Commit**

```bash
git add js/app.js
git commit -m "feat: botão + Entrada por item e botão flutuante Nova Entrada no estoque"
```

---

## Self-review checklist

- [x] Spec coverage: label renomeado ✓, fornecedor/obs removidos ✓, startMovementForItem ✓, botão por item ✓, botão flutuante ✓, compatibilidade DB ✓
- [x] Sem placeholders ou TBDs
- [x] `startMovementForItem` definida na Task 2, usada na Task 4 — consistente
- [x] `state.movementOperation.supplier` e `observations` permanecem no state e no objeto de movimento (passados como `''`) — compatibilidade DB garantida
