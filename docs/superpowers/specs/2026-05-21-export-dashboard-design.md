# Almoxarifado EPI — Export Refinement + Dashboard Upgrade
**Data:** 2026-05-21  
**Escopo:** Exportação Excel colorida/completa + Dashboard de controle de estoque

---

## 1. Exportação Excel

### Biblioteca
Mantém SheetJS (`cdn.sheetjs.com/xlsx-0.20.0`) — o full build suporta a propriedade `s` (style) nas células. Nenhuma dependência nova.

### Estrutura de Abas

| Aba | Conteúdo |
|-----|----------|
| `📊 Resumo` | KPIs gerais + tabela comparativa por almoxarifado |
| `📦 [Nome Almox.]` | Uma aba por almoxarifado com itens coloridos por status |
| `📋 Movimentações` | Histórico do período com cor por tipo + filtro automático |
| `🏷️ Por Categoria` | Totais agregados por categoria com % e gráfico de barras in-cell |
| `⚠️ Alertas` | Itens zerados, abaixo do mínimo, sem movimentação, sugestão de reposição |

### Estilos por Status de Estoque (abas de almoxarifado)
- **Zerado** (`quantidade === 0`): fundo `#FFCCCC`, texto `#9C0006`, bold
- **Abaixo do mínimo** (`quantidade < estoque_minimo`): fundo `#FFF2CC`, texto `#7D6608`
- **Normal**: linhas alternadas branco `#FFFFFF` / cinza claro `#F5F5F5`

### Estilos por Tipo de Movimentação
| Tipo | Fundo | Texto |
|------|-------|-------|
| COMPRA | `#C6EFCE` | `#276221` |
| DISTRIBUICAO / SAIDA | `#FFCCCC` | `#9C0006` |
| REPOSICAO | `#DDEEFF` | `#1F4E79` |
| AJUSTE | `#FFF2CC` | `#7D6608` |
| TRANSFERENCIA | `#CCF2F4` | `#005A60` |

### Estilos Estruturais (todas as abas)
- **Título da aba**: merge em toda a largura, fundo `#1F4E79`, texto branco, 14px bold
- **Subtítulo** (data geração, totais): fundo `#2E75B6`, texto branco, 11px
- **Cabeçalhos de coluna**: fundo `#1F4E79`, texto branco, 11px bold, centralizado
- **Filtro automático**: habilitado nas abas Movimentações e Alertas

### Aba Resumo — KPIs
- Total de itens cadastrados
- Total em estoque (soma de todas as quantidades)
- Itens zerados (count)
- Itens abaixo do mínimo (count)
- Tabela comparativa: um almoxarifado por linha com colunas: Nome / Itens / Qtd Total / Zerados / Abaixo Mínimo

### Aba Alertas
Colunas: Item | Categoria | Almoxarifado | Qtd Atual | Mínimo | Status | Consumo Médio/Dia | Dias Restantes | Qtd Sugerida Reposição

- **Consumo Médio/Dia**: soma das saídas via movimentos (type SAIDA/DISTRIBUICAO/REPOSICAO) no período ÷ número de dias do período. Fallback: 0 se sem movimentos.
- **Dias Restantes**: `quantidade_atual ÷ consumo_médio_diário`; exibe `"—"` quando consumo = 0; exibe `"∞"` quando item está OK e sem consumo
- **Qtd Sugerida**: `ceil(consumo_médio_diário × 7)`; exibe `"—"` quando consumo = 0
- Ordenação: zerados primeiro → abaixo do mínimo → por dias restantes crescente

### Aba Por Categoria
Colunas: Categoria | Qtd Itens | Total em Estoque | Saídas no Período | Entradas no Período | Giro (%)

- **Giro (%)**: `saídas_do_período ÷ estoque_atual × 100` (0 se estoque_atual = 0)
- Linha de total no rodapé com bold

---

## 2. Dashboard

### Arquitetura
Nova função `_computeControlMetrics()` separada de `_computeDashMetrics()`. Computa:
- `alertItems`: itens zerados ou abaixo do mínimo com cálculo de dias restantes
- `giroData`: top 10 consumidos, top 5 parados, consumo médio diário
- `contagemData`: tabela de sessões com Δ C1→C2 e Δ C2→C3, status de baixa

