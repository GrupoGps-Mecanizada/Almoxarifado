# Vincular C1 ao Almoxarifado — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir vincular a contagem C1 a qualquer um dos 3 almoxarifados, exibindo os itens daquele warehouse e descontando do mesmo na baixa, com toggle on/off.

**Architecture:** Todas as mudanças ficam em `index.html`. O warehouse vinculado é salvo em `count_sessions.observacao` como `c1_warehouse_id`. Dois helpers globais (`isVinculoAlmoxEnabled`, `getContagemWarehouseId`) centralizam a lógica de resolução, evitando repetição em `loadContagem`, `loadContagemAndBuildResult`, `aplicarBaixaContagem` e `renderContagem`. O toggle usa `localStorage`.

**Tech Stack:** Vanilla JS, Supabase JS client, HTML5 — sem dependências novas.

---

## Task 1: Adicionar funções helper globais

**Files:**
- Modify: `index.html` — após a função `salvarDataContagem` (~linha 2389)

### Contexto

A função `salvarDataContagem` termina por volta da linha 2388 (fecha com `}`). Logo após ela, inserir os dois helpers.

- [ ] **Step 1: Inserir os dois helpers após `salvarDataContagem`**

Encontrar o bloco exato no arquivo — é o trecho após `state.contagem.sessionMap[sessionId] = obs;` e antes da próxima função. Adicionar logo após a chave que fecha `salvarDataContagem`:

```javascript
        function isVinculoAlmoxEnabled() {
            return localStorage.getItem('contagemVinculoAlmox') !== 'false';
        }

        function getContagemWarehouseId() {
            if (!isVinculoAlmoxEnabled()) return 'alm-2';
            const sessionId = state.contagem.turno;
            if (!sessionId || !state.contagem.sessionMap) return 'alm-2';
            const obs = state.contagem.sessionMap[sessionId] || {};
            return obs.c1_warehouse_id || 'alm-2';
        }
```

- [ ] **Step 2: Verificar que as funções não quebram o parse — abrir o arquivo no browser e confirmar sem erros de console**

---

## Task 2: Adicionar `salvarWarehouseC1` e `confirmarWarehouseC1`

**Files:**
- Modify: `index.html` — logo após os helpers do Task 1

- [ ] **Step 1: Inserir as duas funções**

Logo após `getContagemWarehouseId` (Task 1), adicionar:

```javascript
        async function salvarWarehouseC1(sessionId, warehouseId) {
            const { data: sess } = await sbClient.from('count_sessions').select('*').eq('id', sessionId).maybeSingle();
            var obs = {};
            try { obs = JSON.parse(sess?.observacao || '{}'); } catch {}
            obs.c1_warehouse_id = warehouseId;
            const { error } = await sbClient.from('count_sessions').update({ observacao: JSON.stringify(obs) }).eq('id', sessionId);
            if (error) throw error;
            if (!state.contagem.sessionMap) state.contagem.sessionMap = {};
            state.contagem.sessionMap[sessionId] = obs;
        }

        async function confirmarWarehouseC1() {
            const selected = document.querySelector('input[name="c1-warehouse"]:checked');
            if (!selected) { showToast('Selecione um almoxarifado', 'warning'); return; }
            const sessionId = state.contagem.turno;
            if (!sessionId) return;
            try {
                await salvarWarehouseC1(sessionId, selected.value);
                state.contagem.loading = true;
                render();
                loadContagem();
            } catch (e) {
                console.error('Erro ao vincular almoxarifado:', e);
                showToast('Erro ao vincular almoxarifado', 'error');
            }
        }
```

- [ ] **Step 2: Verificar no console do browser que as funções estão acessíveis: `typeof confirmarWarehouseC1` deve retornar `"function"`**

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: helpers e funções para vincular C1 ao almoxarifado"
```

---

## Task 3: Atualizar `loadContagem` para usar o warehouse vinculado

**Files:**
- Modify: `index.html:1888-1889` — função `loadContagem`

### Contexto

```javascript
// ANTES (linha 1889):
const alm2Items = state.items.filter(i => (i.warehouse_id || 'alm-1') === 'alm-2');
```

- [ ] **Step 1: Substituir a linha 1889 em `loadContagem`**

Substituir:
```javascript
            const alm2Items = state.items.filter(i => (i.warehouse_id || 'alm-1') === 'alm-2');
