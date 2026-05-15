# Contagem — Baixa Completa, Edição de Datas e Desfazer Baixa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three features to the contagem system: (1) give baixa for both noite AND ADM in a single action, (2) allow retroactive per-count date editing (C1/C2/C3 independently), (3) allow undoing a completed baixa.

**Architecture:** All changes are confined to `index.html`. Feature 1 modifies `aplicarBaixaContagem()`. Feature 2 adds `salvarDataContagem()` + adapts the date modal + adds editable dates row to history cards for session-type records. Feature 3 adds `desfazerBaixaContagem()` + a Desfazer button in history cards.

**Tech Stack:** Vanilla JS, Supabase JS client (`sbClient`), CSS custom properties, Phosphor Icons

---

### Task 1: Baixa por Inteiro — Modify `aplicarBaixaContagem()`

**Files:**
- Modify: `index.html` (function `aplicarBaixaContagem`, lines ~2054–2114)

- [ ] **Step 1: Replace `aplicarBaixaContagem()` body**

Replace the entire function with:

```javascript
async function aplicarBaixaContagem() {
    const result = state.contagem.savedResult;
    if (!result) return;

    const sessionId = state.contagem.turno;
    const date = state.contagem.date;
    const dateLabel = formatDate(date);
    const turnoLabel = sessionId ? ` — Turno ${sessionId}` : '';

    const itensNoite = result.filter(r => r.saida != null && r.saida > 0);
    const itensAdm   = result.filter(r => r.saida_adm != null && r.saida_adm > 0);

    if (itensNoite.length === 0 && itensAdm.length === 0) {
        showToast('Nenhuma saída registrada para dar baixa', 'error');
        return;
    }

    const listaNoite = itensNoite.length > 0
        ? `\nNoturno:\n${itensNoite.map(r => `• ${r.item_name}: -${r.saida} unid.`).join('\n')}`
        : '';
    const listaAdm = itensAdm.length > 0
        ? `\nADM:\n${itensAdm.map(r => `• ${r.item_name}: -${r.saida_adm} unid.`).join('\n')}`
        : '';

    if (!confirm(`Deseja dar baixa no Almoxarifado 2 — Distribuição?${listaNoite}${listaAdm}\n\nEssa ação atualizará o estoque e registrará os movimentos.`)) return;

    state.contagem.saving = true;
    render();
    try {
        for (const r of itensNoite) {
            const item = state.items.find(i => i.id === r.item_id);
            if (!item) continue;
            const novaQtd = Math.max(0, item.quantidade - r.saida);
            const { error: updErr } = await sbClient.from('items').update({ quantidade: novaQtd }).eq('id', r.item_id);
            if (updErr) throw updErr;
            await sbClient.from('movements').insert({
                date, type: 'SAIDA',
                item_id: r.item_id, item_name: r.item_name,
                quantity: r.saida,
                warehouse_id: item.warehouse_id || 'alm-2',
                user_name: state.user.nome,
                observations: `Baixa Contagem Diária ${dateLabel}${turnoLabel} — Noite`
            });
            item.quantidade = novaQtd;
        }
        for (const r of itensAdm) {
            const item = state.items.find(i => i.id === r.item_id);
            if (!item) continue;
            const novaQtd = Math.max(0, item.quantidade - r.saida_adm);
            const { error: updErr } = await sbClient.from('items').update({ quantidade: novaQtd }).eq('id', r.item_id);
            if (updErr) throw updErr;
            await sbClient.from('movements').insert({
                date, type: 'DISTRIBUICAO',
                item_id: r.item_id, item_name: r.item_name,
                quantity: r.saida_adm,
                warehouse_id: item.warehouse_id || 'alm-2',
                user_name: state.user.nome,
                observations: `Baixa Contagem Diária ${dateLabel}${turnoLabel} — ADM`
            });
            item.quantidade = novaQtd;
        }
        state.contagem.baixaAplicada = true;
        const baixaKey = sessionId ? `${date}_${sessionId}` : date;
        state.contagem.baixaDates[baixaKey] = true;
        state.contagem.openTickets = state.contagem.openTickets.filter(
            t => !(t.date === date && t.turno === sessionId)
        );
        cache.items = null;
        cache.movements = null;
        const total = itensNoite.length + itensAdm.length;
        showToast(`Baixa aplicada para ${total} item(ns)!`, 'success');
    } catch (e) {
        showToast('Erro ao aplicar baixa: ' + e.message, 'error');
        console.error(e);
    }
    state.contagem.saving = false;
    render();
}
```

- [ ] **Step 2: Verify baixa detection regex still works**

