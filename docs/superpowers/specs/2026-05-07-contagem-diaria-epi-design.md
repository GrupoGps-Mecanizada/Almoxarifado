# Spec: Contagem Diária de EPI — Almoxarifado 2

**Data:** 2026-05-07
**Status:** Aprovado pelo usuário

---

## Objetivo

Substituir o rastreamento de saída individual de EPIs por um sistema de **contagem diária por diferença**: o almoxarife conta fisicamente o que há no Almoxarifado 2, registra no sistema e o sistema calcula automaticamente quanto saiu desde a última contagem.

Paralelamente, remover os campos `ca`, `validade` e `localizacao` de toda a interface (os campos permanecem no banco sem uso).

---

## Contexto Operacional

- **Almoxarifado 1 (Central):** estoque principal — fonte de reposição.
- **Almoxarifado 2 (Distribuição):** ponto de entrega diária de EPIs.
- O almoxarife **não registra saídas individuais** — só conta o que sobrou.
- O abastecimento (Alm1 → Alm2) **não é registrado** no sistema. A reposição aparecerá refletida na diferença do dia seguinte.
- **Fórmula de saída:** `saída = contagem_anterior − contagem_atual`
- Se `saída < 0`: houve reposição entre as contagens (esperado e normal).

---

## Parte 1 — Remoção de Campos

### Campos removidos da interface

| Campo | Tabela | Ação |
|---|---|---|
| `ca` | `items` | Removido da UI — coluna mantida no banco |
| `validade` | `items` | Removido da UI — coluna mantida no banco |
| `localizacao` | `items` | Removido da UI — coluna mantida no banco |

### Funções impactadas

| Função | Mudança |
|---|---|
| `renderStock()` | Remover badge CA, linhas de validade e localização nos item cards |
| `renderEditItem()` | Remover campos `itemCA`, `itemValidity`, `itemLocation` do formulário |
| `handleSaveItem()` | Remover leituras de `document.getElementById('itemCA')`, `itemValidity`, `itemLocation` |
| Estado inicial (`op`) | Remover `ca: ''`, `validade: ''`, `localizacao: ''` dos objetos de estado |
| Exportação Excel | Remover colunas CA, Validade, Localização da planilha exportada |

---

## Parte 2 — Contagem Diária

### Schema — nova tabela `daily_counts`

```sql
CREATE TABLE daily_counts (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date        DATE NOT NULL,
  item_id     TEXT NOT NULL,
  item_name   TEXT NOT NULL,
  quantidade  INTEGER NOT NULL DEFAULT 0,
  user_name   TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Índice para busca rápida da última contagem por item
CREATE INDEX idx_daily_counts_item_date ON daily_counts (item_id, date DESC);
```

### Estado da view no `state`

```js
contagem: {
  active: false,           // true quando a tela de contagem está aberta
  date: getCurrentDate(),  // data da contagem em andamento
  entries: {},             // { [item_id]: quantidade_digitada }
  lastCounts: {},          // { [item_id]: { date, quantidade } } — última contagem anterior
  saving: false,
  savedResult: null,       // resumo pós-salvamento: [{ item_name, saida, date_anterior }]
  tab: 'count',            // 'count' | 'history'
  history: [],             // registros de daily_counts passados
  historyLoading: false
}
```

### Fluxo de dados

#### Abrir a tela de contagem

1. Filtrar `state.items` por `warehouse_id === 'alm-2'` e `quantidade > 0`.
2. Para cada item, buscar no Supabase a última linha em `daily_counts` com `item_id = item.id` ordenado por `date DESC LIMIT 1`.
3. Popular `state.contagem.lastCounts` com os resultados.
4. Inicializar `state.contagem.entries` com `{}` (campos em branco).

#### Salvar contagem

```
Para cada item_id em entries onde quantidade foi preenchida:
  1. INSERT INTO daily_counts (date, item_id, item_name, quantidade, user_name)
  2. saida = lastCounts[item_id].quantidade - entries[item_id]
  3. Acumular em savedResult[]
Exibir resumo de saídas calculadas.
Invalidar cache de contagem.
```

#### Histórico

- Buscar `daily_counts` ordenado por `date DESC`, agrupado por data.
- Exibir lista de datas; ao expandir, mostrar cada item com `quantidade` e `saída` calculada comparando com a contagem imediatamente anterior.

---

## Parte 3 — Interface

### Navegação

Adicionar botão no sidebar:
```html
<button class="nav-menu-item" data-view="contagem">
  <i class="ph-fill ph-clipboard-text"></i> Contagem Diária
</button>
```

### View `renderContagem()`

**Layout:**
```
.page-wrap
  .page-content
    .card (cabeçalho: data + botão Salvar)
    .tab-bar
      .tab-btn[data-tab="count"]    "Contagem de Hoje"
      .tab-btn[data-tab="history"]  "Histórico"

    [se tab === 'count']
      .card (lista de itens)
        para cada item do Alm2:
          .contagem-row
            .contagem-nome   "Luva Latex M"
            .contagem-ref    "Anterior: 45 (12/05)" ou "— primeira contagem"
            input[type=number]  campo para digitar quantidade atual

      [após salvar — savedResult]
      .card.resultado
        h3 "Resultado da Contagem — DD/MM/YYYY"
        para cada linha em savedResult:
          .resultado-row
            .nome     item_name
            .saida    saida > 0 → "▼ X saíram"
                      saida < 0 → "▲ X entraram (reposição)"
                      saida = 0 → "= Sem movimento"

    [se tab === 'history']
      para cada data em history (agrupada):
        .card.card-sm
          .history-date  "12/05/2026"
          lista de itens contados nessa data com saída calculada
```

### Classes CSS novas (em `base.css`)

```css
.contagem-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--border);
}
.contagem-nome { flex: 1; font-weight: 500; color: var(--text-1); }
.contagem-ref  { font-size: 12px; color: var(--text-3); min-width: 120px; text-align: right; }
.contagem-input {
  width: 80px;
  text-align: center;
  font-size: 16px;
  font-weight: 600;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-0);
  color: var(--text-1);
}
.contagem-input:focus {
  outline: none;
  border-color: var(--accent);
  background: var(--bg-1);
}
.resultado-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
  font-size: 14px;
}
.resultado-saida-out  { color: var(--red);    font-weight: 600; }
.resultado-saida-in   { color: var(--green);  font-weight: 600; }
.resultado-saida-zero { color: var(--text-3); }
```

---

## O que NÃO muda

- Toda a lógica de negócio existente (compras, transferências, histórico de movimentações)
- Tabelas `items` e `movements` (estrutura intacta)
- Almoxarifado 1 e o fluxo de compra
- Design system GPS (visual permanece idêntico ao Gestão Efetivo)

---

## Critério de Sucesso

1. Os campos CA, Validade e Localização desapareceram completamente da UI.
2. O menu lateral tem o botão "Contagem Diária".
3. A tela de contagem lista todos os itens do Alm. 2 com campos numéricos.
4. Ao salvar, o sistema mostra quantos itens saíram desde a última contagem.
5. O histórico mostra contagens anteriores com saídas calculadas.
6. A tabela `daily_counts` existe no Supabase e os registros são persistidos corretamente.