```
Por:
```javascript
            const targetWh = getContagemWarehouseId();
            const alm2Items = state.items.filter(i => (i.warehouse_id || 'alm-1') === targetWh);
```

- [ ] **Step 2: Verificar que as referências a `alm2Items` na mesma função continuam funcionando** (as linhas que usam `alm2Items.map(i => i.id)` em seguida não precisam de mudança — a variável continua chamada `alm2Items`)

---

## Task 4: Atualizar `loadContagemAndBuildResult` para usar o warehouse vinculado

**Files:**
- Modify: `index.html:1839-1841` — função `loadContagemAndBuildResult`

### Contexto

```javascript
// ANTES (linha 1840):
const alm2Items = state.items.filter(i => (i.warehouse_id || 'alm-1') === 'alm-2');
```

- [ ] **Step 1: Substituir a linha 1840 em `loadContagemAndBuildResult`**

Substituir:
```javascript
            const alm2Items = state.items.filter(i => (i.warehouse_id || 'alm-1') === 'alm-2');
```
Por:
```javascript
            const targetWh = getContagemWarehouseId();
            const alm2Items = state.items.filter(i => (i.warehouse_id || 'alm-1') === targetWh);
```

- [ ] **Step 2: Commit das Tasks 3 e 4**

```bash
git add index.html
git commit -m "feat: loadContagem e loadContagemAndBuildResult usam warehouse vinculado"
```

---

## Task 5: Atualizar `aplicarBaixaContagem` para usar o warehouse vinculado

**Files:**
- Modify: `index.html:2055-2131` — função `aplicarBaixaContagem`

### Contexto

Atualmente a confirmação menciona "Almoxarifado 2 — Distribuição" fixo (linha 2079), e os movimentos usam `item.warehouse_id || 'alm-2'` (linhas 2094 e 2110).

- [ ] **Step 1: Adicionar resolução do warehouse no início da função**

Logo após `const turnoLabel = sessionId ? ...` (linha 2062), adicionar:

```javascript
            const targetWh = getContagemWarehouseId();
            const targetWhNome = state.warehouses.find(w => w.id === targetWh)?.nome || targetWh;
```

- [ ] **Step 2: Atualizar a mensagem do `confirm` (linha 2079)**

Substituir:
```javascript
            if (!confirm(`Deseja dar baixa no Almoxarifado 2 — Distribuição?${listaNoite}${listaAdm}\n\nEssa ação atualizará o estoque e registrará os movimentos.`)) return;
```
Por:
```javascript
            if (!confirm(`Deseja dar baixa em ${targetWhNome}?${listaNoite}${listaAdm}\n\nEssa ação atualizará o estoque e registrará os movimentos.`)) return;
```

- [ ] **Step 3: Atualizar `warehouse_id` e `observations` do movimento SAIDA (noturno)**

Substituir:
```javascript
                        warehouse_id: item.warehouse_id || 'alm-2',
                        user_name: state.user.nome,
                        observations: `Baixa Contagem Diária ${dateLabel}${turnoLabel} — Noite`
```
Por:
```javascript
                        warehouse_id: targetWh,
                        user_name: state.user.nome,
                        observations: `Baixa Contagem Diária ${dateLabel}${turnoLabel} — Noite — ${targetWhNome}`
```

- [ ] **Step 4: Atualizar `warehouse_id` e `observations` do movimento DISTRIBUICAO (ADM)**

Substituir:
```javascript
                        warehouse_id: item.warehouse_id || 'alm-2',
                        user_name: state.user.nome,
                        observations: `Baixa Contagem Diária ${dateLabel}${turnoLabel} — ADM`
```
Por:
```javascript
                        warehouse_id: targetWh,
                        user_name: state.user.nome,
                        observations: `Baixa Contagem Diária ${dateLabel}${turnoLabel} — ADM — ${targetWhNome}`
```

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: aplicarBaixaContagem usa warehouse vinculado"
```

---

## Task 6: Atualizar `renderContagem` — `alm2Items` dinâmico e toggle no header

**Files:**
- Modify: `index.html:4018-4022` — topo de `renderContagem`
- Modify: `index.html:4839-4843` — header com título e subtítulo

### Contexto

```javascript
// ANTES (linhas 4019-4021):
const alm2Items = state.items
    .filter(i => (i.warehouse_id || 'alm-1') === 'alm-2')
    .sort((a, b) => a.nome.localeCompare(b.nome));
```

E o subtítulo na linha 4842:
```javascript
<p style="font-size:12px;color:var(--text-3);margin-top:2px;">Almoxarifado 2 — Distribuição</p>
```