The existing regex in `loadContagemHistory()` at line ~2369:
```javascript
const sessMatch = m.observations?.match(/Turno ((?:CTG-)?\d+(?:-\d+)?)\b/);
```
This still matches `"Baixa Contagem Diária 14/05 — Turno 20250514 — Noite"` because the word boundary `\b` after the digits works fine before the space. No change needed.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(contagem): dar baixa completa — noturno + ADM em único ato"
```

---

### Task 2: Edição de Data por C1/C2/C3

**Files:**
- Modify: `index.html` (add `salvarDataContagem()`, adapt `showDateChangeModal()` reuse via new `showContagemDateModal()`, add state field `sessionMap`, add dates row in history cards)

- [ ] **Step 1: Add `sessionMap` to `state.contagem`**

In state initialization (~line 192, after `openTickets: []`), add:
```javascript
sessionMap: {},   // { sessionId: observacaoJSON }
```

- [ ] **Step 2: Load count_sessions in `loadContagemHistory()`**

In `loadContagemHistory()`, add `count_sessions` fetch to the existing `Promise.all`:
```javascript
const [countsRes, baixaRes, sessRes] = await Promise.all([
    sbClient.from('daily_counts')
        .select('*')
        .order('date', { ascending: false })
        .order('contagem_num', { ascending: true })
        .limit(600),
    sbClient.from('movements')
        .select('date, observations')
        .ilike('observations', 'Baixa Contagem Diária%')
        .limit(200),
    sbClient.from('count_sessions')
        .select('id, observacao')
        .limit(200)
]);
```
Then after setting `state.contagem.baixaDates`, add:
```javascript
const sessionMap = {};
if (!sessRes.error && sessRes.data) {
    sessRes.data.forEach(s => {
        try { sessionMap[s.id] = JSON.parse(s.observacao || '{}'); }
        catch { sessionMap[s.id] = {}; }
    });
}
state.contagem.sessionMap = sessionMap;
```

- [ ] **Step 3: Add `showContagemDateModal()` and `salvarDataContagem()`**

Add these two functions after `hideDateChangeModal()`:

```javascript
function showContagemDateModal(sessionId, field, currentDate, label) {
    var container = document.getElementById('date-modal');
    if (!container) return;
    var dd = currentDate ? currentDate.slice(8,10)+'/'+currentDate.slice(5,7)+'/'+currentDate.slice(0,4) : 'não definida';
    container.innerHTML =
        '<div onclick="hideDateChangeModal()" style="position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:900;display:flex;align-items:center;justify-content:center;padding:16px;">' +
        '<div onclick="event.stopPropagation()" style="background:var(--bg-1);border-radius:16px;padding:24px;width:340px;max-width:100%;box-shadow:0 8px 48px rgba(0,0,0,.22);">' +
        '<div style="font-weight:700;font-size:16px;margin-bottom:4px;color:var(--text-1);">' +
        '<i class="ph ph-calendar" style="color:var(--accent);margin-right:6px;"></i>' + label + '</div>' +
        '<p style="font-size:12px;color:var(--text-3);margin:0 0 18px;">Data atual: <strong style="color:var(--text-1);">' + dd + '</strong></p>' +
        '<label style="font-size:12px;font-weight:600;color:var(--text-2);display:block;margin-bottom:6px;">Nova data</label>' +
        '<input id="date-change-input" type="date" value="' + (currentDate || '') + '" ' +
        'style="width:100%;box-sizing:border-box;padding:10px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;background:var(--bg-2);color:var(--text-1);margin-bottom:18px;">' +
        '<div style="display:flex;gap:8px;">' +
        '<button onclick="hideDateChangeModal()" class="btn-secondary" style="flex:1;">Cancelar</button>' +
        '<button onclick="salvarDataContagem(\'' + sessionId + '\',\'' + field + '\')" class="btn-primary" style="flex:1;">Confirmar</button>' +
        '</div></div></div>';
}

async function salvarDataContagem(sessionId, field) {
    var input = document.getElementById('date-change-input');
    if (!input) return;
    var newDate = input.value;
    if (!newDate) { showToast('Selecione uma data.', 'error'); return; }
    hideDateChangeModal();
    try {
        var { data: sess } = await sbClient.from('count_sessions').select('*').eq('id', sessionId).maybeSingle();
        var obs = {};
        try { obs = JSON.parse(sess?.observacao || '{}'); } catch {}
        obs[field] = newDate;
        var { error } = await sbClient.from('count_sessions').update({ observacao: JSON.stringify(obs) }).eq('id', sessionId);
        if (error) throw error;
        if (!state.contagem.sessionMap) state.contagem.sessionMap = {};
        state.contagem.sessionMap[sessionId] = obs;
        showToast('Data atualizada!', 'success');
        render();
    } catch (e) {
        showToast('Erro ao salvar data: ' + (e.message || ''), 'error');
    }
}
```

- [ ] **Step 4: Add editable dates row in history cards (session-type records)**

In the full history card (lines ~4474–4508), the card header div ends with the `baixaBadge`. After the outer header `<div>`, add a dates row for session records:

Inside the `histCards.push(...)` block for full C1+C2+C3 cards, after the `<div style="font-size:11px;...">` line with statusLabel, add:

```javascript
const sessionObs = (isSessionId(turno) && state.contagem.sessionMap)
    ? (state.contagem.sessionMap[turno] || {})
    : {};
