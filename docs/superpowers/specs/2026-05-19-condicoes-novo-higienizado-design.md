# Design: Classificação NOVO / HIGIENIZADO nos Itens

**Data:** 2026-05-19  
**Status:** Aprovado

---

## Objetivo

Permitir que itens do almoxarifado sejam classificados por condição — **NOVO** ou **HIGIENIZADO** — de forma análoga ao sistema de tamanhos existente. A classificação é opcional por item, pode coexistir com tamanhos, e deve funcionar em todas as áreas: estoque, movimentações, contagem (C1/C2/C3), transferências e exportação.

---

## Decisões de Design

- Condições são **fixas**: apenas NOVO e HIGIENIZADO (sem condições personalizadas)
- Condições são **opcionais** por item, ativadas via checkbox no formulário de edição
- Um item pode ter **ambos** — tamanhos e condições — simultaneamente
- **Sem mudança de schema** no banco de dados: o campo `tamanhos` (jsonb) existente absorve as novas chaves

---

## Modelo de Dados

### Campo `tamanhos` — Formato de Chave

O campo `tamanhos` suporta três formatos coexistentes:

| Cenário | Chave | Exemplo |
|---|---|---|
| Só tamanho (atual) | `"P"` | `{ "P": 5, "M": 10 }` |
| Só condição | `"NOVO"` ou `"HIGIENIZADO"` | `{ "NOVO": 10, "HIGIENIZADO": 5 }` |
| Tamanho + condição | `"P\|NOVO"` | `{ "P\|NOVO": 5, "P\|HIGIENIZADO": 3 }` |

O separador `|` foi escolhido por não ocorrer em nomes de tamanhos típicos (P, M, G, 40, 42, GG, etc.).

### Campo `quantidade`

Continua sendo a soma de todos os valores em `tamanhos`, independente do formato das chaves.

### Flags inferidas (sem novo campo no banco)

```javascript
hasCondicoes(item)  // true se alguma chave é "NOVO", "HIGIENIZADO", ou contém "|"
hasTamanhos(item)   // true se alguma chave não é "NOVO" nem "HIGIENIZADO" e não contém "|"
```

---

## Funções Helper Centrais (Novas)

Todas as funções abaixo devem ser definidas antes de qualquer função que acesse `tamanhos`.

```javascript
const CONDICOES = ['NOVO', 'HIGIENIZADO'];

function parseVariationKey(key) {
  // "P|NOVO"  → { size: "P", condicao: "NOVO" }
  // "NOVO"    → { size: null, condicao: "NOVO" }
  // "P"       → { size: "P", condicao: null }
  if (key.includes('|')) {
    const [size, condicao] = key.split('|');
    return { size, condicao };
  }
  if (CONDICOES.includes(key)) return { size: null, condicao: key };
  return { size: key, condicao: null };
}

function buildVariationKey(size, condicao) {
  if (size && condicao) return `${size}|${condicao}`;
  if (condicao) return condicao;
  return size;
}

function hasCondicoes(item) {
  if (!item.tamanhos) return false;
  return Object.keys(item.tamanhos).some(k =>
    CONDICOES.includes(k) || k.includes('|')
  );
}

function hasTamanhos(item) {
  if (!item.tamanhos) return false;
  return Object.keys(item.tamanhos).some(k =>
    !CONDICOES.includes(k) && !k.includes('|')
  );
}

function formatVariationLabel(key) {
  // "P|NOVO" → "P — NOVO"
  // "NOVO"   → "NOVO"
  // "P"      → "P"
  return key.replace('|', ' — ');
}
```

---

## Formulário de Edição de Item

### Novo Checkbox

Abaixo do checkbox de tamanhos existente:

```
☐ Este item tem tamanhos / numerações diferentes
☐ Este item tem condição (NOVO / HIGIENIZADO)
```

### Comportamento por Combinação

| Tamanhos | Condição | Campos exibidos |
|---|---|---|
| ✗ | ✗ | Quantidade única (atual) |
| ✓ | ✗ | Tabela de tamanhos (atual) |
| ✗ | ✓ | 2 linhas fixas: `NOVO [___]` e `HIGIENIZADO [___]` |
| ✓ | ✓ | Para cada tamanho: `P\|NOVO [___]` e `P\|HIGIENIZADO [___]` |

Quando ambos estão ativos, a lista de combinações é gerada automaticamente ao adicionar/remover tamanhos — o usuário nunca digita a chave composta manualmente.