- [ ] **Step 1: Tornar `alm2Items` dinâmico**

Substituir:
```javascript
            const alm2Items = state.items
                .filter(i => (i.warehouse_id || 'alm-1') === 'alm-2')
                .sort((a, b) => a.nome.localeCompare(b.nome));
```
Por:
```javascript
            const vinculoOn = isVinculoAlmoxEnabled();
            const activeWhId = getContagemWarehouseId();
            const activeWhNome = state.warehouses.find(w => w.id === activeWhId)?.nome || activeWhId;
            const alm2Items = state.items
                .filter(i => (i.warehouse_id || 'alm-1') === activeWhId)
                .sort((a, b) => a.nome.localeCompare(b.nome));
```

- [ ] **Step 2: Tornar subtítulo dinâmico e adicionar toggle**

Substituir o trecho do header (incluindo o `<div class="row-between">` que contém título e botão):
```javascript
                    <div class="row-between" style="margin-bottom:4px;">
                        <div>
                            <h1 class="page-title">Contagem Diária</h1>
                            <p style="font-size:12px;color:var(--text-3);margin-top:2px;">Almoxarifado 2 — Distribuição</p>
                        </div>
```
Por:
```javascript
                    <div class="row-between" style="margin-bottom:4px;">
                        <div>
                            <h1 class="page-title">Contagem Diária</h1>
                            <p style="font-size:12px;color:var(--text-3);margin-top:2px;">${vinculoOn ? activeWhNome : 'Almoxarifado 2 — Distribuição'}</p>
                            <label style="display:flex;align-items:center;gap:6px;margin-top:6px;cursor:pointer;font-size:11px;color:var(--text-2);">
                                <input type="checkbox" ${vinculoOn ? 'checked' : ''}
                                    onchange="localStorage.setItem('contagemVinculoAlmox', this.checked ? 'true' : 'false');render()"
                                    style="width:14px;height:14px;accent-color:var(--accent);cursor:pointer;">
                                Vincular C1 ao almoxarifado
                            </label>
                        </div>
```

