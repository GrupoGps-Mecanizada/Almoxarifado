# Design: Entrada em Lote de Estoque

**Data:** 2026-05-21
**Status:** Aprovado pelo usuário

## Problema

O fluxo atual de entrada (COMPRA) só permite adicionar um item por vez. Para receber um lote de materiais com muitos itens diferentes, o usuário precisa repetir o fluxo diversas vezes.

## Objetivo

Uma tela de "carrinho" onde o usuário seleciona um almoxarifado, adiciona quantas linhas quiser (item + tamanho + quantidade), e confirma tudo de uma vez, gerando um movimento COMPRA por linha.

## Fora do escopo

- Fornecedor, observações, valor
- Múltiplos almoxarifados numa mesma operação em lote
- Importação via CSV/Excel

---

## Design

### Fluxo

1. Botão **"Entrada em Lote"** na tela de Estoque (ao lado de "Novo Item" no header)
2. Tela `batchMovement`:
   - Seleção de almoxarifado (radio cards, igual ao fluxo atual)
   - Mini-formulário de adição de linha:
     - Toggle "Item Existente / Novo Item" (radio)
     - Para existente: dropdown com itens do almoxarifado selecionado
     - Para novo: campos Nome + Categoria (select) + Unidade (select, default UN)
     - Campo Tamanho/Numeração (texto livre, opcional)
     - Campo Quantidade (numérico, mín. 1)
     - Botão "+ Adicionar"
   - Lista de linhas adicionadas (carrinho), cada linha mostra: nome do item, tamanho, quantidade, botão remover (×)
   - Rodapé: botão "CANCELAR" e botão "CONFIRMAR X ENTRADAS" (X = total de linhas)
3. Ao confirmar:
   - Para cada linha com novo item: `saveItem()` primeiro, depois `saveMovement()`
   - Para cada linha com item existente: `saveMovement()` direto
   - Toast de progresso e sucesso ao final
   - Navega de volta ao estoque

### Regras de validação

- Almoxarifado deve estar selecionado
- Ao menos 1 linha no carrinho
- Cada linha deve ter item (existente selecionado ou novo com nome preenchido) e quantidade > 0
- Novo item deve ter categoria preenchida

---

## Estado (`state.batchOperation`)

```javascript
batchOperation: {
    active: false,
    targetWarehouse: 'alm-1',
    // mini-form (linha sendo composta)
    form: {
        createNewItem: false,
        selectedItem: null,
        newItemName: '',
        newItemCategory: '',
        newItemUnit: 'UN',
        size: '',
        quantity: 1
    },
    // carrinho acumulado
    lines: [
        // { id, isNew, itemId, itemName, categoria, unidade, size, quantity }
    ]
}
```

---

## Arquivos afetados

| Arquivo | Mudança |
|---------|---------|
| `js/state.js` | Adicionar `batchOperation` ao estado inicial |
| `js/app.js` | `renderBatchMovement()`, `addBatchItem()`, `removeBatchItem()`, `confirmBatchMovement()`, botão "Entrada em Lote" em `renderStock()`, case `'batchMovement'` no switch de render |

---

## Fluxo de dados

```
[Botão "Entrada em Lote" em renderStock()]
  → state.batchOperation = { active: true, targetWarehouse: state.activeWarehouse, form: {...defaults}, lines: [] }
  → navigateTo('batchMovement')

[addBatchItem()]
  → valida mini-form
  → push { id: Date.now(), isNew, itemId, itemName, size, quantity } em state.batchOperation.lines
  → reseta mini-form (mantém almoxarifado e tipo)
  → render()

[removeBatchItem(lineId)]
  → filtra state.batchOperation.lines removendo o id
  → render()

[confirmBatchMovement()]
  → para cada linha:
      if isNew: await saveItem(novoItem) → await saveMovement(COMPRA)
      else:     await saveMovement(COMPRA)
  → cancelBatchMovement() → navega ao estoque
```

---

## UI — estrutura da tela

```
┌─────────────────────────────────────┐
│ ← Entrada em Lote          [×]      │
├─────────────────────────────────────┤
│ Almoxarifado de Destino             │
│ [○ Central] [○ Distribuição] [○ ...] │
├─────────────────────────────────────┤
│ Adicionar Item                      │
│ [● Existente] [○ Novo Item]         │
│ [dropdown de itens ▼]               │
│ Tamanho: [______]  Qtd: [__]        │
│                    [+ Adicionar]    │
├─────────────────────────────────────┤
│ LISTA (3 itens)                     │
│ Capacete P · 5un            [×]     │
│ Botina 38 · 3un             [×]     │
│ Luva M · 10un               [×]     │
├─────────────────────────────────────┤
│ [CANCELAR]    [CONFIRMAR 3 ENTRADAS]│
└─────────────────────────────────────┘
```
