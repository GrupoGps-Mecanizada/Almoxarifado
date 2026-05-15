# Design: Vincular C1 ao Almoxarifado

**Data:** 2026-05-15  
**Status:** Aprovado

---

## Objetivo

Permitir que a Contagem 1 (C1) seja vinculada livremente a qualquer um dos três almoxarifados disponíveis (alm-1, alm-2, alm-emergencial), em vez de estar fixada ao alm-2. Toda a sessão de contagem (C1, C2, C3) e a baixa final operam sobre o warehouse vinculado. O comportamento é controlado por um toggle que, quando desativado, preserva o funcionamento atual.

---

## Toggle de Ativação

- **Chave localStorage:** `contagemVinculoAlmox`
- **Tipo:** booleano
- **Padrão:** `true` (ativo)
- **Localização na UI:** cabeçalho da aba `chamados` na tela de contagem
- **Quando desativado:** sistema funciona exatamente como hoje — C1, C2, C3 filtram alm-2; baixa desconta do alm-2
- **Quando ativado:** fluxo descrito abaixo

---

## Armazenamento do Vínculo

O campo `observacao` (JSON) de `count_sessions` já guarda `c1_date`, `c2_date`, `c3_date`. Adiciona-se o campo:

```json
{
  "c1_warehouse_id": "alm-1"
}
```

Valores possíveis: `"alm-1"`, `"alm-2"`, `"alm-emergencial"`.

Salvo via upsert no Supabase pela nova função `salvarWarehouseC1(sessionId, warehouseId)`.

---

## Fluxo com Toggle Ativo

```
Sessão aberta → usuário clica em "Iniciar C1"
      ↓
c1_warehouse_id já definido na sessão?
  Sim → pula seleção, usa warehouse salvo
  Não → exibe tela de seleção de almoxarifado
              ↓
         Usuário escolhe 1 dos 3 warehouses
              ↓
         Salva c1_warehouse_id em count_sessions.observacao
              ↓
Carrega itens filtrados pelo warehouse escolhido
      ↓
C1, C2, C3 funcionam normalmente (itens do warehouse vinculado)
      ↓
Baixa desconta do c1_warehouse_id
```

---

## Nova Tela de Seleção de Almoxarifado

Inserida entre "Iniciar C1" e o formulário C1, exibe:

- **Título:** "Vincular C1 ao Almoxarifado"
- **3 cards clicáveis**, um por warehouse:
  - Almoxarifado Central (alm-1)
  - Almoxarifado Distribuição (alm-2)
  - Emergencial (alm-emergencial)
- **Botão "Confirmar":** salva o vínculo e avança para o formulário C1
- Se o usuário retoma uma C1 já iniciada, a tela é ignorada e usa o warehouse salvo

---

## Indicador Visual no Formulário C1

Quando o warehouse vinculado está definido, um badge aparece no topo do formulário C1 mostrando o nome do almoxarifado vinculado. Não aparece quando o toggle está desativado ou quando o warehouse é o padrão alm-2.

---

## Funções Afetadas

| Função | Mudança |
|---|---|
| `buildCountForm(1)` | Verifica toggle + `c1_warehouse_id`. Se toggle ativo e warehouse não definido, renderiza tela de seleção em vez do formulário C1 |
| `loadContagem()` | Usa `c1_warehouse_id` do `observacao` para filtrar itens (fallback: `alm-2`) |
| `aplicarBaixaContagem()` | Usa `c1_warehouse_id` do `observacao` para definir warehouse de origem dos movimentos (fallback: `alm-2`) |
| `renderContagem()` | Adiciona toggle no cabeçalho da aba `chamados` |
| `salvarWarehouseC1(sessionId, warehouseId)` | **Nova função** — upsert do `c1_warehouse_id` no campo `observacao` de `count_sessions` |

---

## Comportamento da Baixa

Com toggle ativo e `c1_warehouse_id` definido:

| Desconto | Cálculo | Warehouse |
|---|---|---|
| Noite (SAIDA) | C1 − C2 | `c1_warehouse_id` |
| ADM (DISTRIBUICAO) | C2 − C3 | `c1_warehouse_id` |

A observação do movimento inclui o warehouse: `"Baixa Contagem Diária DD/MM — Turno XXXXX — Noite — Alm. Central"`.

A função `desfazerBaixaContagem` não precisa de mudança — já restaura o estoque do warehouse onde o movimento foi registrado.

---

## Edge Cases

| Situação | Comportamento |
|---|---|
| Toggle desativado | Ignora `c1_warehouse_id`, usa alm-2 |
| Sessão antiga sem `c1_warehouse_id` | Fallback para alm-2 |
| C1 retomada com warehouse já definido | Pula tela de seleção |
| Warehouse vinculado sem itens | Mensagem "Nenhum item encontrado neste almoxarifado" |
| Toggle desativado no meio de sessão vinculada | Sessão mantém o warehouse salvo; toggle só afeta novas seleções |

---

## O que NÃO muda

- Estrutura da tabela `count_sessions` (sem migration)
- Lógica de C2 e C3 (seguem o mesmo warehouse vinculado)
- Função `desfazerBaixaContagem`
- Todos os demais fluxos do sistema
