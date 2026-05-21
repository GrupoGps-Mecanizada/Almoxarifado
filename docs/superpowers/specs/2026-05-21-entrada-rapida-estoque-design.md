# Design: Entrada Rápida de Estoque

**Data:** 2026-05-21
**Status:** Aprovado pelo usuário

## Problema

Atualmente o único modo de adicionar estoque a um item é editando o item diretamente. O fluxo de COMPRA existe mas é obscuro e carregado de campos desnecessários (fornecedor, observações). Não há atalho rápido na tela de Estoque.

## Objetivo

Formulário de entrada de estoque simples e acessível: almoxarifado → item → tamanho/numeração → quantidade. Nada mais.

## Fora do escopo

- Fornecedor
- Número CA
- Valor / preço
- Observações

---

## Design

### 1. Simplificar `renderMovement()` — COMPRA

Remover do formulário:
- Campo "Fornecedor"
- Campo "Observações"

Manter:
- Almoxarifado de Destino (radio cards com todos os warehouses)
- Tipo de Entrada: "Item Existente" / "Novo Item" (radio)
- Para **Item Existente**: dropdown de itens do almoxarifado selecionado + tamanho/numeração quando o item tiver tamanhos
- Para **Novo Item**: Nome + Categoria (select, default "Proteção Individual") + Unidade (select, default "UN")
- Quantidade (input numérico, mínimo 1)
- Botão "CONFIRMAR ENTRADA"

O título muda de "Compra de Estoque" para "Entrada de Estoque".

### 2. Botão `+ Entrada` por item na tela de Estoque

Em `renderStock()`, cada card de item ganha um botão `+ Entrada`.

Ao clicar → chama `startMovementForItem(itemId)`:
- `state.movementOperation.selectedItem = itemId`
- `state.movementOperation.targetWarehouse = item.warehouse_id`
- `state.movementOperation.createNewItem = false`
- `navigateTo('movement')`

### 3. Nova função `startMovementForItem(itemId)`

```js
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
```

### 4. Botão flutuante "+ Nova Entrada" na tela de Estoque

Botão fixo no canto inferior da tela de Estoque que chama `startMovement('COMPRA')` sem pré-seleção (modo padrão "Item Existente").

---

## Arquivos afetados

| Arquivo | Mudanças |
|---------|----------|
| `js/app.js` | `renderMovement()` — remove fornecedor/observações, renomeia título; `renderStock()` — adiciona botão `+ Entrada` por item e botão flutuante; nova função `startMovementForItem(itemId)` |
| `js/state.js` | Remove `supplier` e `observations` do estado inicial de `movementOperation` |
| `js/api.js` | `saveMovement()` — garante `supplier: ''` e `observations: ''` quando ausentes (compatibilidade DB) |

---

## Fluxo

```
[Botão + Entrada no card do item]
  → startMovementForItem(itemId)
  → state.movementOperation = { type: 'COMPRA', selectedItem: itemId, targetWarehouse: item.warehouse_id }
  → navigateTo('movement')

[Formulário renderMovement()]
  → Almoxarifado, Item/Novo Item, Tamanho, Quantidade
  → confirmMovement()
  → saveItem() se novo item
  → saveMovement({ type: 'COMPRA', warehouse_id, item_id, size, quantity, supplier: '', observations: '' })
  → item.quantidade += quantity (otimista) + persist Supabase
```

---

## Compatibilidade DB

`supplier` e `observations` são nullable no schema. Serão enviados como `''` — sem migração necessária.