- [ ] **Step 3: Verificar no browser — o subtítulo e o checkbox aparecem corretamente na tela de Contagem Diária**

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: renderContagem com alm2Items dinâmico e toggle vincular C1"
```

---

## Task 7: Adicionar tela de seleção de almoxarifado em `buildCountForm(1)`

**Files:**
- Modify: `index.html` — início de `buildCountForm` (~linha 4091-4100)

### Contexto

```javascript
// ANTES (linha 4094-4100):
            function buildCountForm(num) {
                // Tabela Excel — todas as contagens visíveis ao mesmo tempo

                if (alm2Items.length === 0) {
                    return `<div class="card"><div class="empty-state">
                        <i class="ph ph-package"></i>
                        <p>Nenhum item cadastrado no Almoxarifado Distribuição</p>
                        <div style="margin-top:16px;"><button onclick="navigateTo('stock')" class="btn-secondary">Ver Estoque</button></div>
                    </div></div>`;
                }
```

- [ ] **Step 1: Inserir a tela de seleção antes do check de `alm2Items.length === 0`**

Substituir:
```javascript
            function buildCountForm(num) {
                // Tabela Excel — todas as contagens visíveis ao mesmo tempo

                if (alm2Items.length === 0) {
```
Por:
```javascript
            function buildCountForm(num) {
                // Tela de seleção de almoxarifado — aparece antes do formulário C1
                if (num === 1 && vinculoOn) {
                    const sessionId = state.contagem.turno;
                    const obs = (sessionId && state.contagem.sessionMap)
                        ? (state.contagem.sessionMap[sessionId] || {})
                        : {};
                    if (!obs.c1_warehouse_id) {
                        return `<div class="card" style="padding:24px;">
                            <h2 style="font-size:16px;font-weight:700;margin-bottom:6px;">Vincular C1 ao Almoxarifado</h2>
                            <p style="font-size:12px;color:var(--text-2);margin-bottom:20px;">Escolha de qual almoxarifado os itens serão contados e descontados na baixa.</p>
                            <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:24px;">
                                ${state.warehouses.map(wh => `
                                <label style="display:flex;align-items:center;gap:12px;padding:14px 16px;border:2px solid var(--border);border-radius:10px;cursor:pointer;transition:border-color .15s;"
                                    onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">
                                    <input type="radio" name="c1-warehouse" value="${wh.id}"
                                        style="width:16px;height:16px;accent-color:var(--accent);">
                                    <div>
                                        <div style="font-weight:600;font-size:14px;">${wh.nome}</div>
                                        <div style="font-size:11px;color:var(--text-3);">${wh.descricao || ''}</div>
                                    </div>
                                </label>`).join('')}
                            </div>
                            <button onclick="confirmarWarehouseC1()" class="btn-primary" style="width:100%;">
                                <i class="ph-fill ph-arrow-right"></i> Confirmar e iniciar C1
                            </button>
                        </div>`;
                    }
                }

                if (alm2Items.length === 0) {
```

- [ ] **Step 2: Atualizar a mensagem de empty state para ser dinâmica**

Substituir:
```javascript
                        <p>Nenhum item cadastrado no Almoxarifado Distribuição</p>
```
Por:
```javascript
                        <p>Nenhum item cadastrado em ${activeWhNome}</p>
```

- [ ] **Step 3: Testar o fluxo no browser:**
  - Com toggle ON: ao iniciar C1 de uma nova sessão, deve aparecer a tela de seleção
  - Selecionar um warehouse e clicar "Confirmar" deve carregar os itens daquele warehouse
  - Com toggle OFF: deve ir direto para o formulário com itens do alm-2

- [ ] **Step 4: Adicionar badge do warehouse no banner do formulário C1**

No `buildCountForm`, a variável `turnoInfo` é montada a partir da linha 4111. Logo após o fechamento do `const turnoInfo = ... : '';`, adicionar a badge:

```javascript
                // Badge de warehouse vinculado (quando diferente do padrão)
                const whBadge = (vinculoOn && activeWhId !== 'alm-2')
                    ? `<div style="display:flex;align-items:center;gap:6px;padding:6px 16px;
                                  background:#fff8e7;border-bottom:1px solid #f0d080;font-size:11px;color:#7a5900;font-weight:600;">
                           <i class="ph-fill ph-warehouse"></i>
                           Contando em: ${activeWhNome}
                       </div>`
                    : '';
```

E no `return` do `buildCountForm`, dentro do div principal do card, inserir `${whBadge}` logo após `${turnoInfo}`:

Substituir:
```javascript
                return `<div class="card" style="padding:0;overflow:hidden;">
                    ${turnoInfo}
                    <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;">
```
Por:
```javascript
                return `<div class="card" style="padding:0;overflow:hidden;">
                    ${turnoInfo}
                    ${whBadge}
                    <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;">
```

- [ ] **Step 5: Verificar no browser que o badge aparece quando o warehouse vinculado é diferente de alm-2**

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: tela de seleção de almoxarifado antes de C1 e badge no formulário"
```

---

## Task 8: Teste de ponta a ponta

- [ ] **Step 1: Criar uma nova sessão de contagem com toggle ON**
  - Clicar "Nova Contagem"
  - Preencher turno_noite e turno_dia
  - Clicar "Iniciar C1"
  - Verificar que a tela de seleção aparece com os 3 almoxarifados

- [ ] **Step 2: Escolher Almoxarifado Central (alm-1) e confirmar**
  - Verificar que o formulário C1 carrega com itens do alm-1
  - Verificar badge amarela "Contando em: Almoxarifado Central"
  - Verificar subtítulo do header mostra "Almoxarifado Central"

- [ ] **Step 3: Preencher e salvar C1, C2 e C3**
  - Verificar que o fluxo completo funciona normalmente

- [ ] **Step 4: Dar baixa**
  - Verificar que o `confirm` diz o nome do almoxarifado correto
  - Verificar nos movimentos criados que `warehouse_id = 'alm-1'`
  - Verificar que a `observations` inclui o nome do warehouse

- [ ] **Step 5: Testar com toggle OFF**
  - Desmarcar "Vincular C1 ao almoxarifado"
  - Iniciar nova sessão → deve ir direto para C1 com itens do alm-2, sem tela de seleção
  - Subtítulo mostra "Almoxarifado 2 — Distribuição"

- [ ] **Step 6: Testar retomada de sessão existente com warehouse já salvo**
  - Sair da sessão e voltar para os chamados
  - Clicar para fazer C2 na sessão existente
  - Verificar que não aparece a tela de seleção novamente

- [ ] **Step 7: Commit final**

```bash
git add index.html
git commit -m "feat: vincular C1 ao almoxarifado — implementação completa"
```
