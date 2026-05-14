# Contagem — Baixa Completa, Edição de Datas e Desfazer Baixa

**Data:** 2026-05-14  
**Arquivo principal:** `index.html` (SPA single-file, Supabase backend)

---

## Contexto

O sistema de contagem (C1→C2→C3) rastreia EPIs no Almoxarifado 2. Atualmente:

- A **baixa** só desconta o consumo noturno (C1−C2), ignorando a distribuição ADM (C2−C3)
- Não é possível corrigir a data de uma contagem específica (C1, C2 ou C3) individualmente
- Não existe mecanismo de reversão de baixa — erros exigem intervenção manual no banco

---

## Feature 1 — Baixa por Inteiro

### Comportamento atual
`aplicarBaixaContagem()` processa apenas `saida = C1 − C2 > 0`, criando movements do tipo `SAIDA` com consumo noturno.

### Comportamento novo
A função processa **dois grupos** em um único ato:

| Grupo | Cálculo | Tipo de movement | Observations |
|---|---|---|---|
| Noite | `saida = C1 − C2` | `SAIDA` | `Baixa Contagem Diária DD/MM — Turno SESSID — Noite` |
| ADM | `saida_adm = C2 − C3` | `DISTRIBUICAO` | `Baixa Contagem Diária DD/MM — Turno SESSID — ADM` |

### Fluxo de execução
1. Coletar `itensNoite` (saida > 0) e `itensAdm` (saida_adm > 0)
2. Se ambos vazios → toast de erro, encerrar
3. Exibir único `confirm` listando noite + ADM separados
4. Para cada item em `itensNoite`: subtrair `saida` de `items.quantidade`, inserir movement SAIDA
5. Para cada item em `itensAdm`: subtrair `saida_adm` de `items.quantidade`, inserir movement DISTRIBUICAO
6. Marcar `baixaDates[key] = true`, remover de `openTickets`, toast de sucesso

### Detecção de baixa em `loadContagemHistory()`
Atualizar o regex de match nos movements para capturar o novo formato `— Noite` / `— ADM`. Uma sessão é considerada com baixa feita se **qualquer** movement da sessão for encontrado (basta um dos dois grupos).

---

## Feature 2 — Editar Data de C1 / C2 / C3

### Armazenamento
Estender o JSON de `count_sessions.observacao` com campos opcionais:

```json
{
  "fds": true,
  "turnos": [...],
  "c1_date": "2025-05-14",
  "c2_date": "2025-05-15",
  "c3_date": "2025-05-15"
}
```

Sessões existentes sem esses campos usam `session.id` (YYYYMMDD) como data fallback — retrocompatibilidade garantida.

### UI no card de histórico
Abaixo do header do card, exibir linha de datas editáveis:

```
C1  14/05  ✏    C2  15/05  ✏    C3  15/05  ✏
```

Botão ✏ abre o modal de data existente (`showDateChangeModal`) com parâmetro extra `field`.

### Nova função `salvarDataContagem(sessionId, field, newDate)`
1. Buscar `count_sessions` onde `id = sessionId`
2. Parse do `observacao` JSON
3. `observacao[field] = newDate`
4. `upsert` em `count_sessions`
5. Atualizar `state.contagem.currentSession` localmente
6. Re-renderizar histórico

### Reutilização do modal existente
Adaptar `showDateChangeModal` para aceitar parâmetros `(sessionId, field, currentDate, label)` — label exibe "Data da C1", "Data da C2" ou "Data da C3". O confirm chama `salvarDataContagem`.

---

## Feature 3 — Desfazer Baixa

### Botão no histórico
Cards com `baixaFeita === true` exibem botão **"Desfazer Baixa"** em vermelho, ao lado dos botões de edição existentes.

### Função `desfazerBaixaContagem(date, turno)`

**Passo 1 — Buscar movements da sessão:**
```javascript
sbClient.from('movements')
  .select('*')
  .ilike('observations', 'Baixa Contagem Diária%')
  .ilike('observations', `%${turno}%`)
  .eq('date', date)
```

**Passo 2 — Validar:**
- Se nenhum movement encontrado → toast "Movimentos não encontrados. Baixa pode ter sido removida manualmente." + encerrar

**Passo 3 — Restaurar estoque:**
Para cada movement: `items.quantidade += movement.quantity` + `UPDATE items SET quantidade = novaQtd`

**Passo 4 — Deletar movements:**
`DELETE FROM movements WHERE id IN (ids)`

**Passo 5 — Atualizar estado local:**
- `delete state.contagem.baixaDates[baixaKey]`
- `state.contagem.baixaAplicada = false`
- Reinserir ticket em `openTickets`
- Re-renderizar

**Confirmação:**
> "Desfazer a baixa de DD/MM? O estoque do Almoxarifado 2 será restaurado e os movimentos removidos. Esta ação não pode ser desfeita."

### Limitação de segurança
O botão só exibe se `baixaFeita === true`. A execução valida que os movements existem antes de prosseguir.

---

## Arquivos Afetados

Tudo em `index.html`:

| Função | Mudança |
|---|---|
| `aplicarBaixaContagem()` | Processar noite + ADM, dois tipos de movement |
| `loadContagemHistory()` | Atualizar regex de detecção de baixa |
| `showDateChangeModal()` | Aceitar parâmetros de field/label para datas de C1/C2/C3 |
| `salvarDataContagem()` | **Nova função** |
| `desfazerBaixaContagem()` | **Nova função** |
| Cards no `renderContagem()` | Linha de datas editáveis + botão Desfazer |

---

## Não está no escopo

- Mudança de schema no banco (zero migrations)
- Editar datas durante o fluxo de criação (só retroativo)
- Desfazer baixas parciais (sempre desfaz a sessão inteira)