### Salvamento

Coleta todos os campos visíveis, monta `item.tamanhos` com chaves no formato correto e recalcula `item.quantidade` como soma de todos os valores.

---

## Exibição no Estoque (Cards)

### Só Condição

```
┌──────────────────┐  ┌──────────────────┐
│  NOVO:  10       │  │  HIGIENIZADO:  5  │
└──────────────────┘  └──────────────────┘
```

### Tamanhos + Condição

Chips agrupados: cada tamanho exibe NOVO e HIGIENIZADO internamente.

```
┌──────────────────────────────┐  ┌──────────────────────────────┐
│  P — NOVO: 5  HIGIENIZADO: 3 │  │  M — NOVO: 8  HIGIENIZADO: 2 │
└──────────────────────────────┘  └──────────────────────────────┘
```

### Cores

- `NOVO` → verde (`--green`)
- `HIGIENIZADO` → azul (`--accent`)

---

## Formulário de Movimentação

### Seletores Condicionais

| Item | Campos exibidos |
|---|---|
| Sem variação | (nenhum seletor) |
| Só tamanhos | `Tamanho: [P ▼]` |
| Só condição | `Condição: [NOVO ▼]` |
| Tamanhos + condição | `Tamanho: [P ▼]` + `Condição: [NOVO ▼]` |

### Campo `size` na movimentação

O campo `movement.size` carrega a chave composta quando necessário:

- `"P"` — só tamanho
- `"NOVO"` — só condição
- `"P|NOVO"` — tamanho + condição

Sem mudança na assinatura de `saveMovement()`.

### Histórico

Coluna `size` formatada com `formatVariationLabel()`:
- `"P|NOVO"` → **P — NOVO**
- `"NOVO"` → **NOVO**
- `"P"` → **P**

---

## Contagem (C1/C2/C3)

### Tabela — Uma Linha por Combinação

Para `Capacete` com tamanhos P/M e condições ativadas:

```
Item                        │ C1  │ C2  │ C3
────────────────────────────┼─────┼─────┼────
Capacete  P — NOVO          │ [5] │ [4] │ [4]
Capacete  P — HIGIENIZADO   │ [3] │ [3] │ [2]
Capacete  M — NOVO          │ [8] │ [8] │ [7]
Capacete  M — HIGIENIZADO   │ [2] │ [2] │ [2]
```

Para `Luva` com só condição:

```
Item                        │ C1   │ C2   │ C3
────────────────────────────┼──────┼──────┼───
Luva  NOVO                  │ [10] │ [10] │ [9]
Luva  HIGIENIZADO           │ [ 5] │ [ 5] │ [5]
```

### Armazenamento em `daily_counts`

O campo `size` recebe a chave composta diretamente. Sem mudança no schema.

```
{ item_id, item_name, size: "P|NOVO", quantidade: 5, contagem_num: 1 }
```

### Cálculos de Saída

Calculados por variação individualmente:

```javascript
// Para cada chave variação (ex: "P|NOVO"):
saidaTurno[variacao] = C1[variacao] - C2[variacao]
saidaADM[variacao]   = C2[variacao] - C3[variacao]
```

### Aplicar Baixa

A baixa usa a chave composta como `size` no movimento — mesmo comportamento de tamanhos simples. Cada variação com saída gera seu próprio registro de SAIDA/DISTRIBUICAO.

---

## Transferência entre Almoxarifados

- Dropdown de seleção de variação segue a mesma lógica da movimentação
- Chave composta passada como `size` na transferência
- Validação de estoque verifica `item.tamanhos[chaveComposta]`
- Sem mudança na assinatura de `transferItems()`

---

## Exportação XLSX

As colunas são geradas dinamicamente a partir de todas as chaves únicas encontradas:

- `"P|NOVO"` → coluna **P — NOVO**
- `"NOVO"` → coluna **NOVO**
- `"P"` → coluna **P**

Colunas de condição aparecem após colunas de tamanho puro.

---

## Retrocompatibilidade

- Todos os itens existentes com `tamanhos` no formato antigo (`{"P": 5}`) continuam funcionando sem migração
- Nenhuma alteração de schema no Supabase
- Funções helper detectam automaticamente o formato de cada chave

---

## Escopo Fora do Design

- Condições personalizadas além de NOVO/HIGIENIZADO
- Relatórios específicos por condição no dashboard de analytics
- Filtros de estoque por condição (pode ser adicionado futuramente)