O estado `state.dashboard` ganha campos: `controlMetrics: null`, `controlLoaded: false`.

### Nova Estrutura de Abas

| Aba | ID | Ícone |
|-----|----|-------|
| Alertas (nova) | `alerts` | `ph-warning` |
| Giro (nova) | `giro` | `ph-chart-bar` |
| Contagens (nova) | `counts` | `ph-clipboard-text` |
| Visão Geral (existente, melhorada) | `overview` | `ph-trend-up` |
| Estoque (existente, melhorada) | `stock` | `ph-package` |

Ordem: Alertas → Giro → Contagens → Visão Geral → Estoque  
Aba padrão ao abrir: `alerts`

### Aba Alertas

**KPI row (3 cards):**
- Itens Zerados (vermelho)
- Abaixo do Mínimo (amarelo)
- Dias Médio Restante (azul, calculado só sobre itens com consumo conhecido)

**Tabela de alertas:**
Colunas: Item | Almoxarifado | Qtd | Mínimo | Dias Restantes | Qtd Sugerida | Ação

- Linha vermelha: zerado — badge `ZERADO`
- Linha amarela: abaixo do mínimo — badge `BAIXO`
- Linha normal: sem `estoque_minimo` definido mas com consumo alto — badge `ATENÇÃO`
- Botão **"Exportar Alertas"** no topo da aba (chama `exportAlertsToXLSX()`)
- Se sem `estoque_minimo`, calcular dias restantes usando apenas o consumo médio das contagens

### Aba Giro

**Top 10 Mais Consumidos** (barra horizontal, Chart.js):
- Dataset 1: Consumo Noite (vermelho)
- Dataset 2: Distribuição ADM (laranja)

**Top 5 Sem Saída** (tabela simples):
- Item | Categoria | Almoxarifado | Última movimentação | Dias parado

**KPIs da aba:**
- Total EPIs distribuídos no período
- Média diária de saídas
- Dia de maior consumo (data + total)

### Aba Contagens

**Tabela principal de sessões:**
Colunas: Data | Turno Noite | Turno Dia | C1 Total | C2 Total | Δ Noite | C3 Total | Δ ADM | Baixa | Ações

- Δ negativo (contagem C2 > C1): highlight vermelho — indica anomalia de contagem
- Status Baixa: badge verde `APLICADA` ou amarelo `PENDENTE`
- Linha de rodapé com totais: soma de Δ Noite e Δ ADM

**Mini KPIs:**
- Sessões com baixa aplicada vs pendente
- Total de saídas via contagem no período
- Maior consumo em uma sessão

### Melhorias na Aba Visão Geral (existente)
- Adicionar KPI de "Dias de Dados" no período selecionado
- Melhorar tooltip dos gráficos (já existentes no Chart.js) com formatação pt-BR
- Adicionar linha de média no gráfico de timeline

### Melhorias na Aba Estoque (existente)
- Colorir barras do gráfico: vermelho para abaixo do mínimo, verde para OK
- Adicionar coluna "Mínimo" na tabela abaixo do gráfico

---

## 3. Funções Novas / Modificadas

| Função | Arquivo | Tipo |
|--------|---------|------|
| `exportStockToXLSX()` | `app.js` | Reescrita completa |
| `exportMovementsToXLSX()` | `app.js` | Reescrita completa |
| `exportAlertsToXLSX()` | `app.js` | Nova |
| `_computeControlMetrics()` | `app.js` | Nova |
| `_renderTabAlerts(m)` | `app.js` | Nova |
| `_renderTabGiro(m)` | `app.js` | Nova |
| `_renderTabCounts(m)` | `app.js` | Nova |
| `_renderTabOverview(m)` | `app.js` | Modificada (melhorias) |
| `_renderTabStock(m)` | `app.js` | Modificada (colorir barras) |
| `renderEpiDashboard()` | `app.js` | Modificada (nova ordem de abas) |
| `renderDashboardCharts()` | `app.js` | Modificada (novos gráficos) |
| `loadDashboardData()` | `app.js` | Modificada (carregar controlMetrics) |

---

## 4. Não está no escopo
- Trocar biblioteca SheetJS por ExcelJS
- Adicionar aba "Por Colaborador" no Excel
- Criar view separada para o dashboard de controle
- Modificar lógica de contagem diária
- Salvar métricas no banco (tudo calculado client-side)