const c1DateDisp = sessionObs.c1_date ? sessionObs.c1_date.slice(8,10)+'/'+sessionObs.c1_date.slice(5,7) : formatDate(date).slice(0,5);
const c2DateDisp = sessionObs.c2_date ? sessionObs.c2_date.slice(8,10)+'/'+sessionObs.c2_date.slice(5,7) : formatDate(date).slice(0,5);
const c3DateDisp = sessionObs.c3_date ? sessionObs.c3_date.slice(8,10)+'/'+sessionObs.c3_date.slice(5,7) : formatDate(date).slice(0,5);
```

And add the dates row HTML inside the card (after the buttons row):

```html
${isSessionId(turno) ? `
<div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:10px;padding-top:10px;border-top:1px solid var(--border);font-size:12px;color:var(--text-2);">
    <span>C1 <strong>${c1DateDisp}</strong>
        <button onclick="showContagemDateModal('${turno}','c1_date','${sessionObs.c1_date || date}','Data da C1')"
            style="background:none;border:none;cursor:pointer;padding:0 4px;color:var(--accent);">✏</button>
    </span>
    <span>C2 <strong>${c2DateDisp}</strong>
        <button onclick="showContagemDateModal('${turno}','c2_date','${sessionObs.c2_date || date}','Data da C2')"
            style="background:none;border:none;cursor:pointer;padding:0 4px;color:var(--accent);">✏</button>
    </span>
    <span>C3 <strong>${c3DateDisp}</strong>
        <button onclick="showContagemDateModal('${turno}','c3_date','${sessionObs.c3_date || date}','Data da C3')"
            style="background:none;border:none;cursor:pointer;padding:0 4px;color:var(--accent);">✏</button>
    </span>
</div>` : ''}
```

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat(contagem): editar data de C1/C2/C3 individualmente por sessão"
```

---

### Task 3: Desfazer Baixa

**Files:**
- Modify: `index.html` (add `desfazerBaixaContagem()`, add Desfazer button to history cards)

- [ ] **Step 1: Add `desfazerBaixaContagem()` function**

Add after `aplicarBaixaContagem()`:

```javascript
async function desfazerBaixaContagem(date, turno) {
    if (!confirm(`Desfazer a baixa de ${formatDate(date)}?\n\nO estoque do Almoxarifado 2 será restaurado e os movimentos removidos. Esta ação não pode ser desfeita.`)) return;

    try {
        var q = sbClient.from('movements')
            .select('*')
            .ilike('observations', 'Baixa Contagem Diária%')
            .eq('date', date);
        var { data: movs, error: selErr } = await q;
        if (selErr) throw selErr;

        // Filtra pela sessão/turno
        const turnoFilter = turno || '';
        const filtered = (movs || []).filter(m => {
            if (!turnoFilter) return !m.observations?.includes('Turno');
            return m.observations?.includes(`Turno ${turnoFilter}`);
        });

        if (filtered.length === 0) {
            showToast('Movimentos não encontrados. Baixa pode ter sido removida manualmente.', 'error');
            return;
        }

        // Restaura estoque
        for (const m of filtered) {
            const item = state.items.find(i => i.id === m.item_id);
            if (!item) continue;
            const novaQtd = item.quantidade + m.quantity;
            const { error: updErr } = await sbClient.from('items').update({ quantidade: novaQtd }).eq('id', m.item_id);
            if (updErr) throw updErr;
            item.quantidade = novaQtd;
        }

        // Deleta movements
        const ids = filtered.map(m => m.id);
        const { error: delErr } = await sbClient.from('movements').delete().in('id', ids);
        if (delErr) throw delErr;

        // Atualiza estado local
        const baixaKey = turno ? `${date}_${turno}` : date;
        delete state.contagem.baixaDates[baixaKey];
        if (state.contagem.date === date && state.contagem.turno === (turno || null)) {
            state.contagem.baixaAplicada = false;
        }

        // Reinsere em openTickets se tiver C1
        const hasC1 = state.contagem.history.some(r => r.date === date && (r.turno || null) === (turno || null) && r.contagem_num === 1);
        if (hasC1) {
            const exists = state.contagem.openTickets.some(t => t.date === date && t.turno === (turno || null));
            if (!exists) {
                state.contagem.openTickets.unshift({ date, turno: turno || null, horario: '', hasC1: true, hasC2: true, hasC3: true });
            }
        }

        cache.items = null;
        cache.movements = null;
        showToast('Baixa desfeita! Estoque restaurado.', 'success');
        render();
    } catch (e) {
        showToast('Erro ao desfazer baixa: ' + (e.message || ''), 'error');
        console.error(e);
    }
}
```

- [ ] **Step 2: Add "Desfazer Baixa" button in full history cards**

In the buttons `<div>` of the full history card, after the `Excluir` button, add:

```html
${baixaFeita ? `
<button onclick="desfazerBaixaContagem('${date}','${turno || ''}')"
    class="btn-secondary"
    style="font-size:11px;padding:4px 10px;color:var(--red);border-color:var(--red);">
    <i class="ph ph-arrow-counter-clockwise"></i> Desfazer Baixa
</button>` : ''}
```

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(contagem): desfazer baixa — restaura estoque e remove movimentos"
```
