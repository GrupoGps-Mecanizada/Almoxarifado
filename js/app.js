/**
 * Almoxarifado EPI — App
 * Lógica da aplicação: render, eventos, movimentações, contagem
 */

// ============================================
// SAÍDA EMERGENCIAL
// ============================================
function emergencyAddToCart() {
    const em = state.emergency;
    const item = state.items.find(i => i.id === em.formItemId);
    if (!item) { showToast('Selecione um item', 'error'); return; }

    const hasSizes = item.tamanhos && Object.keys(item.tamanhos).length > 0;
    // Obrigatório selecionar tamanho só quando há tamanhos pré-configurados via dropdown
    if (hasSizes && !em.formSize) {
        showToast('Selecione um tamanho', 'error');
        return;
    }

    const sizeKey = em.formSize || null;
    const maxQty = hasSizes && sizeKey ? (item.tamanhos[sizeKey] || 0) : item.quantidade;
    const qty = Math.max(1, parseInt(em.formQty) || 1);
    if (qty > maxQty) {
        showToast(`Quantidade maior que o estoque disponível (${maxQty})`, 'error');
        return;
    }

    // Chave única no carrinho: item_id + tamanho (texto livre também funciona como chave)
    const existing = em.cart.find(c => c.item_id === item.id && c.size === sizeKey);
    if (existing) {
        const total = existing.quantidade + qty;
        if (total > maxQty) {
            showToast(`Total (${total}) maior que o estoque disponível (${maxQty})`, 'error');
            return;
        }
        existing.quantidade = total;
    } else {
        const label = sizeKey ? `${item.nome} (Tam: ${sizeKey})` : item.nome;
        em.cart.push({
            item_id: item.id,
            item_name: label,
            unidade: item.unidade,
            quantidade: qty,
            max: maxQty,
            warehouse_id: item.warehouse_id || 'alm-1',
            size: sizeKey
        });
    }
    em.formItemId = '';
    em.formSize = '';
    em.formQty = 1;
    em.showForm = false;
    render();
}

function emergencyRemoveFromCart(idx) {
    state.emergency.cart.splice(idx, 1);
    render();
}

async function confirmEmergencySaida() {
    const em = state.emergency;
    if (em.cart.length === 0) { showToast('Carrinho vazio', 'error'); return; }
    em.saving = true;
    render();
    try {
        for (const entry of em.cart) {
            const item = state.items.find(i => i.id === entry.item_id);
            if (!item) continue;

            // Atualiza tamanhos se o item tem numeração
            let novosTamanhos = item.tamanhos ? JSON.parse(JSON.stringify(item.tamanhos)) : null;
            if (entry.size && novosTamanhos) {
                novosTamanhos[entry.size] = Math.max(0, (novosTamanhos[entry.size] || 0) - entry.quantidade);
            }
            const novaQtd = novosTamanhos
                ? Object.values(novosTamanhos).reduce((a, b) => a + b, 0)
                : item.quantidade - entry.quantidade;

            // Item no emergencial zerado → remove do banco para não poluir visualmente
            if (novaQtd <= 0 && (item.warehouse_id || 'alm-1') === 'alm-emergencial') {
                const { error: delErr } = await sbClient.from('items').delete().eq('id', item.id);
                if (delErr) throw delErr;
            } else {
                const { error: updErr } = await sbClient
                    .from('items')
                    .update({ quantidade: novaQtd, tamanhos: novosTamanhos })
                    .eq('id', item.id);
                if (updErr) throw updErr;
            }

            // Registra movimento com tamanho
            await sbClient.from('movements').insert({
                date: getCurrentDate(),
                type: 'SAIDA',
                item_id: item.id,
                item_name: entry.size ? `${item.nome} (Tam: ${entry.size})` : item.nome,
                size: entry.size || null,
                quantity: entry.quantidade,
                warehouse_id: item.warehouse_id || 'alm-1',
                user_name: state.user.nome,
                observations: 'Saída Emergencial'
            });
        }
        await loadItems(true);
        em.cart = [];
        em.showForm = false;
        showToast('Saída emergencial registrada!', 'success');
    } catch (e) {
        showToast('Erro ao registrar saída: ' + e.message, 'error');
        console.error(e);
    }
    em.saving = false;
    render();
}

// ============================================
// LÓGICA DE NEGÓCIO
// ============================================

async function loadItems(forceRefresh = false) {
    const result = await getItems(forceRefresh);
    if (result.success) {
        state.items = result.items;
    }
}

async function loadMovements(forceRefresh = false) {
    const result = await getMovements(state.filters, forceRefresh);
    if (result.success) {
        state.movements = result.movements;
        state.currentPage = 1;
    }
}

async function loadStatistics() {
    const result = await getStatistics();
    if (result.success) {
        state.statistics = result.statistics;
        calculateAnalytics();
    }
}

async function loadWarehouses(forceRefresh = false) {
    const result = await getWarehouses(forceRefresh);
    if (result.success) {
        state.warehouses = result.warehouses;
    }
}

function calculateAnalytics() {
    // Calcula analytics baseado nas movimentações
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Movimentações recentes
    const recentMovements = state.movements.filter(m => {
        const movDate = new Date(m.date);
        return movDate >= monthAgo;
    });

    // Itens mais repostos
    const replenishmentCount = {};
    recentMovements.forEach(m => {
        if (m.type === 'REPOSICAO' || m.type === 'COMPRA') {
            replenishmentCount[m.item_name] = (replenishmentCount[m.item_name] || 0) + m.quantity;
        }
    });

    state.analytics.topReplenishedItems = Object.entries(replenishmentCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }));

    // Distribuição por categoria
    const categoryDist = {};
    state.items.forEach(item => {
        categoryDist[item.categoria] = (categoryDist[item.categoria] || 0) + item.quantidade;
    });

    state.analytics.categoryDistribution = Object.entries(categoryDist)
        .map(([category, quantity]) => ({ category, quantity }));

    // Contagem de movimentações
    const movementsByType = {};
    if (state.movements) {
        state.movements.forEach(m => {
            movementsByType[m.type] = (movementsByType[m.type] || 0) + 1;
        });
        state.statistics.totalMovements = state.movements.length;
    } else {
        state.statistics.totalMovements = 0;
    }
    state.statistics.movementsByType = movementsByType;
}

// ============================================
// XLSX EXPORT — HELPERS DE ESTILO
// ============================================
function _xlS(fgColor, fontColor, bold, center) {
    var s = {};
    if (fgColor) s.fill = { patternType: 'solid', fgColor: { rgb: fgColor } };
    if (fontColor || bold) {
        s.font = {};
        if (fontColor) s.font.color = { rgb: fontColor };
        if (bold) s.font.bold = true;
    }
    if (center) s.alignment = { horizontal: 'center', vertical: 'center' };
    return s;
}
function _xlC(v, t, s) {
    var c = { v: v != null ? v : '', t: t || (typeof v === 'number' ? 'n' : 's') };
    if (s) c.s = s;
    return c;
}
function _xlSetRow(ws, r, values, styles) {
    values.forEach(function (v, c) {
        var s = Array.isArray(styles) ? (styles[c] || null) : (styles || null);
        ws[XLSX.utils.encode_cell({ r: r, c: c })] = _xlC(v, null, s);
    });
}

// ============================================
// EXPORTAÇÃO PARA EXCEL (SHEETJS)
// ============================================
function exportStockToXLSX() {
    try {
        if (!state.items || state.items.length === 0) {
            showToast('Não há dados para exportar', 'error');
            return;
        }
        var wb = XLSX.utils.book_new();
        var now = new Date();
        var nowStr = now.toLocaleString('pt-BR');
        var dateStr = getCurrentDate();
        var periodDays = 30;
        var periodStart = new Date();
        periodStart.setDate(periodStart.getDate() - periodDays);
        var periodStartStr = periodStart.toISOString().split('T')[0];

        var movs = state.movements || [];
        var outboundByItem = {}, inboundByItem = {};
        movs.forEach(function (m) {
            if (!m.date || m.date < periodStartStr) return;
            if (['SAIDA', 'DISTRIBUICAO', 'REPOSICAO'].indexOf(m.type) >= 0)
                outboundByItem[m.item_name] = (outboundByItem[m.item_name] || 0) + (m.quantity || 0);
            if (m.type === 'COMPRA')
                inboundByItem[m.item_name] = (inboundByItem[m.item_name] || 0) + (m.quantity || 0);
        });

        var S_TITLE    = _xlS('1F4E79', 'FFFFFF', true,  true);
        var S_SUB      = _xlS('2E75B6', 'FFFFFF', false, false);
        var S_HDR      = _xlS('1F4E79', 'FFFFFF', true,  true);
        var S_ZERO     = _xlS('FFCCCC', '9C0006', true,  false);
        var S_LOW      = _xlS('FFF2CC', '7D6608', false, false);
        var S_ALT      = _xlS('F5F5F5', null,     false, false);
        var S_NORM     = _xlS(null,     null,     false, false);
        var S_KPI_L    = _xlS('2E75B6', 'FFFFFF', true,  false);
        var S_KPI_V    = _xlS('EBF3FB', '1F4E79', true,  false);
        var S_TOTAL    = _xlS('D9D9D9', '000000', true,  false);
        var S_OK       = _xlS('C6EFCE', '276221', false, false);

        // ===== ABA RESUMO =====
        var wsRes = {};
        var nC = 5;
        var r = 0;
        _xlSetRow(wsRes, r++, ['ALMOXARIFADO EPI — RESUMO GERAL'], [S_TITLE]);
        _xlSetRow(wsRes, r++, ['Gerado em: ' + nowStr], [S_SUB]);
        r++;
        var totItens = state.items.length;
        var totQtd   = state.items.reduce(function (s, i) { return s + (i.quantidade || 0); }, 0);
        var totZero  = state.items.filter(function (i) { return (i.quantidade || 0) === 0; }).length;
        var totBaixo = state.items.filter(function (i) {
            return i.estoque_minimo != null && (i.quantidade || 0) > 0 && i.quantidade < i.estoque_minimo;
        }).length;
        _xlSetRow(wsRes, r++, ['Indicador', 'Valor'], [S_HDR, S_HDR]);
        _xlSetRow(wsRes, r++, ['Total de Itens Cadastrados', totItens],              [S_KPI_L, S_KPI_V]);
        _xlSetRow(wsRes, r++, ['Total em Estoque (todas as unidades)', totQtd],       [S_KPI_L, S_KPI_V]);
        _xlSetRow(wsRes, r++, ['Itens com Estoque Zerado', totZero],                  [S_ZERO,  S_ZERO]);
        _xlSetRow(wsRes, r++, ['Itens Abaixo do Mínimo', totBaixo],                   [S_LOW,   S_LOW]);
        r++;
        _xlSetRow(wsRes, r++, ['COMPARATIVO POR ALMOXARIFADO'], [S_TITLE]);
        _xlSetRow(wsRes, r++, ['Almoxarifado', 'Nº Itens', 'Qtd Total', 'Zerados', 'Abaixo Mínimo'],
            [S_HDR, S_HDR, S_HDR, S_HDR, S_HDR]);
        state.warehouses.forEach(function (wh, idx) {
            var wi = state.items.filter(function (i) { return (i.warehouse_id || 'alm-1') === wh.id; });
            var q  = wi.reduce(function (s, i) { return s + (i.quantidade || 0); }, 0);
            var z  = wi.filter(function (i) { return (i.quantidade || 0) === 0; }).length;
            var b  = wi.filter(function (i) {
                return i.estoque_minimo != null && (i.quantidade || 0) > 0 && i.quantidade < i.estoque_minimo;
            }).length;
            var rs = idx % 2 === 0 ? S_NORM : S_ALT;
            _xlSetRow(wsRes, r++, [wh.nome, wi.length, q, z, b], [rs, rs, rs, rs, rs]);
        });
        wsRes['!ref']    = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: r - 1, c: nC - 1 } });
        wsRes['!cols']   = [{ wch: 42 }, { wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 16 }];
        wsRes['!merges'] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: nC - 1 } },
            { s: { r: 9, c: 0 }, e: { r: 9, c: nC - 1 } }
        ];
        XLSX.utils.book_append_sheet(wb, wsRes, '📊 Resumo');

        // ===== ABAS POR ALMOXARIFADO =====
        var allSizes = [].concat.apply([], state.items.map(function (i) {
            return i.tamanhos ? Object.keys(i.tamanhos) : [];
        })).filter(function (v, i, a) { return a.indexOf(v) === i; }).sort();

        state.warehouses.forEach(function (wh) {
            var whItems = state.items
                .filter(function (i) { return (i.warehouse_id || 'alm-1') === wh.id; })
                .sort(function (a, b) {
                    return (a.categoria || '').localeCompare(b.categoria || '') || a.nome.localeCompare(b.nome);
                });
            if (whItems.length === 0) return;

            var ws2 = {};
            var cols = ['#', 'Item', 'Categoria', 'Unidade', 'Qtd Total', 'Mínimo', 'Status']
                .concat(allSizes.map(function (s) { return formatVariationLabel(s); }));
            var r2 = 0;
            _xlSetRow(ws2, r2++, ['ESTOQUE — ' + wh.nome.toUpperCase()], [S_TITLE]);
            _xlSetRow(ws2, r2++, ['Gerado em: ' + nowStr + '   |   ' + whItems.length + ' itens'], [S_SUB]);
            r2++;
            _xlSetRow(ws2, r2++, cols, cols.map(function () { return S_HDR; }));
            whItems.forEach(function (item, idx) {
                var isZero = (item.quantidade || 0) === 0;
                var isLow  = !isZero && item.estoque_minimo != null && (item.quantidade || 0) < item.estoque_minimo;
                var rs     = isZero ? S_ZERO : (isLow ? S_LOW : (idx % 2 === 0 ? S_NORM : S_ALT));
                var status = isZero ? 'ZERADO' : (isLow ? 'ABAIXO MÍN.' : 'OK');
                var row = [
                    idx + 1, item.nome || '', item.categoria || '', item.unidade || '',
                    item.quantidade || 0,
                    item.estoque_minimo != null ? item.estoque_minimo : '—',
                    status
                ].concat(allSizes.map(function (s) {
                    return item.tamanhos ? (item.tamanhos[s] != null ? item.tamanhos[s] : '') : '';
                }));
                _xlSetRow(ws2, r2++, row, row.map(function () { return rs; }));
            });
            ws2['!ref']    = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: r2 - 1, c: cols.length - 1 } });
            ws2['!cols']   = [{ wch: 4 }, { wch: 32 }, { wch: 20 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 12 }]
                .concat(allSizes.map(function () { return { wch: 10 }; }));
            ws2['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: cols.length - 1 } }];
            XLSX.utils.book_append_sheet(wb, ws2, ('📦 ' + wh.nome).substring(0, 31));
        });

        // ===== ABA POR CATEGORIA =====
        var catMap = {};
        state.items.forEach(function (item) {
            var cat = item.categoria || 'Sem Categoria';
            if (!catMap[cat]) catMap[cat] = { itens: 0, estoque: 0, saidas: 0, entradas: 0 };
            catMap[cat].itens++;
            catMap[cat].estoque  += (item.quantidade || 0);
            catMap[cat].saidas   += (outboundByItem[item.nome] || 0);
            catMap[cat].entradas += (inboundByItem[item.nome] || 0);
        });
        var catRows = Object.entries(catMap).sort(function (a, b) { return a[0].localeCompare(b[0]); });
        var wsCat = {}, r3 = 0;
        var catCols = ['Categoria', 'Nº Itens', 'Total em Estoque', 'Saídas (30d)', 'Entradas (30d)', 'Giro (%)'];
        _xlSetRow(wsCat, r3++, ['ESTOQUE POR CATEGORIA'], [S_TITLE]);
        _xlSetRow(wsCat, r3++, ['Período de análise: últimos ' + periodDays + ' dias   |   Gerado em: ' + nowStr], [S_SUB]);
        r3++;
        _xlSetRow(wsCat, r3++, catCols, catCols.map(function () { return S_HDR; }));
        var cTotItens = 0, cTotEst = 0, cTotSai = 0, cTotEnt = 0;
        catRows.forEach(function (entry, idx) {
            var cat = entry[0], d = entry[1];
            var giro = d.estoque > 0 ? parseFloat(((d.saidas / d.estoque) * 100).toFixed(1)) : 0;
            var rs = idx % 2 === 0 ? S_NORM : S_ALT;
            _xlSetRow(wsCat, r3++, [cat, d.itens, d.estoque, d.saidas, d.entradas, giro],
                [rs, rs, rs, rs, rs, rs]);
            cTotItens += d.itens; cTotEst += d.estoque;
            cTotSai   += d.saidas; cTotEnt += d.entradas;
        });
        var totalGiro = cTotEst > 0 ? parseFloat(((cTotSai / cTotEst) * 100).toFixed(1)) : 0;
        _xlSetRow(wsCat, r3++, ['TOTAL', cTotItens, cTotEst, cTotSai, cTotEnt, totalGiro],
            [S_TOTAL, S_TOTAL, S_TOTAL, S_TOTAL, S_TOTAL, S_TOTAL]);
        wsCat['!ref']    = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: r3 - 1, c: 5 } });
        wsCat['!cols']   = [{ wch: 28 }, { wch: 10 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 12 }];
        wsCat['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }];
        XLSX.utils.book_append_sheet(wb, wsCat, '🏷️ Por Categoria');

        // ===== ABA ALERTAS =====
        var alertItems = state.items
            .filter(function (i) {
                return (i.quantidade || 0) === 0 ||
                    (i.estoque_minimo != null && (i.quantidade || 0) < i.estoque_minimo);
            })
            .map(function (item) {
                var saidas = outboundByItem[item.nome] || 0;
                var cons   = saidas / periodDays;
                var dias   = cons > 0 ? Math.floor((item.quantidade || 0) / cons) : null;
                var sug    = cons > 0 ? Math.ceil(cons * 7) : null;
                var wh     = (state.warehouses || []).find(function (w) {
                    return w.id === (item.warehouse_id || 'alm-1');
                });
                return {
                    item: item, almox: wh ? wh.nome : '—',
                    cons: cons, dias: dias, sug: sug,
                    isZero: (item.quantidade || 0) === 0
                };
            })
            .sort(function (a, b) {
                if (a.isZero !== b.isZero) return a.isZero ? -1 : 1;
                return (a.dias != null ? a.dias : 9999) - (b.dias != null ? b.dias : 9999);
            });

        var wsAlt = {}, r4 = 0;
        var altCols = ['Item', 'Categoria', 'Almoxarifado', 'Qtd Atual', 'Mínimo',
                       'Status', 'Cons. Médio/Dia', 'Dias Restantes', 'Qtd Sugerida (7d)'];
        _xlSetRow(wsAlt, r4++, ['ALERTAS DE ESTOQUE — ' + alertItems.length + ' ITENS CRÍTICOS'], [S_TITLE]);
        _xlSetRow(wsAlt, r4++,
            ['Período: últimos ' + periodDays + ' dias   |   Gerado em: ' + nowStr], [S_SUB]);
        r4++;
        _xlSetRow(wsAlt, r4++, altCols, altCols.map(function () { return S_HDR; }));
        if (alertItems.length === 0) {
            _xlSetRow(wsAlt, r4++, ['✅ Nenhum item crítico no momento'], [S_OK]);
        } else {
            alertItems.forEach(function (a) {
                var rs = a.isZero ? S_ZERO : S_LOW;
                var status = a.isZero ? 'ZERADO' : 'ABAIXO MÍN.';
                _xlSetRow(wsAlt, r4++, [
                    a.item.nome, a.item.categoria || '—', a.almox,
                    a.item.quantidade || 0,
                    a.item.estoque_minimo != null ? a.item.estoque_minimo : '—',
                    status,
                    a.cons > 0 ? parseFloat(a.cons.toFixed(2)) : 0,
                    a.dias != null ? a.dias : '—',
                    a.sug  != null ? a.sug  : '—'
                ], altCols.map(function () { return rs; }));
            });
        }
        wsAlt['!ref']        = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: r4 - 1, c: 8 } });
        wsAlt['!cols']       = [{ wch: 32 }, { wch: 18 }, { wch: 20 }, { wch: 10 }, { wch: 10 },
                                 { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 20 }];
        wsAlt['!merges']     = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 8 } }];
        wsAlt['!autofilter'] = { ref: 'A4:I' + r4 };
        XLSX.utils.book_append_sheet(wb, wsAlt, '⚠️ Alertas');

        XLSX.writeFile(wb, 'Estoque_Almoxarifados_' + dateStr + '.xlsx');
        showToast('Relatório completo exportado!', 'success');
    } catch (error) {
        console.error('Erro ao exportar estoque:', error);
        showToast('Erro ao exportar para Excel', 'error');
    }
}

function exportMovementsToXLSX() {
    try {
        var movements = getFilteredMovements();
        if (!movements || movements.length === 0) {
            showToast('Não há dados para exportar', 'error');
            return;
        }
        var TYPE_STYLES = {
            'COMPRA':        { bg: 'C6EFCE', fg: '276221' },
            'DISTRIBUICAO':  { bg: 'FFCCCC', fg: '9C0006' },
            'SAIDA':         { bg: 'FFCCCC', fg: '9C0006' },
            'REPOSICAO':     { bg: 'DDEEFF', fg: '1F4E79' },
            'AJUSTE':        { bg: 'FFF2CC', fg: '7D6608' },
            'TRANSFERENCIA': { bg: 'CCF2F4', fg: '005A60' }
        };
        var S_TITLE = _xlS('1F4E79', 'FFFFFF', true,  true);
        var S_SUB   = _xlS('2E75B6', 'FFFFFF', false, false);
        var S_HDR   = _xlS('1F4E79', 'FFFFFF', true,  true);
        var ws = {}, r = 0;
        var nowStr = new Date().toLocaleString('pt-BR');
        var cols = ['Data', 'Tipo', 'Item', 'Qtd', 'Colaborador/Fornecedor',
                    'Usuário', 'Observações', 'Data/Hora Registro'];
        _xlSetRow(ws, r++, ['HISTÓRICO DE MOVIMENTAÇÕES'], [S_TITLE]);
        _xlSetRow(ws, r++,
            ['Período filtrado   |   ' + movements.length + ' registros   |   Gerado em: ' + nowStr], [S_SUB]);
        r++;
        _xlSetRow(ws, r++, cols, cols.map(function () { return S_HDR; }));
        movements.forEach(function (m) {
            var ts = TYPE_STYLES[m.type] || { bg: 'F5F5F5', fg: '000000' };
            var rs = _xlS(ts.bg, ts.fg, false, false);
            var d  = m.date ? m.date.slice(8,10)+'/'+m.date.slice(5,7)+'/'+m.date.slice(0,4) : '—';
            var typeLabel = MOVEMENT_TYPES[m.type] ? MOVEMENT_TYPES[m.type].label : m.type;
            var collab    = m.employeeName || m.employee || m.supplier || '—';
            var dtReg     = formatDateTime(m.timestamp || m.created_at);
            _xlSetRow(ws, r++,
                [d, typeLabel, m.item_name || '—', m.quantity || 0, collab,
                 m.user_name || '—', m.observations || '', dtReg],
                cols.map(function () { return rs; })
            );
        });
        ws['!ref']        = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: r - 1, c: 7 } });
        ws['!cols']       = [{ wch: 12 }, { wch: 20 }, { wch: 30 }, { wch: 8 },
                              { wch: 22 }, { wch: 16 }, { wch: 40 }, { wch: 20 }];
        ws['!merges']     = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 7 } }];
        ws['!autofilter'] = { ref: 'A4:H' + r };
        var wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, '📋 Movimentações');
        XLSX.writeFile(wb, 'Movimentacoes_Almoxarifado_' + getCurrentDate() + '.xlsx');
        showToast('Histórico exportado!', 'success');
    } catch (error) {
        console.error('Erro ao exportar histórico:', error);
        showToast('Erro ao exportar para Excel', 'error');
    }
}

function exportAlertsToXLSX() {
    try {
        var items  = (state.dashboard && state.dashboard.stockItems) ? state.dashboard.stockItems : state.items;
        var movs   = (state.dashboard && state.dashboard.movements)  ? state.dashboard.movements  : (state.movements || []);
        var p      = state.dashboard && state.dashboard.period;
        var pDays  = p === '7d' ? 7 : p === '90d' ? 90 : 30;
        var outboundByItem = {};
        movs.forEach(function (m) {
            if (['SAIDA', 'DISTRIBUICAO', 'REPOSICAO'].indexOf(m.type) >= 0)
                outboundByItem[m.item_name] = (outboundByItem[m.item_name] || 0) + (m.quantity || 0);
        });
        var alertItems = items
            .filter(function (i) {
                return (i.quantidade || 0) === 0 ||
                    (i.estoque_minimo != null && (i.quantidade || 0) < i.estoque_minimo);
            })
            .map(function (item) {
                var saidas = outboundByItem[item.nome] || 0;
                var cons   = saidas / pDays;
                var dias   = cons > 0 ? Math.floor((item.quantidade || 0) / cons) : null;
                var sug    = cons > 0 ? Math.ceil(cons * 7) : null;
                var wh     = (state.warehouses || []).find(function (w) {
                    return w.id === (item.warehouse_id || 'alm-1');
                });
                return {
                    nome: item.nome, categoria: item.categoria || '—',
                    almox: wh ? wh.nome : '—',
                    qtd: item.quantidade || 0,
                    min: item.estoque_minimo != null ? item.estoque_minimo : '—',
                    status: (item.quantidade || 0) === 0 ? 'ZERADO' : 'ABAIXO MÍN.',
                    cons: cons > 0 ? parseFloat(cons.toFixed(2)) : 0,
                    dias: dias != null ? dias : '—',
                    sug:  sug  != null ? sug  : '—',
                    isZero: (item.quantidade || 0) === 0
                };
            })
            .sort(function (a, b) {
                if (a.isZero !== b.isZero) return a.isZero ? -1 : 1;
                var da = typeof a.dias === 'number' ? a.dias : 9999;
                var db = typeof b.dias === 'number' ? b.dias : 9999;
                return da - db;
            });
        if (alertItems.length === 0) {
            showToast('Nenhum item em alerta no momento', 'info');
            return;
        }
        var S_TITLE = _xlS('1F4E79', 'FFFFFF', true, true);
        var S_SUB   = _xlS('2E75B6', 'FFFFFF', false, false);
        var S_HDR   = _xlS('1F4E79', 'FFFFFF', true, true);
        var S_ZERO  = _xlS('FFCCCC', '9C0006', true, false);
        var S_LOW   = _xlS('FFF2CC', '7D6608', false, false);
        var ws = {}, r = 0;
        var cols = ['Item', 'Categoria', 'Almoxarifado', 'Qtd Atual', 'Mínimo',
                    'Status', 'Cons. Médio/Dia', 'Dias Restantes', 'Qtd Sugerida (7d)'];
        _xlSetRow(ws, r++, ['ALERTAS DE ESTOQUE — ' + alertItems.length + ' ITENS CRÍTICOS'], [S_TITLE]);
        _xlSetRow(ws, r++,
            ['Período: últimos ' + pDays + ' dias   |   Gerado em: ' + new Date().toLocaleString('pt-BR')], [S_SUB]);
        r++;
        _xlSetRow(ws, r++, cols, cols.map(function () { return S_HDR; }));
        alertItems.forEach(function (a) {
            var rs = a.isZero ? S_ZERO : S_LOW;
            _xlSetRow(ws, r++,
                [a.nome, a.categoria, a.almox, a.qtd, a.min, a.status, a.cons, a.dias, a.sug],
                cols.map(function () { return rs; })
            );
        });
        ws['!ref']        = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: r - 1, c: 8 } });
        ws['!cols']       = [{ wch: 32 }, { wch: 18 }, { wch: 20 }, { wch: 10 }, { wch: 10 },
                              { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 20 }];
        ws['!merges']     = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 8 } }];
        ws['!autofilter'] = { ref: 'A4:I' + r };
        var wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, '⚠️ Alertas');
        XLSX.writeFile(wb, 'Alertas_Estoque_' + getCurrentDate() + '.xlsx');
        showToast('Alertas exportados!', 'success');
    } catch (error) {
        console.error('Erro ao exportar alertas:', error);
        showToast('Erro ao exportar alertas', 'error');
    }
}

async function handleLogout() {
    await ALM_AUTH.logout();
}

// Funções de movimentação
function openMovementSelector() {
    navigateTo('movementSelector');
}

function startMovement(type) {
    state.movementOperation = {
        active: true,
        type: type,
        selectedItem: null,
        employeeName: '',
        supplier: '',
        quantity: 1,
        observations: '',
        targetWarehouse: state.activeWarehouse,
        createNewItem: false,
        newItemName: '',
        newItemCategory: '',
        newItemUnit: 'UN'
    };
    navigateTo('movement');
}

function cancelMovement() {
    state.movementOperation = {
        active: false,
        type: null,
        selectedItem: null,
        size: null,
        employeeName: '',
        supplier: '',
        quantity: 1,
        observations: '',
        targetWarehouse: state.activeWarehouse,
        createNewItem: false,
        newItemName: '',
        newItemCategory: '',
        newItemUnit: 'UN'
    };
    goBack();
}

async function confirmMovement() {
    const op = state.movementOperation;


    if (!op.quantity || op.quantity <= 0) {
        showToast('Quantidade deve ser maior que zero', 'error');
        return;
    }

    // Fluxo: Compra com NOVO item
    if (op.createNewItem) {
        if (!op.newItemName) {
            showToast('Nome do item é obrigatório', 'error');
            return;
        }
        if (!op.newItemCategory) {
            showToast('Categoria do item é obrigatória', 'error');
            return;
        }

        const newItemId = 'ITEM-' + Date.now();
        const newItem = {
            id: newItemId,
            nome: op.newItemName.trim().toUpperCase(),
            categoria: op.newItemCategory,
            quantidade: 0,
            unidade: op.newItemUnit || 'UN',
            unidades_por_caixa: 1,
            tamanhos: null,
            observacoes: '',
            warehouse_id: op.targetWarehouse
        };

        const itemResult = await saveItem(newItem);
        if (!itemResult.success) return;

        const movement = {
            date: getCurrentDate(),
            type: 'COMPRA',
            item_id: newItemId,
            item_name: op.newItemName,
            size: null,
            quantity: op.quantity,
            employee: '',
            supplier: op.supplier,
            user_name: state.user.nome,
            observations: op.observations,
            warehouse_id: op.targetWarehouse
        };

        const result = await saveMovement(movement);
        if (result.success) {
            cancelMovement();
        }
        return;
    }

    // Fluxo: Compra em item EXISTENTE
    if (!op.selectedItem) {
        showToast('Selecione um item', 'error');
        return;
    }

    const item = state.items.find(i => i.id === op.selectedItem);
    if (!item) {
        showToast('Item não encontrado', 'error');
        return;
    }

    if (item.tamanhos && Object.keys(item.tamanhos).length > 0 && !op.size) {
        showToast('Selecione um tamanho', 'error');
        return;
    }

    const movement = {
        date: getCurrentDate(),
        type: 'COMPRA',
        item_id: item.id,
        item_name: op.size ? `${item.nome} (Tam: ${op.size})` : item.nome,
        size: op.size || null,
        quantity: op.quantity,
        employee: '',
        supplier: op.supplier,
        user_name: state.user.nome,
        observations: op.observations,
        warehouse_id: op.targetWarehouse
    };

    const result = await saveMovement(movement);
    if (result.success) {
        cancelMovement();
    }
}

function updateItemFormLayout() {
    const hasSzChk = document.getElementById('hasSizes')?.checked;
    const hasCondChk = document.getElementById('hasCondicoes')?.checked;
    const singleQtyArea = document.getElementById('singleQuantityArea');
    const sizesConfigArea = document.getElementById('sizesConfigArea');
    const condicoesOnlyArea = document.getElementById('condicoesOnlyArea');
    const itemQtyInput = document.getElementById('itemQuantity');
    const addSizeBtn = document.getElementById('addSizeBtn');
    const sizeListLabel = document.getElementById('sizeListLabel');

    if (!hasSzChk && !hasCondChk) {
        if (singleQtyArea) singleQtyArea.className = 'block';
        if (sizesConfigArea) sizesConfigArea.className = 'hidden';
        if (condicoesOnlyArea) condicoesOnlyArea.className = 'hidden';
        if (itemQtyInput) itemQtyInput.required = true;
    } else if (hasSzChk && !hasCondChk) {
        if (singleQtyArea) singleQtyArea.className = 'hidden';
        if (sizesConfigArea) sizesConfigArea.className = 'block';
        if (condicoesOnlyArea) condicoesOnlyArea.className = 'hidden';
        if (itemQtyInput) itemQtyInput.required = false;
        if (sizeListLabel) sizeListLabel.textContent = 'Tamanhos e Quantidades';
        if (addSizeBtn) addSizeBtn.style.display = '';
    } else if (!hasSzChk && hasCondChk) {
        if (singleQtyArea) singleQtyArea.className = 'hidden';
        if (sizesConfigArea) sizesConfigArea.className = 'hidden';
        if (condicoesOnlyArea) condicoesOnlyArea.className = 'block';
        if (itemQtyInput) itemQtyInput.required = false;
    } else {
        // ambos: sizes + condições
        if (singleQtyArea) singleQtyArea.className = 'hidden';
        if (sizesConfigArea) sizesConfigArea.className = 'block';
        if (condicoesOnlyArea) condicoesOnlyArea.className = 'hidden';
        if (itemQtyInput) itemQtyInput.required = false;
        if (sizeListLabel) sizeListLabel.textContent = 'Tamanhos × Condição (NOVO / HIGIENIZADO)';
        if (addSizeBtn) addSizeBtn.style.display = '';
    }
}

function toggleSizesSection(show) { updateItemFormLayout(); }

function addSizeRow() {
    const hasCondChk = document.getElementById('hasCondicoes')?.checked;
    const list = document.getElementById('sizesList');
    const row = document.createElement('div');
    row.className = 'size-row';
    row.style.cssText = 'display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:6px;';
    if (hasCondChk) {
        row.innerHTML = `
            <input type="text" class="size-name field-input" style="width:90px;" placeholder="Ex: P ou 40" required>
            <span style="font-size:12px;color:var(--green);font-weight:600;">NOVO:</span>
            <input type="number" class="size-qty-novo field-input" style="width:80px;" placeholder="0" value="0" min="0">
            <span style="font-size:12px;color:var(--accent);font-weight:600;">HIG:</span>
            <input type="number" class="size-qty-hig field-input" style="width:80px;" placeholder="0" value="0" min="0">
            <button type="button" onclick="this.parentElement.remove()" class="btn-icon" style="color:var(--red)"><i class="ph-bold ph-trash"></i></button>
        `;
    } else {
        row.innerHTML = `
            <input type="text" class="size-name field-input" style="width:120px;" placeholder="Ex: 40 ou M" required>
            <input type="number" class="size-qty field-input" style="width:100px;" placeholder="Qtd" value="0" min="0">
            <button type="button" onclick="this.parentElement.remove()" class="btn-icon" style="color:var(--red)"><i class="ph-bold ph-trash"></i></button>
        `;
    }
    if (list) list.appendChild(row);
}

async function handleSaveItem(e) {
    e.preventDefault();

    const hasSizesChecked = document.getElementById('hasSizes')?.checked;
    const hasCondicoesChecked = document.getElementById('hasCondicoes')?.checked;
    let tamanhos = null;
    let quantidade = 0;

    if (hasSizesChecked && hasCondicoesChecked) {
        tamanhos = {};
        document.querySelectorAll('.size-row').forEach(row => {
            const name = row.querySelector('.size-name')?.value.trim();
            if (!name) return;
            const novoQty = parseInt(row.querySelector('.size-qty-novo')?.value) || 0;
            const higQty  = parseInt(row.querySelector('.size-qty-hig')?.value)  || 0;
            tamanhos[`${name}|NOVO`]        = novoQty;
            tamanhos[`${name}|HIGIENIZADO`] = higQty;
            quantidade += novoQty + higQty;
        });
    } else if (hasSizesChecked) {
        tamanhos = {};
        document.querySelectorAll('.size-row').forEach(row => {
            const name = row.querySelector('.size-name')?.value.trim();
            const qty  = parseInt(row.querySelector('.size-qty')?.value) || 0;
            if (name) { tamanhos[name] = qty; quantidade += qty; }
        });
    } else if (hasCondicoesChecked) {
        tamanhos = {};
        const novoQty = parseInt(document.getElementById('condicaoNovo')?.value) || 0;
        const higQty  = parseInt(document.getElementById('condicaoHig')?.value)  || 0;
        tamanhos['NOVO']        = novoQty;
        tamanhos['HIGIENIZADO'] = higQty;
        quantidade = novoQty + higQty;
    } else {
        quantidade = parseInt(document.getElementById('itemQuantity')?.value) || 0;
    }

    const selectedWarehouse = document.querySelector('input[name="itemWarehouse"]:checked');
    const itemData = {
        id: state.editingItem?.id || 'ITEM-' + Date.now(),
        nome: document.getElementById('itemName').value.trim().toUpperCase(),
        categoria: document.getElementById('itemCategory').value,
        quantidade: quantidade,
        unidade: document.getElementById('itemUnit').value,
        unidades_por_caixa: parseInt(document.getElementById('itemUnitsPerBox')?.value) || 1,
        tamanhos: tamanhos,
        observacoes: document.getElementById('itemObs').value,
        warehouse_id: selectedWarehouse?.value || state.editingItem?.warehouse_id || state.activeWarehouse
    };

    const result = await saveItem(itemData);

    if (result.success) {
        state.editingItem = null;
        goBack();
    }
}

async function handleDeleteItem(itemId) {
    if (!confirm('Tem certeza que deseja excluir este item?')) {
        return;
    }

    await deleteItem(itemId);
}

function openEditItem(item) {
    state.editingItem = item;
    navigateTo('editItem');
}

function openNewItem() {
    state.editingItem = null;
    navigateTo('editItem');
}

function navigateToWarehouses() {
    navigateTo('warehouses');
}

function startTransfer(fromWarehouseId, preSelectedItemId) {
    const from = fromWarehouseId || state.activeWarehouse;
    // Destino padrão: próximo na lista, excluindo a origem
    const others = state.warehouses.filter(w => w.id !== from);
    const defaultTo = others[0]?.id || 'alm-2';
    state.transferOperation = {
        active: true,
        fromWarehouse: from,
        toWarehouse: defaultTo,
        selectedItem: preSelectedItemId || null,
        size: null,
        quantity: 1,
        observations: ''
    };
    navigateTo('transfer');
}

function confirmTransfer() { transferItems(); }

function cancelTransfer() {
    state.transferOperation = {
        active: false, fromWarehouse: 'alm-1', toWarehouse: 'alm-2',
        selectedItem: null, size: null, quantity: 1, observations: ''
    };
    goBack();
}

async function transferItems() {
    const op = state.transferOperation;
    if (!op.active || !op.selectedItem || op.quantity < 1) return;
    // Se o destino for "Dar Baixa", redireciona para a funcao correta
    if (op.toWarehouse === 'DAR_BAIXA') {
        await transferDarBaixa();
        return;
    }
    if (op.fromWarehouse === op.toWarehouse) {
        showToast('Origem e destino não podem ser iguais', 'warning');
        return;
    }

    const fromItem = state.items.find(i => i.id === op.selectedItem);
    const toItem = state.items.find(i => i.nome === fromItem.nome && i.warehouse_id === op.toWarehouse);

    let fromTamanhos = { ...(fromItem.tamanhos || {}) };
    let toTamanhos = toItem ? { ...(toItem.tamanhos || {}) } : {};
    let fromQtd = fromItem.quantidade;
    let toQtd = toItem ? toItem.quantidade : 0;

    if (op.size) {
        if (!fromTamanhos[op.size] || fromTamanhos[op.size] < op.quantity) {
            showToast('Quantidade indisponível neste tamanho', 'error');
            return;
        }
        fromTamanhos[op.size] -= op.quantity;
        toTamanhos[op.size] = (toTamanhos[op.size] || 0) + op.quantity;
    } else {
        if (fromQtd < op.quantity) {
            showToast('Quantidade indisponível', 'error');
            return;
        }
    }

    fromQtd -= op.quantity;
    toQtd += op.quantity;

    state.loadingMessage = 'Transferindo...';
    render();

    try {
        const { error: err1 } = await sbClient
            .from('items')
            .update({ quantidade: fromQtd, tamanhos: fromTamanhos })
            .eq('id', fromItem.id);
        if (err1) throw err1;

        if (toItem) {
            const { error: err2 } = await sbClient
                .from('items')
                .update({ quantidade: toQtd, tamanhos: toTamanhos })
                .eq('id', toItem.id);
            if (err2) throw err2;
        } else {
            const newItem = {
                nome: fromItem.nome,
                codigo_totvs: fromItem.codigo_totvs,
                unidade_medida: fromItem.unidade_medida,
                estoque_minimo: fromItem.estoque_minimo,
                categoria: fromItem.categoria,
                tamanhos: toTamanhos,
                quantidade: toQtd,
                warehouse_id: op.toWarehouse
            };
            const { error: err3 } = await sbClient
                .from('items')
                .insert([newItem]);
            if (err3) throw err3;
        }

        const { error: err4 } = await sbClient.from('movements').insert({
            date: getCurrentDate(),
            type: 'TRANSFERENCIA',
            item_id: fromItem.id,
            item_name: fromItem.nome,
            quantity: op.quantity,
            warehouse_id: op.fromWarehouse,
            destination_warehouse_id: op.toWarehouse,
            user_name: state.user.nome,
            observations: op.observations || `Transferência de ${op.quantity} unid${op.size ? ' tam ' + op.size : ''} para ${state.warehouses.find(w => w.id === op.toWarehouse)?.nome}`,
            size: op.size || null
        });
        if (err4) throw err4;

        showToast('Transferência realizada com sucesso!', 'success');
        cache.items = null;
        cache.movements = null;
        await loadItems();
        cancelTransfer();

    } catch (err) {
        console.error(err);
        showToast('Erro ao transferir item', 'error');
        state.loadingMessage = null;
        render();
    }
}

async function transferDarBaixa() {
    const op = state.transferOperation;
    if (!op.active || !op.selectedItem || op.quantity < 1) return;

    const fromItem = state.items.find(i => i.id === op.selectedItem);

    let fromTamanhos = { ...(fromItem.tamanhos || {}) };
    let fromQtd = fromItem.quantidade;

    if (op.size) {
        if (!fromTamanhos[op.size] || fromTamanhos[op.size] < op.quantity) {
            showToast('Quantidade indisponível neste tamanho', 'error');
            return;
        }
        fromTamanhos[op.size] -= op.quantity;
    } else {
        if (fromQtd < op.quantity) {
            showToast('Quantidade indisponível', 'error');
            return;
        }
    }

    fromQtd -= op.quantity;

    state.loadingMessage = 'Dando baixa...';
    render();

    try {
        const { error: err1 } = await sbClient
            .from('items')
            .update({ quantidade: fromQtd, tamanhos: fromTamanhos })
            .eq('id', fromItem.id);
        if (err1) throw err1;

        const { error: err4 } = await sbClient.from('movements').insert({
            date: getCurrentDate(),
            type: 'SAIDA',
            item_id: fromItem.id,
            item_name: fromItem.nome,
            quantity: op.quantity,
            warehouse_id: op.fromWarehouse,
            user_name: state.user.nome,
            observations: op.observations || `Baixa de ${op.quantity} unid${op.size ? ' tam ' + op.size : ''} via menu Transferência`,
            size: op.size || null
        });
        if (err4) throw err4;

        showToast('Baixa realizada com sucesso!', 'success');
        cache.items = null;
        cache.movements = null;
        await loadItems();
        cancelTransfer();

    } catch (err) {
        console.error(err);
        showToast('Erro ao dar baixa', 'error');
        state.loadingMessage = null;
        render();
    }
}

async function handleSaveWarehouse(e, id) {
    e.preventDefault();
    const nome = document.getElementById(`wh-nome-${id}`).value.trim();
    const descricao = document.getElementById(`wh-desc-${id}`).value.trim();
    const wh = state.warehouses.find(w => w.id === id);
    if (wh) { wh.nome = nome; wh.descricao = descricao; }
    render();
    await saveWarehouse({ id, nome, descricao });
}

async function applyFilters() {
    state.isLoading = true;
    state.loadingMessage = 'Buscando movimentações...';
    render();

    await loadMovements(true);

    state.isLoading = false;
    state.loadingMessage = '';
    render();
}

async function navigateToHistory() {
    navigateTo('history');
    state.isLoading = true;
    state.loadingMessage = 'Carregando histórico...';
    render();

    await loadMovements(true);

    state.isLoading = false;
    state.loadingMessage = '';
    render();
}

async function navigateToDashboardAnalytics() {
    navigateTo('analytics');
    state.isLoading = true;
    state.loadingMessage = 'Carregando analytics...';
    render();

    await loadStatistics();
    await loadMovements(true);

    state.isLoading = false;
    state.loadingMessage = '';
    render();

    // Renderiza gráficos após um pequeno delay para garantir que o DOM está pronto
    setTimeout(() => renderCharts(), 100);
}

// ---- Gera ID de sessão: YYYYMMDD (1 por dia) ----
function generateSessionId(date) {
    const d = date || getCurrentDate();
    return d.replace(/-/g, '');
}

function isSessionId(t) { return t && /^\d{8}$/.test(t); }

// ---- Salva sessão no Supabase e carrega contagem vinculada ----

function navigateToContagem() {
    state.contagem.entries1 = {};
    state.contagem.entries2 = {};
    state.contagem.entries3 = {};
    state.contagem.savedResult = null;
    state.contagem.baixaAplicada = false;
    state.contagem.todayCounts = {};
    state.contagem.turno = null;
    state.contagem.horario = '';
    state.contagem.newStep = 1;
    state.contagem.contagemStep = 1;
    state.contagem.currentSession = null;
    state.contagem.tab = 'chamados';
    navigateTo('contagem');
    loadContagemHistory();
}

async function startContagemSession() {
    const sess = state.contagem.currentSession || {};
    const sessionId = sess.id || generateSessionId(state.contagem.date);

    if (!sess.turno_noite) {
        showToast('Selecione o Turno da Noite', 'error'); return;
    }
    if (!sess.turno_dia) {
        showToast('Selecione o Turno do Dia / ADM', 'error'); return;
    }

    const sessionPayload = {
        id: sessionId,
        date: state.contagem.date,
        turno_noite: sess.turno_noite,
        turno_dia: sess.turno_dia,
        c1_horario: '19:00',
        c2_horario: '07:00',
        c3_horario: '07:00',
        observacao: (sess.isFDS && sess.turnosWeekend?.length)
            ? JSON.stringify({ fds: true, turnos: sess.turnosWeekend })
            : null,
    };

    const saved = await createCountSession(sessionPayload);
    if (!saved) return;

    state.contagem.currentSession = saved;
    state.contagem.turno = sessionId;
    state.contagem.horario = '19:00';
    state.contagem.newStep = 3;
    state.contagem.contagemStep = 1;
    state.contagem.loading = true;
    render();
    loadContagem();
}

function openTicketForC2(date, turno, horario) {
    state.contagem.date = date;
    state.contagem.turno = turno || null;
    state.contagem.horario = horario || '';
    state.contagem.entries2 = {};
    state.contagem.entries3 = {};
    state.contagem.savedResult = null;
    state.contagem.baixaAplicada = false;
    state.contagem.newStep = 3;
    state.contagem.contagemStep = 2;
    state.contagem.tab = 'newContagem';
    state.contagem.loading = true;
    render();
    loadContagem();
}

function viewSessionReport(date, turno, horario) {
    openTicketForBaixa(date, turno, horario);
}

function openTicketForBaixa(date, turno, horario) {
    state.contagem.date = date;
    state.contagem.turno = turno || null;
    state.contagem.horario = horario || '';
    state.contagem.baixaAplicada = false;
    state.contagem.tab = 'newContagem';
    state.contagem.newStep = 3;
    state.contagem.loading = true;
    render();
    loadContagemAndBuildResult(date, turno);
}

async function loadContagemAndBuildResult(date, turno) {
    const targetWh = getContagemWarehouseId();
    const alm2Items = state.items.filter(i => (i.warehouse_id || 'alm-1') === targetWh);
    const itemIds = alm2Items.map(i => i.id);
    if (itemIds.length === 0) { state.contagem.loading = false; render(); return; }
    try {
        // Carrega sessão se ainda não estiver no state
        if (turno && isSessionId(turno) && (!state.contagem.currentSession || state.contagem.currentSession.id !== turno)) {
            const { data: sessData } = await sbClient.from('count_sessions').select('*').eq('id', turno).maybeSingle();
            if (sessData) state.contagem.currentSession = sessData;
        }

        let q = sbClient.from('daily_counts').select('*').in('item_id', itemIds).eq('date', date);
        if (turno) {
            q = q.eq('turno', turno);
        } else {
            q = q.is('turno', null);
        }
        const { data } = await q;
        const c1Map = {}, c2Map = {}, c3Map = {};
        (data || []).forEach(r => {
            const k = r.size ? `${r.item_id}::${r.size}` : r.item_id;
            if (r.contagem_num === 1) c1Map[k] = r;
            if (r.contagem_num === 2) c2Map[k] = r;
            if (r.contagem_num === 3) c3Map[k] = r;
        });

        const allKeys = new Set([...Object.keys(c1Map), ...Object.keys(c2Map), ...Object.keys(c3Map)]);
        const result = Array.from(allKeys).map(compoundKey => {
            const c1 = c1Map[compoundKey];
            const c2 = c2Map[compoundKey];
            const c3 = c3Map[compoundKey];
            const baseRow = c1 || c2 || c3;
            const variationKey = baseRow.size || null;
            const itemName = variationKey
                ? `${baseRow.item_name} — ${formatVariationLabel(variationKey)}`
                : baseRow.item_name;
            return {
                item_id: baseRow.item_id,
                item_name: itemName,
                variation_key: variationKey,
                saida:     (c1 != null && c2 != null) ? c1.quantidade - c2.quantidade : null,
                saida_adm: (c2 != null && c3 != null) ? c2.quantidade - c3.quantidade : null,
                c1_qtd: c1?.quantidade ?? null,
                c1_date: c1?.date ?? null,
                c2_qtd: c2?.quantidade ?? null,
                c3_qtd: c3?.quantidade ?? null
            };
        });
        state.contagem.savedResult = result.length > 0 ? result : null;
        state.contagem.lastC1 = c1Map;
        state.contagem.lastC2 = c2Map;
    } catch (e) { console.error('Erro loadContagemAndBuildResult:', e); }
    state.contagem.loading = false;
    render();
}

async function loadContagem() {
    const targetWh = getContagemWarehouseId();
    const alm2Items = state.items.filter(i => (i.warehouse_id || 'alm-1') === targetWh);
    if (alm2Items.length === 0) {
        state.contagem.loading = false;
        render();
        return;
    }
    try {
        const itemIds = alm2Items.map(i => i.id);

        // C1 mais recente por item (qualquer data) — referência para cálculo de saída
        const { data: allC1 } = await sbClient
            .from('daily_counts')
            .select('*')
            .in('item_id', itemIds)
            .eq('contagem_num', 1)
            .order('date', { ascending: false })
            .order('created_at', { ascending: false });
        const lastC1 = {};
        if (allC1) allC1.forEach(row => {
            const k = row.size ? `${row.item_id}::${row.size}` : row.item_id;
            if (!lastC1[k]) lastC1[k] = row;
        });
        state.contagem.lastC1 = lastC1;

        // C2 mais recente por item (qualquer data) — referência para cálculo ADM
        const { data: allC2 } = await sbClient
            .from('daily_counts')
            .select('*')
            .in('item_id', itemIds)
            .eq('contagem_num', 2)
            .order('date', { ascending: false })
            .order('created_at', { ascending: false });
        const lastC2 = {};
        if (allC2) allC2.forEach(row => {
            const k = row.size ? `${row.item_id}::${row.size}` : row.item_id;
            if (!lastC2[k]) lastC2[k] = row;
        });
        state.contagem.lastC2 = lastC2;

        // Contagens já salvas para a data/turno selecionados (prefill)
        let todayQuery = sbClient
            .from('daily_counts')
            .select('*')
            .in('item_id', itemIds)
            .eq('date', state.contagem.date);
        if (state.contagem.turno) {
            todayQuery = todayQuery.eq('turno', state.contagem.turno);
        } else {
            todayQuery = todayQuery.is('turno', null);
        }
        const { data: todayData } = await todayQuery
            .order('created_at', { ascending: true });
        const todayCounts = {};
        if (todayData) {
            todayData.forEach(row => {
                const k = row.size ? `${row.item_id}::${row.size}` : row.item_id;
                if (!todayCounts[k]) todayCounts[k] = {};
                if (row.contagem_num === 1) todayCounts[k].c1 = row;
                if (row.contagem_num === 2) todayCounts[k].c2 = row;
                if (row.contagem_num === 3) todayCounts[k].c3 = row;
            });
        }
        state.contagem.todayCounts = todayCounts;

        const entries1 = {}, entries2 = {}, entries3 = {};
        Object.entries(todayCounts).forEach(([compoundKey, counts]) => {
            if (counts.c1) entries1[compoundKey] = String(counts.c1.quantidade);
            if (counts.c2) entries2[compoundKey] = String(counts.c2.quantidade);
            if (counts.c3) entries3[compoundKey] = String(counts.c3.quantidade);
        });
        if (isVinculoAlmoxEnabled()) {
            alm2Items.forEach(item => {
                if (hasCondicoes(item) || hasTamanhos(item)) {
                    Object.keys(item.tamanhos).forEach(varKey => {
                        const ek = `${item.id}::${varKey}`;
                        if (entries1[ek] === undefined) entries1[ek] = String(item.tamanhos[varKey] ?? 0);
                    });
                } else {
                    if (entries1[item.id] === undefined && item.quantidade != null) {
                        entries1[item.id] = String(item.quantidade);
                    }
                }
            });
        }
        state.contagem.entries1 = entries1;
        state.contagem.entries2 = entries2;
        state.contagem.entries3 = entries3;

    } catch (e) {
        console.error('Erro ao carregar contagens:', e);
    }
    state.contagem.loading = false;
    render();
}

async function saveContagem(num) {
    const entries = num === 1 ? state.contagem.entries1
        : num === 2 ? state.contagem.entries2
            : state.contagem.entries3;
    const validEntries = Object.entries(entries)
        .filter(([, qty]) => qty !== '' && qty !== null && qty !== undefined);
    if (validEntries.length === 0) {
        showToast('Preencha ao menos um item', 'error');
        return;
    }
    state.contagem.saving = true;
    render();
    const rows = validEntries.map(([compoundKey, qty]) => {
        const hasSep = compoundKey.includes('::');
        const itemId = hasSep ? compoundKey.slice(0, compoundKey.indexOf('::')) : compoundKey;
        const varKey = hasSep ? compoundKey.slice(compoundKey.indexOf('::') + 2) : null;
        const item   = state.items.find(i => i.id === itemId);
        return {
            date:         state.contagem.date,
            item_id:      itemId,
            item_name:    item?.nome || itemId,
            size:         varKey || null,
            quantidade:   Math.max(0, parseInt(qty) || 0),
            user_name:    state.user.nome,
            contagem_num: num,
            turno:        state.contagem.turno  || null,
            horario:      state.contagem.horario || null
        };
    });
    try {
        // Remove registros anteriores do mesmo dia e mesmo num para esses itens
        const uniqueItemIds = [...new Set(rows.map(r => r.item_id))];
        let delQuery = sbClient.from('daily_counts')
            .delete()
            .eq('date', state.contagem.date)
            .eq('contagem_num', num)
            .in('item_id', uniqueItemIds);
        if (state.contagem.turno) {
            delQuery = delQuery.eq('turno', state.contagem.turno);
        } else {
            delQuery = delQuery.is('turno', null);
        }
        await delQuery;

        const { error } = await sbClient.from('daily_counts').insert(rows);
        if (error) throw error;

        // Atualiza estado local
        rows.forEach(row => {
            const ek = row.size ? `${row.item_id}::${row.size}` : row.item_id;
            if (!state.contagem.todayCounts[ek]) state.contagem.todayCounts[ek] = {};
            const key = num === 1 ? 'c1' : num === 2 ? 'c2' : 'c3';
            state.contagem.todayCounts[ek][key] = row;
        });

        if (num === 3) {
            // Saída ADM = C2 (início do turno) - C3 (pós-distribuição)
            const result = rows.map(row => {
                const ek = row.size ? `${row.item_id}::${row.size}` : row.item_id;
                const c2 = state.contagem.todayCounts[ek]?.c2
                    ?? state.contagem.lastC2[ek];
                const c1 = state.contagem.lastC1[ek];
                const saidaADM   = c2 != null ? c2.quantidade - row.quantidade : null;
                const saidaTurno = c1 != null && c2 != null ? c1.quantidade - c2.quantidade : null;
                const itemName   = row.size
                    ? `${row.item_name} — ${formatVariationLabel(row.size)}`
                    : row.item_name;
                return {
                    item_id:       row.item_id,
                    item_name:     itemName,
                    variation_key: row.size || null,
                    c1_qtd:        c1?.quantidade ?? null,
                    c1_date:       c1?.date       ?? null,
                    c2_qtd:        c2?.quantidade ?? null,
                    c3_qtd:        row.quantidade,
                    saida:         saidaTurno,      // usado pela aplicarBaixaContagem (consumo do turno)
                    saida_adm:     saidaADM,        // distribuição ao ADM
                };
            });
            state.contagem.savedResult = result;
            state.contagem.baixaAplicada = false;
            state.contagem.editingNum = null;
            state.contagem.history = [];
            showToast('Contagem pós-ADM salva!', 'success');
        } else if (num === 2) {
            // C2 salvo — avança para etapa C3
            rows.forEach(row => {
                const ek = row.size ? `${row.item_id}::${row.size}` : row.item_id;
                state.contagem.lastC2[ek] = { item_id: row.item_id, date: row.date, quantidade: row.quantidade, size: row.size };
            });
            state.contagem.contagemStep = 3;
            showToast('Conferência de chegada salva! Agora faça a contagem pós-ADM.', 'success');
        } else {
            // C1 salvo — atualiza lastC1 e avança para C2
            rows.forEach(row => {
                const ek = row.size ? `${row.item_id}::${row.size}` : row.item_id;
                state.contagem.lastC1[ek] = { item_id: row.item_id, date: row.date, quantidade: row.quantidade, size: row.size };
            });
            state.contagem.contagemStep = 2;
            showToast('Contagem de Entrega salva! Prossiga com a Conferência de Chegada.', 'success');
        }
    } catch (e) {
        showToast('Erro ao salvar contagem', 'error');
        console.error(e);
    }
    state.contagem.saving = false;
    render();
}

async function aplicarBaixaContagem() {
    const result = state.contagem.savedResult;
    if (!result) return;

    const sessionId = state.contagem.turno;
    const date = state.contagem.date;
    const dateLabel = formatDate(date);
    const turnoLabel = sessionId ? ` — Turno ${sessionId}` : '';
    const targetWh = getContagemWarehouseId();
    const targetWhNome = state.warehouses.find(w => w.id === targetWh)?.nome || targetWh;

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

    if (!confirm(`Deseja dar baixa em ${targetWhNome}?${listaNoite}${listaAdm}\n\nEssa ação atualizará o estoque e registrará os movimentos.`)) return;

    state.contagem.saving = true;
    render();
    try {
        for (const r of itensNoite) {
            const item = state.items.find(i => i.id === r.item_id);
            if (!item) continue;
            let updPayload;
            if (r.variation_key && item.tamanhos) {
                const novosTam = { ...item.tamanhos };
                novosTam[r.variation_key] = Math.max(0, (novosTam[r.variation_key] || 0) - r.saida);
                const novaQtd = Object.values(novosTam).reduce((a, b) => a + b, 0);
                updPayload = { tamanhos: novosTam, quantidade: novaQtd };
                item.tamanhos = novosTam;
                item.quantidade = novaQtd;
            } else {
                const novaQtd = Math.max(0, item.quantidade - r.saida);
                updPayload = { quantidade: novaQtd };
                item.quantidade = novaQtd;
            }
            const { error: updErr } = await sbClient.from('items').update(updPayload).eq('id', r.item_id);
            if (updErr) throw updErr;
            await sbClient.from('movements').insert({
                date, type: 'SAIDA',
                item_id: r.item_id, item_name: r.item_name,
                quantity: r.saida,
                size: r.variation_key || null,
                warehouse_id: targetWh,
                user_name: state.user.nome,
                observations: `Baixa Contagem Diária ${dateLabel}${turnoLabel} — Noite — ${targetWhNome}`
            });
        }
        for (const r of itensAdm) {
            const item = state.items.find(i => i.id === r.item_id);
            if (!item) continue;
            let updPayload;
            if (r.variation_key && item.tamanhos) {
                const novosTam = { ...item.tamanhos };
                novosTam[r.variation_key] = Math.max(0, (novosTam[r.variation_key] || 0) - r.saida_adm);
                const novaQtd = Object.values(novosTam).reduce((a, b) => a + b, 0);
                updPayload = { tamanhos: novosTam, quantidade: novaQtd };
                item.tamanhos = novosTam;
                item.quantidade = novaQtd;
            } else {
                const novaQtd = Math.max(0, item.quantidade - r.saida_adm);
                updPayload = { quantidade: novaQtd };
                item.quantidade = novaQtd;
            }
            const { error: updErr } = await sbClient.from('items').update(updPayload).eq('id', r.item_id);
            if (updErr) throw updErr;
            await sbClient.from('movements').insert({
                date, type: 'DISTRIBUICAO',
                item_id: r.item_id, item_name: r.item_name,
                quantity: r.saida_adm,
                size: r.variation_key || null,
                warehouse_id: targetWh,
                user_name: state.user.nome,
                observations: `Baixa Contagem Diária ${dateLabel}${turnoLabel} — ADM — ${targetWhNome}`
            });
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

async function desfazerBaixaContagem(date, turno) {
    if (!confirm(`Desfazer a baixa de ${formatDate(date)}?\n\nO estoque do Almoxarifado 2 será restaurado e os movimentos removidos. Esta ação não pode ser desfeita.`)) return;

    try {
        const { data: movs, error: selErr } = await sbClient.from('movements')
            .select('*')
            .ilike('observations', 'Baixa Contagem Diária%')
            .eq('date', date);
        if (selErr) throw selErr;

        const turnoFilter = turno || '';
        const filtered = (movs || []).filter(m => {
            if (!turnoFilter) return !m.observations?.includes('Turno');
            return m.observations?.includes(`Turno ${turnoFilter}`);
        });

        if (filtered.length === 0) {
            showToast('Movimentos não encontrados. Baixa pode ter sido removida manualmente.', 'error');
            return;
        }

        for (const m of filtered) {
            const item = state.items.find(i => i.id === m.item_id);
            if (!item) continue;
            let updPayload;
            if (m.size && item.tamanhos) {
                const novosTam = { ...item.tamanhos };
                novosTam[m.size] = (novosTam[m.size] || 0) + m.quantity;
                const novaQtd = Object.values(novosTam).reduce((a, b) => a + b, 0);
                updPayload = { tamanhos: novosTam, quantidade: novaQtd };
                item.tamanhos = novosTam;
                item.quantidade = novaQtd;
            } else {
                const novaQtd = item.quantidade + m.quantity;
                updPayload = { quantidade: novaQtd };
                item.quantidade = novaQtd;
            }
            const { error: updErr } = await sbClient.from('items').update(updPayload).eq('id', m.item_id);
            if (updErr) throw updErr;
        }

        const ids = filtered.map(m => m.id);
        const { error: delErr } = await sbClient.from('movements').delete().in('id', ids);
        if (delErr) throw delErr;

        const baixaKey = turno ? `${date}_${turno}` : date;
        delete state.contagem.baixaDates[baixaKey];
        if (state.contagem.date === date && state.contagem.turno === (turno || null)) {
            state.contagem.baixaAplicada = false;
        }

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

function openBaixaModal(itemId) {
    const item = state.items.find(i => i.id === itemId);
    if (!item) return;
    state.baixaModal = {
        open: true,
        item: item,
        size: '',
        quantidade: 1,
        motivo: '',
        saving: false
    };
    render();
}

async function confirmDarBaixa() {
    const m = state.baixaModal;
    const item = m.item;
    if (!item) return;

    const hasSizes = item.tamanhos && Object.keys(item.tamanhos).length > 0;
    if (hasSizes && !m.size) {
        showToast('Selecione a variação primeiro', 'error');
        return;
    }

    const qty = Math.max(1, parseInt(m.quantidade) || 1);
    const maxQty = hasSizes ? (item.tamanhos[m.size] || 0) : item.quantidade;
    if (qty > maxQty) {
        showToast(`Quantidade maior que o estoque disponível (${maxQty})`, 'error');
        return;
    }

    state.baixaModal.saving = true;
    render();

    try {
        let updPayload = {};
        if (hasSizes) {
            // Atualiza apenas o tamanho selecionado dentro do jsonb
            const novosTamanhos = { ...item.tamanhos };
            novosTamanhos[m.size] = Math.max(0, (novosTamanhos[m.size] || 0) - qty);
            // Recalcula quantidade total somando todos os tamanhos
            const novaQtdTotal = Object.values(novosTamanhos).reduce((a, b) => a + b, 0);
            updPayload = { quantidade: novaQtdTotal, tamanhos: novosTamanhos };
        } else {
            updPayload = { quantidade: Math.max(0, item.quantidade - qty) };
        }

        const { error: updErr } = await sbClient
            .from('items')
            .update(updPayload)
            .eq('id', item.id);
        if (updErr) throw updErr;

        const warehouseNome = state.warehouses.find(w => w.id === (item.warehouse_id || 'alm-1'))?.nome || (item.warehouse_id || 'alm-1');
        const tamLabel = hasSizes ? ` [${m.size}]` : '';
        const obs = m.motivo
            ? `Baixa Direta${tamLabel} — ${m.motivo}`
            : `Baixa Direta${tamLabel} — via painel de estoque (${warehouseNome})`;

        await sbClient.from('movements').insert({
            date: new Date().toISOString().slice(0, 10),
            type: 'SAIDA',
            item_id: item.id,
            item_name: item.nome,
            quantity: qty,
            warehouse_id: item.warehouse_id || 'alm-1',
            user_name: state.user.nome,
            observations: obs
        });

        // Atualiza estado local
        if (hasSizes) {
            item.tamanhos[m.size] = Math.max(0, (item.tamanhos[m.size] || 0) - qty);
            item.quantidade = Object.values(item.tamanhos).reduce((a, b) => a + b, 0);
        } else {
            item.quantidade = Math.max(0, item.quantidade - qty);
        }
        cache.items = null;
        cache.movements = null;

        showToast(`Baixa de ${qty} ${item.unidade} de "${item.nome}" registrada!`, 'success');
        state.baixaModal.open = false;
    } catch (e) {
        showToast('Erro ao dar baixa: ' + (e.message || e), 'error');
        console.error(e);
    }
    state.baixaModal.saving = false;
    render();
}

async function deleteContagemDate(date, num, turno) {
    const isAll = num === 0;
    const tipo = isAll ? 'Sessão completa' : num === 2 ? 'Contagem C2' : num === 3 ? 'Contagem C3' : 'Contagem C1';
    const turnoLabel = turno ? ` do dia ${formatDate(date)}` : ` de ${formatDate(date)}`;
    if (!confirm(`Excluir ${tipo}${turnoLabel}?\n\nEsta ação não pode ser desfeita.`)) return;
    try {
        if (isAll) {
            // Apaga todos os registros de daily_counts para essa sessão
            let q = sbClient.from('daily_counts').delete().eq('date', date);
            if (turno) q = q.eq('turno', turno); else q = q.is('turno', null);
            const { error: e1 } = await q;
            if (e1) throw e1;
            // Apaga a sessão de count_sessions se existir
            if (turno) {
                await sbClient.from('count_sessions').delete().eq('id', turno);
            }
            state.contagem.history = state.contagem.history.filter(
                r => !(r.date === date && (r.turno || null) === (turno || null))
            );
            state.contagem.openTickets = state.contagem.openTickets.filter(
                t => !(t.date === date && (t.turno || null) === (turno || null))
            );
        } else {
            let q = sbClient.from('daily_counts').delete()
                .eq('date', date)
                .eq('contagem_num', num);
            if (turno) q = q.eq('turno', turno); else q = q.is('turno', null);
            const { error } = await q;
            if (error) throw error;
            state.contagem.history = state.contagem.history.filter(
                r => !(r.date === date && r.contagem_num === num && (r.turno || null) === (turno || null))
            );
            if (num === 1) {
                state.contagem.openTickets = state.contagem.openTickets.filter(
                    t => !(t.date === date && (t.turno || null) === (turno || null))
                );
            }
        }
        showToast(`${tipo} excluída!`, 'success');
        render();
    } catch (e) {
        showToast('Erro ao excluir', 'error');
        console.error(e);
    }
}

function showDateChangeModal(oldDate, turno) {
    var container = document.getElementById('date-modal');
    if (!container) return;
    var dd = oldDate ? oldDate.slice(8, 10) + '/' + oldDate.slice(5, 7) + '/' + oldDate.slice(0, 4) : '';
    container.innerHTML =
        '<div onclick="hideDateChangeModal()" style="position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:900;display:flex;align-items:center;justify-content:center;padding:16px;">' +
        '<div onclick="event.stopPropagation()" style="background:var(--bg-1);border-radius:16px;padding:24px;width:340px;max-width:100%;box-shadow:0 8px 48px rgba(0,0,0,.22);">' +
        '<div style="font-weight:700;font-size:16px;margin-bottom:4px;color:var(--text-1);">' +
        '<i class="ph ph-calendar" style="color:var(--accent);margin-right:6px;"></i>Alterar Data da Contagem</div>' +
        '<p style="font-size:12px;color:var(--text-3);margin:0 0 18px;">Data atual: <strong style="color:var(--text-1);">' + dd + '</strong></p>' +
        '<label style="font-size:12px;font-weight:600;color:var(--text-2);display:block;margin-bottom:6px;">Nova data</label>' +
        '<input id="date-change-input" type="date" value="' + (oldDate || '') + '" ' +
        'style="width:100%;box-sizing:border-box;padding:10px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;background:var(--bg-2);color:var(--text-1);margin-bottom:18px;">' +
        '<p style="font-size:11px;color:var(--orange);margin:0 0 14px;"><i class="ph ph-warning"></i> Todos os registros de C1, C2 e C3 da sessão serão movidos para a nova data.</p>' +
        '<div style="display:flex;gap:8px;">' +
        '<button onclick="hideDateChangeModal()" class="btn-secondary" style="flex:1;">Cancelar</button>' +
        '<button onclick="confirmarTrocaData(\'' + (oldDate || '') + '\',\'' + (turno || '') + '\')" class="btn-primary" style="flex:1;">Confirmar</button>' +
        '</div></div></div>';
}

function hideDateChangeModal() {
    var c = document.getElementById('date-modal');
    if (c) c.innerHTML = '';
}

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

async function confirmarTrocaData(oldDate, turno) {
    var input = document.getElementById('date-change-input');
    if (!input) return;
    var newDate = input.value;
    if (!newDate) { showToast('Selecione uma nova data.', 'error'); return; }
    if (newDate === oldDate) { hideDateChangeModal(); return; }
    var isSess = turno && isSessionId(turno);
    var newSessionId = isSess ? newDate.replace(/-/g, '') : turno;
    hideDateChangeModal();
    try {
        if (isSess) {
            // Verifica conflito
            var { data: existing } = await sbClient.from('count_sessions').select('id').eq('id', newSessionId).maybeSingle();
            if (existing) {
                showToast('Já existe uma sessão para essa data. Escolha outra.', 'error');
                return;
            }
            // Copia sessão com novo ID
            var { data: oldSess } = await sbClient.from('count_sessions').select('*').eq('id', turno).maybeSingle();
            if (oldSess) {
                var newSess = Object.assign({}, oldSess, { id: newSessionId });
                var { error: insErr } = await sbClient.from('count_sessions').insert(newSess);
                if (insErr) throw insErr;
            }
        }
        // Atualiza daily_counts
        var updateData = { date: newDate };
        if (isSess) updateData.turno = newSessionId;
        var q = sbClient.from('daily_counts').update(updateData).eq('date', oldDate);
        if (turno) q = q.eq('turno', turno); else q = q.is('turno', null);
        var { error: upErr } = await q;
        if (upErr) throw upErr;
        // Remove sessão antiga
        if (isSess) {
            await sbClient.from('count_sessions').delete().eq('id', turno);
        }
        showToast('Data alterada com sucesso!', 'success');
        state.contagem.history = [];
        state.contagem.openTickets = [];
        loadContagemHistory();
    } catch (e) {
        console.error('Erro ao trocar data:', e);
        showToast('Erro ao alterar data: ' + (e.message || ''), 'error');
    }
}

function editContagemDate(date, num, turno, horario) {
    // 'num' = 1, 2 ou 3 — abre a etapa correspondente para correção
    state.contagem.editingNum = num;
    state.contagem.date = date;
    state.contagem.turno = turno || null;
    state.contagem.horario = horario || '';
    state.contagem.entries1 = {};
    state.contagem.entries2 = {};
    state.contagem.entries3 = {};
    state.contagem.lastC2 = {};
    state.contagem.savedResult = null;
    state.contagem.baixaAplicada = false;
    state.contagem.todayCounts = {};
    state.contagem.contagemStep = num;   // abre diretamente na etapa correta
    state.contagem.newStep = 3;
    state.contagem.tab = 'newContagem';
    state.contagem.loading = true;
    render();
    loadContagem();
}

async function loadContagemHistory() {
    state.contagem.historyLoading = true;
    render();
    try {
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

        if (!countsRes.error && countsRes.data) {
            state.contagem.history = countsRes.data;
        }

        // Popula baixaDates com chave 'YYYY-MM-DD' (legado) ou 'YYYY-MM-DD_A' (novo)
        const baixaDates = {};
        if (!baixaRes.error && baixaRes.data) {
            baixaRes.data.forEach(m => {
                const sessMatch = m.observations?.match(/Turno ((?:CTG-)?\d+(?:-\d+)?)\b/);
                const turnoMatch = m.observations?.match(/Turno ([ABCD])\b/);
                const t = sessMatch ? sessMatch[1] : (turnoMatch ? turnoMatch[1] : null);

                const key = t ? `${m.date}_${t}` : m.date;
                baixaDates[key] = true;
            });
        }
        state.contagem.baixaDates = baixaDates;

        const sessionMap = {};
        if (!sessRes.error && sessRes.data) {
            sessRes.data.forEach(s => {
                try { sessionMap[s.id] = JSON.parse(s.observacao || '{}'); }
                catch { sessionMap[s.id] = {}; }
            });
        }
        state.contagem.sessionMap = sessionMap;

        // Sincroniza flag da sessão atual
        if (state.contagem.turno) {
            const key = `${state.contagem.date}_${state.contagem.turno}`;
            if (baixaDates[key]) state.contagem.baixaAplicada = true;
        } else if (baixaDates[state.contagem.date]) {
            state.contagem.baixaAplicada = true;
        }

        // Computa openTickets: grupos (date, turno) com pelo menos C1 mas sem baixa
        const groups = {};
        (countsRes.data || []).forEach(row => {
            const key = `${row.date}_${row.turno || 'null'}`;
            if (!groups[key]) {
                groups[key] = { date: row.date, turno: row.turno || null, horario: row.horario || '', hasC1: false, hasC2: false, hasC3: false };
            }
            if (row.contagem_num === 1) groups[key].hasC1 = true;
            if (row.contagem_num === 2) groups[key].hasC2 = true;
            if (row.contagem_num === 3) groups[key].hasC3 = true;
        });
        state.contagem.openTickets = Object.values(groups)
            .filter(g => {
                if (!g.hasC1) return false;
                const baixaKey = g.turno ? `${g.date}_${g.turno}` : g.date;
                return !baixaDates[baixaKey];
            })
            .sort((a, b) => b.date.localeCompare(a.date));

    } catch (e) {
        console.error('Erro ao carregar histórico de contagens:', e);
    }
    state.contagem.historyLoading = false;
    render();
}

function switchContagemTab(tab) {
    state.contagem.tab = tab;
    const needsLoad = (tab === 'history' && state.contagem.history.length === 0)
        || (tab === 'chamados' && state.contagem.openTickets.length === 0 && !state.contagem.historyLoading);
    if (needsLoad) {
        loadContagemHistory();
    } else {
        render();
    }
}

function changePage(delta) {
    const totalPages = Math.ceil(getFilteredMovements().length / state.itemsPerPage);
    const newPage = state.currentPage + delta;

    if (newPage >= 1 && newPage <= totalPages) {
        state.currentPage = newPage;
        render();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

function getFilteredMovements() {
    let filtered = state.movements;

    if (state.filters.searchTerm) {
        const term = state.filters.searchTerm.toLowerCase();
        filtered = filtered.filter(m =>
            m.item_name?.toLowerCase().includes(term) ||
            m.employee?.toLowerCase().includes(term) ||
            m.supplier?.toLowerCase().includes(term) ||
            m.user?.toLowerCase().includes(term)
        );
    }

    return filtered;
}

function getPaginatedMovements() {
    const filtered = getFilteredMovements();
    const start = (state.currentPage - 1) * state.itemsPerPage;
    const end = start + state.itemsPerPage;
    return filtered.slice(start, end);
}

function getFilteredItems() {
    // Aba emergencial não usa a grade de itens padrão
    if (state.activeWarehouse === 'alm-emergencial') return [];

    let filtered = state.items;

    // Filtro por almoxarifado
    filtered = filtered.filter(i => {
        const wid = i.warehouse_id || 'alm-1';
        return wid === state.activeWarehouse;
    });

    // Filtro por categoria
    if (state.filters.category !== 'TODAS') {
        filtered = filtered.filter(i => i.categoria === state.filters.category);
    }

    // Filtro por quantidade mínima
    if (state.filters.minQuantity !== '') {
        filtered = filtered.filter(i => i.quantidade >= parseInt(state.filters.minQuantity));
    }

    // Filtro por quantidade máxima
    if (state.filters.maxQuantity !== '') {
        filtered = filtered.filter(i => i.quantidade <= parseInt(state.filters.maxQuantity));
    }

    // Filtro por estoque baixo
    if (state.filters.lowStockOnly) {
        filtered = filtered.filter(i => i.quantidade < 10);
    }

    // Filtro por busca de texto
    if (state.filters.searchTerm) {
        const term = state.filters.searchTerm.toLowerCase();
        filtered = filtered.filter(i =>
            i.nome?.toLowerCase().includes(term) ||
            i.categoria?.toLowerCase().includes(term)
        );
    }

    return filtered;
}

const handleSearchInput = debounce((value) => {
    state.filters.searchTerm = value;
    state.currentPage = 1;
    render();
}, 300);

// ============================================
// GRÁFICOS COM CHART.JS
// ============================================
let chartsInstances = {};

function renderCharts() {
    // Destroi gráficos anteriores
    Object.values(chartsInstances).forEach(chart => chart.destroy());
    chartsInstances = {};

    // Gráfico de distribuição por categoria
    renderCategoryChart();

    // Gráfico de top itens mais repostos
    renderTopItemsChart();

    // Gráfico de movimentações por tipo
    renderMovementsTypeChart();
}

function renderCategoryChart() {
    const ctx = document.getElementById('categoryChart');
    if (!ctx) return;

    const labels = state.analytics.categoryDistribution.map(c => c.category);
    const data = state.analytics.categoryDistribution.map(c => c.quantity);

    chartsInstances.categoryChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: [
                    'rgba(16, 185, 129, 0.8)',
                    'rgba(59, 130, 246, 0.8)',
                    'rgba(139, 92, 246, 0.8)',
                    'rgba(251, 146, 60, 0.8)',
                    'rgba(239, 68, 68, 0.8)'
                ],
                borderColor: [
                    'rgb(16, 185, 129)',
                    'rgb(59, 130, 246)',
                    'rgb(139, 92, 246)',
                    'rgb(251, 146, 60)',
                    'rgb(239, 68, 68)'
                ],
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: 'rgb(203, 213, 225)',
                        font: {
                            family: 'Work Sans'
                        }
                    }
                },
                title: {
                    display: true,
                    text: 'Distribuição por Categoria',
                    color: 'rgb(203, 213, 225)',
                    font: {
                        size: 16,
                        family: 'Work Sans',
                        weight: 'bold'
                    }
                }
            }
        }
    });
}

function renderTopItemsChart() {
    const ctx = document.getElementById('topItemsChart');
    if (!ctx) return;

    const labels = state.analytics.topReplenishedItems.map(i => i.name.substring(0, 20));
    const data = state.analytics.topReplenishedItems.map(i => i.count);

    chartsInstances.topItemsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Quantidade Reposta',
                data: data,
                backgroundColor: 'rgba(59, 130, 246, 0.8)',
                borderColor: 'rgb(59, 130, 246)',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            plugins: {
                legend: {
                    display: false
                },
                title: {
                    display: true,
                    text: 'Top 5 Itens Mais Repostos',
                    color: 'rgb(203, 213, 225)',
                    font: {
                        size: 16,
                        family: 'Work Sans',
                        weight: 'bold'
                    }
                }
            },
            scales: {
                x: {
                    ticks: {
                        color: 'rgb(148, 163, 184)'
                    },
                    grid: {
                        color: 'rgba(148, 163, 184, 0.1)'
                    }
                },
                y: {
                    ticks: {
                        color: 'rgb(148, 163, 184)'
                    },
                    grid: {
                        color: 'rgba(148, 163, 184, 0.1)'
                    }
                }
            }
        }
    });
}

function renderMovementsTypeChart() {
    const ctx = document.getElementById('movementsTypeChart');
    if (!ctx || !state.statistics) return;

    const movTypes = state.statistics.movementsByType;
    const labels = Object.keys(movTypes).map(type => MOVEMENT_TYPES[type]?.label || type);
    const data = Object.values(movTypes);

    chartsInstances.movementsTypeChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: [
                    'rgba(16, 185, 129, 0.8)',
                    'rgba(59, 130, 246, 0.8)',
                    'rgba(139, 92, 246, 0.8)',
                    'rgba(239, 68, 68, 0.8)',
                    'rgba(251, 146, 60, 0.8)'
                ],
                borderColor: [
                    'rgb(16, 185, 129)',
                    'rgb(59, 130, 246)',
                    'rgb(139, 92, 246)',
                    'rgb(239, 68, 68)',
                    'rgb(251, 146, 60)'
                ],
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: 'rgb(203, 213, 225)',
                        font: {
                            family: 'Work Sans'
                        }
                    }
                },
                title: {
                    display: true,
                    text: 'Movimentações por Tipo',
                    color: 'rgb(203, 213, 225)',
                    font: {
                        size: 16,
                        family: 'Work Sans',
                        weight: 'bold'
                    }
                }
            }
        }
    });
}

// ============================================
// HELPERS GLOBAIS — acessíveis por onclick HTML
// ============================================
function setTurnoNoite(t) {
    state.contagem.currentSession = Object.assign({}, state.contagem.currentSession || {}, { turno_noite: t });
    render();
}
function setTurnoDia(t) {
    state.contagem.currentSession = Object.assign({}, state.contagem.currentSession || {}, { turno_dia: t });
    render();
}
function applyShiftPreset(tipo) {
    const patch = tipo === 'noite'
        ? { c1_horario: '19:00', c2_horario: '07:00', c3_horario: '08:00' }
        : { c1_horario: '07:00', c2_horario: '19:00', c3_horario: '20:00' };
    state.contagem.currentSession = Object.assign({}, state.contagem.currentSession || {}, patch);
    render();
}

// ---- Fim de semana: turnos intermediários ----
function toggleFDS() {
    const sess = state.contagem.currentSession || {};
    const ativando = !sess.isFDS;
    state.contagem.currentSession = Object.assign({}, sess, {
        isFDS: ativando,
        turnosWeekend: ativando ? (sess.turnosWeekend || [{ data: '', letra: '', horario: '19 A 07' }]) : []
    });
    render();
}
function addWeekendShift() {
    const sess = state.contagem.currentSession || {};
    const turnos = [...(sess.turnosWeekend || []), { data: '', letra: '', horario: '19 A 07' }];
    state.contagem.currentSession = Object.assign({}, sess, { turnosWeekend: turnos });
    render();
}
function removeWeekendShift(i) {
    const sess = state.contagem.currentSession || {};
    const turnos = (sess.turnosWeekend || []).filter((_, idx) => idx !== i);
    state.contagem.currentSession = Object.assign({}, sess, { turnosWeekend: turnos });
    render();
}
function setWeekendShift(i, field, val) {
    const sess = state.contagem.currentSession || {};
    const turnos = (sess.turnosWeekend || []).map((t, idx) => idx === i ? Object.assign({}, t, { [field]: val }) : t);
    state.contagem.currentSession = Object.assign({}, sess, { turnosWeekend: turnos });
    render();
}
function parseFDS(obs) {
    if (!obs) return null;
    try { const p = JSON.parse(obs); return p.fds ? p : null; } catch { return null; }
}

// ============================================
// RENDERIZAÇÃO
// ============================================
function render() {
    const app = document.getElementById('app');
    const wasSearchFocused = document.activeElement?.id === 'global-search';

    switch (state.view) {
        case 'checking': app.innerHTML = renderLoading(); break;
        case 'login': app.innerHTML = renderLogin(); break;
        case 'dashboard': app.innerHTML = renderDashboard(); break;
        case 'analytics': app.innerHTML = renderAnalytics(); break;
        case 'stock': app.innerHTML = renderStock(); break;
        case 'movementSelector': app.innerHTML = renderMovementSelector(); break;
        case 'movement': app.innerHTML = renderMovement(); break;
        case 'history': app.innerHTML = renderHistory(); break;
        case 'editItem': app.innerHTML = renderEditItem(); break;
        case 'warehouses': app.innerHTML = renderWarehouses(); break;
        case 'contagem': app.innerHTML = renderContagem(); break;
        case 'transfer': app.innerHTML = renderTransfer(); break;
        case 'epi_dashboard': app.innerHTML = renderEpiDashboard(); break;
    }

    // Restaura foco no campo de busca da topbar após re-render
    if (wasSearchFocused) {
        const s = document.getElementById('global-search');
        if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
    }
}

function renderLoading() {
    return `
<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg-0);">
    <div style="width:260px;text-align:center;">
        <div style="font-weight:800;font-size:16px;color:#0f3868;margin-bottom:3px;">Grupo GPS</div>
        <div style="font-size:10px;color:var(--text-3);letter-spacing:0.1em;text-transform:uppercase;font-weight:600;margin-bottom:28px;">Almoxarifado EPI</div>
        <div class="loading-bar-container">
            <div class="loading-bar"></div>
        </div>
        <div style="color:var(--text-3);font-size:12px;font-weight:500;margin-top:14px;letter-spacing:0.02em;">${state.loadingMessage || 'Verificando sessão...'}</div>
    </div>
</div>
    `;
}

function renderLogin() {
    return `
<div id="login-screen">
    <div class="login-box">
        <div class="login-header">
            <div class="login-header-title">
                <span class="login-brand-label">Central GPS · Grupo GPS</span>
                <span class="login-brand-name">Mecanizada</span>
            </div>
            <div class="login-icon">
                <i class="ph-fill ph-squares-four"></i>
            </div>
        </div>
        <div class="login-system-row">
            <div class="login-system-icon">
                <i class="ph-fill ph-package"></i>
            </div>
            <span class="login-system-name">Almoxarifado EPI</span>
        </div>
        <div class="login-form-area">
            <div class="login-form-section">
                <form onsubmit="handleLogin(event)" style="display:flex;flex-direction:column;gap:0;">
                    <div class="login-input-group" style="margin-bottom:14px;">
                        <label>E-mail</label>
                        <input type="email" id="email" placeholder="Digite seu e-mail" ${state.isLoading ? 'disabled' : ''} required>
                    </div>
                    <div class="login-input-group">
                        <label>Senha</label>
                        <input type="password" id="password" placeholder="Digite sua senha" ${state.isLoading ? 'disabled' : ''} required>
                    </div>
                    <button type="submit" class="login-btn" style="margin-top:18px;" ${state.isLoading ? 'disabled' : ''}>
                        ${state.isLoading
            ? `<i class="ph ph-spinner spin" style="margin-right:6px;"></i>${state.loadingMessage ? state.loadingMessage.toUpperCase() : 'CARREGANDO...'}`
            : '<i class="ph ph-sign-in" style="margin-right:6px;"></i>ENTRAR'}
                    </button>
                    <div class="login-error">${state.loginError || ''}</div>
                </form>
            </div>
        </div>
    </div>
    <div class="login-footer">Desenvolvido por Grupo GPS — Almoxarifado EPI v3.0</div>
</div>
    `;
}

function renderDashboard() {
    const totalItems = state.items.length;
    const totalQty = state.items.reduce((s, i) => s + i.quantidade, 0);
    const lowStock = state.items.filter(i => i.quantidade < 10).length;

    return `
<div class="page-wrap">
    ${renderHeader()}
    <div class="page-content">
        <div class="grid-3">
            <div class="card accent-green" style="display:flex;align-items:center;justify-content:space-between;">
                <div>
                    <div class="stat-label">Total de Itens</div>
                    <div class="stat-value text-green">${totalItems}</div>
                </div>
                <div class="stat-icon icon-green"><i class="ph-fill ph-package"></i></div>
            </div>
            <div class="card accent-blue" style="display:flex;align-items:center;justify-content:space-between;">
                <div>
                    <div class="stat-label">Quantidade Total</div>
                    <div class="stat-value text-blue">${totalQty}</div>
                </div>
                <div class="stat-icon icon-blue"><i class="ph-fill ph-stack"></i></div>
            </div>
            <div class="card accent-amber" style="display:flex;align-items:center;justify-content:space-between;">
                <div>
                    <div class="stat-label">Estoque Baixo</div>
                    <div class="stat-value text-amber">${lowStock}</div>
                </div>
                <div class="stat-icon icon-amber"><i class="ph-fill ph-warning"></i></div>
            </div>
        </div>

        <div class="card">
            <div class="section-title" style="margin-bottom:16px;">Ações Rápidas</div>
            <div class="grid-4">
                <button onclick="startMovement('COMPRA')" class="action-card">
                    <div class="action-icon icon-green"><i class="ph-fill ph-shopping-cart"></i></div>
                    <h3>Compra</h3><p>Registrar entrada</p>
                </button>
                <button onclick="navigateTo('stock')" class="action-card">
                    <div class="action-icon icon-blue"><i class="ph-fill ph-warehouse"></i></div>
                    <h3>Estoque</h3><p>Visualizar</p>
                </button>
                <button onclick="navigateToHistory()" class="action-card">
                    <div class="action-icon icon-purple"><i class="ph-fill ph-clock-counter-clockwise"></i></div>
                    <h3>Histórico</h3><p>Ver movimentações</p>
                </button>
                <button onclick="startTransfer(state.activeWarehouse)" class="action-card">
                    <div class="action-icon icon-cyan"><i class="ph-fill ph-arrows-left-right"></i></div>
                    <h3>Transferência</h3><p>Entre almox.</p>
                </button>
                <button onclick="navigateToDashboardAnalytics()" class="action-card">
                    <div class="action-icon icon-red" style="background:color-mix(in srgb,#e879a0 12%,transparent);color:#e879a0;"><i class="ph-fill ph-chart-line"></i></div>
                    <h3>Analytics</h3><p>Relatórios</p>
                </button>
                <button onclick="openNewItem()" class="action-card">
                    <div class="action-icon icon-amber"><i class="ph-fill ph-plus-circle"></i></div>
                    <h3>Novo Item</h3><p>Cadastrar</p>
                </button>
                <button onclick="navigateToWarehouses()" class="action-card">
                    <div class="action-icon icon-gray"><i class="ph-fill ph-gear"></i></div>
                    <h3>Almoxarifados</h3><p>Configurar</p>
                </button>
            </div>
        </div>

        <div class="card">
            <div class="section-title" style="margin-bottom:16px;">Itens Recentes</div>
            ${state.items.length === 0 ? `
                <div class="empty-state">
                    <i class="ph ph-package"></i>
                    <p>Nenhum item cadastrado</p>
                </div>
            ` : `
                <div class="stack-sm">
                    ${state.items.slice(0, 5).map(item => `
                        <div class="card-sm" style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
                            <div style="flex:1;min-width:0;">
                                <div style="font-weight:700;font-size:14px;color:var(--text-1);margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${item.nome}</div>
                                <div style="display:flex;gap:6px;flex-wrap:wrap;">
                                    <span class="badge badge-blue">${item.categoria}</span>
                                    <span class="badge badge-gray">${item.unidade}</span>
                                </div>
                            </div>
                            <div style="text-align:right;flex-shrink:0;">
                                <div style="font-size:24px;font-weight:700;color:${item.quantidade < 10 ? 'var(--orange)' : 'var(--green)'};">${item.quantidade}</div>
                                <div style="font-size:10px;color:var(--text-3);text-transform:uppercase;">em estoque</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `}
        </div>
    </div>
</div>
    `;
}

function renderAnalytics() {
    return `
<div class="page-wrap">
    ${renderHeader()}
    <div class="page-content">
        <h1 class="page-title"><i class="ph-fill ph-chart-line" style="color:#e879a0;"></i> Analytics e Relatórios</h1>

        ${state.isLoading ? `
            <div class="card"><div class="loading-overlay"><div class="loading-spinner"></div><span>${state.loadingMessage}</span></div></div>
        ` : `
            <div class="grid-2">
                <div class="card" style="padding:16px;"><div style="position:relative;height:280px;"><canvas id="categoryChart"></canvas></div></div>
                <div class="card" style="padding:16px;"><div style="position:relative;height:280px;"><canvas id="movementsTypeChart"></canvas></div></div>
            </div>
            <div class="card" style="padding:16px;"><div style="position:relative;height:280px;"><canvas id="topItemsChart"></canvas></div></div>

            ${state.statistics ? `
                <div class="card">
                    <div class="section-title" style="margin-bottom:16px;">Estatísticas Detalhadas</div>
                    <div class="grid-4">
                        <div style="text-align:center;padding:16px;background:color-mix(in srgb,var(--green) 8%,transparent);border-radius:var(--radius-sm);">
                            <div style="font-size:28px;font-weight:700;color:var(--green);">${state.statistics.totalMovements}</div>
                            <div style="font-size:11px;color:var(--text-2);margin-top:4px;">Total Movimentações</div>
                        </div>
                        <div style="text-align:center;padding:16px;background:var(--accent-glow);border-radius:var(--radius-sm);">
                            <div style="font-size:28px;font-weight:700;color:var(--accent);">${state.statistics.movementsByType?.COMPRA || 0}</div>
                            <div style="font-size:11px;color:var(--text-2);margin-top:4px;">Compras</div>
                        </div>
                        <div style="text-align:center;padding:16px;background:color-mix(in srgb,var(--purple) 10%,transparent);border-radius:var(--radius-sm);">
                            <div style="font-size:28px;font-weight:700;color:var(--purple);">${state.statistics.movementsByType?.DISTRIBUICAO || 0}</div>
                            <div style="font-size:11px;color:var(--text-2);margin-top:4px;">Distribuições</div>
                        </div>
                        <div style="text-align:center;padding:16px;background:color-mix(in srgb,var(--orange) 10%,transparent);border-radius:var(--radius-sm);">
                            <div style="font-size:28px;font-weight:700;color:var(--orange);">${state.statistics.lowStock}</div>
                            <div style="font-size:11px;color:var(--text-2);margin-top:4px;">Estoque Baixo</div>
                        </div>
                    </div>
                </div>
            ` : ''}
        `}
    </div>
</div>
    `;
}

function renderMovementSelector() {
    return `
<div class="page-wrap">
    ${renderHeader()}
    <div class="page-content-sm">
        <div class="card-lg">
            <div class="row-between" style="margin-bottom:24px;">
                <h1 class="page-title"><i class="ph ph-shopping-cart" style="color:var(--text-3);"></i> Nova Compra</h1>
                <button onclick="goBack()" class="btn-icon"><i class="ph ph-x"></i></button>
            </div>
            <div class="stack" style="max-width:360px;margin:0 auto;">
                <button onclick="startMovement('COMPRA')" class="action-card" style="padding:28px;">
                    <div class="action-icon icon-green" style="width:56px;height:56px;font-size:26px;"><i class="ph-fill ph-shopping-cart"></i></div>
                    <h3 style="font-size:16px;">Compra de Estoque</h3>
                    <p>Registrar entrada de material</p>
                </button>
            </div>
        </div>
    </div>
</div>
    `;
}

function renderMovement() {
    const op = state.movementOperation;
    const typeInfo = MOVEMENT_TYPES[op.type];
    const itemsInWarehouse = state.items.filter(item => (item.warehouse_id || 'alm-1') === op.targetWarehouse);
    const selectedItem = itemsInWarehouse.find(item => item.id === op.selectedItem);
    const colorMap = { emerald: 'green', blue: 'blue', purple: 'purple', amber: 'amber', red: 'red', cyan: 'cyan' };
    const colorKey = colorMap[typeInfo.color] || 'gray';

    return `
<div class="page-wrap">
    ${renderHeader()}
    <div class="page-content-sm">
        <div class="card-lg">
            <div class="row-between" style="margin-bottom:24px;">
                <h1 class="page-title">
                    <i class="ph-fill ph-${typeInfo.icon} text-${colorKey}"></i>
                    ${typeInfo.label}
                </h1>
                <button onclick="cancelMovement()" class="btn-icon"><i class="ph ph-x"></i></button>
            </div>

            <form onsubmit="event.preventDefault();confirmMovement();" class="stack">

                <div class="field-group">
                    <label class="field-label">Almoxarifado de Destino *</label>
                    <div class="grid-2">
                        ${state.warehouses.map(wh => `
                            <label class="radio-card ${op.targetWarehouse === wh.id ? 'selected' : ''}">
                                <input type="radio" name="targetWarehouse" value="${wh.id}" ${op.targetWarehouse === wh.id ? 'checked' : ''}
                                    onchange="state.movementOperation.targetWarehouse=this.value;state.movementOperation.selectedItem=null;render()" style="width:16px;height:16px;">
                                <div>
                                    <div class="radio-card-title">${wh.nome}</div>
                                    <div class="radio-card-sub">${wh.descricao}</div>
                                </div>
                            </label>
                        `).join('')}
                    </div>
                </div>

                <div class="field-group">
                    <label class="field-label">Tipo de Entrada *</label>
                    <div class="grid-2">
                        <label class="radio-card ${!op.createNewItem ? 'selected' : ''}">
                            <input type="radio" name="entryType" ${!op.createNewItem ? 'checked' : ''}
                                onchange="state.movementOperation.createNewItem=false;state.movementOperation.selectedItem=null;render()" style="width:16px;height:16px;">
                            <div><div class="radio-card-title">Item Existente</div><div class="radio-card-sub">Adicionar ao estoque</div></div>
                        </label>
                        <label class="radio-card ${op.createNewItem ? 'selected' : ''}">
                            <input type="radio" name="entryType" ${op.createNewItem ? 'checked' : ''}
                                onchange="state.movementOperation.createNewItem=true;state.movementOperation.selectedItem=null;render()" style="width:16px;height:16px;">
                            <div><div class="radio-card-title">Novo Item</div><div class="radio-card-sub">Cadastrar e dar entrada</div></div>
                        </label>
                    </div>
                </div>

                ${!op.createNewItem ? `
                    <div class="field-group">
                        <label class="field-label">Selecione o Item *</label>
                        ${itemsInWarehouse.length === 0 ? `
                            <div class="warning-banner"><i class="ph ph-warning"></i> Nenhum item cadastrado neste almoxarifado.</div>
                        ` : `
                            <select class="field-input field-select" onchange="state.movementOperation.selectedItem=this.value;state.movementOperation.size=null;render()" required>
                                <option value="">-- Escolha um item --</option>
                                ${itemsInWarehouse.map(item => `<option value="${item.id}" ${op.selectedItem === item.id ? 'selected' : ''}>${item.nome} (Estoque: ${item.quantidade})</option>`).join('')}
                            </select>
                        `}
                    </div>
                    ${selectedItem ? `
                        <div class="item-preview selected">
                            <div>
                                <div style="font-size:11px;color:var(--text-3);">Selecionado</div>
                                <div style="font-weight:700;font-size:15px;color:var(--text-1);">${selectedItem.nome}</div>
                            </div>
                            <div style="text-align:right;">
                                <div style="font-size:11px;color:var(--text-3);">Estoque atual</div>
                                <div style="font-size:22px;font-weight:700;color:var(--green);">${selectedItem.quantidade}</div>
                            </div>
                        </div>
                        ${selectedItem.tamanhos && Object.keys(selectedItem.tamanhos).length > 0 ? `
                            <div class="field-group">
                                <label class="field-label">Tamanho / Numeração *</label>
                                <select class="field-input field-select" onchange="state.movementOperation.size=this.value;render()" required>
                                    <option value="">-- Selecione --</option>
                                    ${Object.entries(selectedItem.tamanhos).map(([k, q]) =>
                                        `<option value="${k}" ${op.size === k ? 'selected' : ''}>${formatVariationLabel(k)} (Estoque: ${q})</option>`
                                    ).join('')}
                                </select>
                            </div>
                        ` : `
                            <div class="field-group">
                                <label class="field-label">Tamanho / Numeração <span style="font-weight:400;color:var(--text-3)">(ex: 38, 39, M, G)</span></label>
                                <input class="field-input" type="text" placeholder="Digite o tamanho ou numeração..."
                                    value="${op.size || ''}"
                                    oninput="state.movementOperation.size=this.value.trim()||null;render()">
                            </div>
                        `}
                    ` : ''}
                ` : `
                    <div class="card-sm" style="border-color:color-mix(in srgb,var(--green) 30%,transparent);background:color-mix(in srgb,var(--green) 4%,transparent);">
                        <div style="font-weight:700;color:var(--green);margin-bottom:12px;display:flex;align-items:center;gap:6px;"><i class="ph-fill ph-plus-circle"></i> Dados do Novo Item</div>
                        <div class="stack-sm">
                            <div class="field-group">
                                <label class="field-label">Nome do Item *</label>
                                <input class="field-input" type="text" value="${op.newItemName}" oninput="state.movementOperation.newItemName=this.value" placeholder="Ex: Capacete de Segurança" required>
                            </div>
                            <div class="grid-2">
                                <div class="field-group">
                                    <label class="field-label">Categoria *</label>
                                    <select class="field-input field-select" onchange="state.movementOperation.newItemCategory=this.value" required>
                                        <option value="">Selecione...</option>
                                        <option value="Proteção Individual" ${op.newItemCategory === 'Proteção Individual' ? 'selected' : ''}>Proteção Individual</option>
                                        <option value="Ferramentas" ${op.newItemCategory === 'Ferramentas' ? 'selected' : ''}>Ferramentas</option>
                                        <option value="Uniformes" ${op.newItemCategory === 'Uniformes' ? 'selected' : ''}>Uniformes</option>
                                        <option value="Outros" ${op.newItemCategory === 'Outros' ? 'selected' : ''}>Outros</option>
                                    </select>
                                </div>
                                <div class="field-group">
                                    <label class="field-label">Unidade *</label>
                                    <select class="field-input field-select" onchange="state.movementOperation.newItemUnit=this.value">
                                        <option value="UN" ${op.newItemUnit === 'UN' ? 'selected' : ''}>Unidade (UN)</option>
                                        <option value="PAR" ${op.newItemUnit === 'PAR' ? 'selected' : ''}>Par (PAR)</option>
                                        <option value="CX" ${op.newItemUnit === 'CX' ? 'selected' : ''}>Caixa (CX)</option>
                                        <option value="KG" ${op.newItemUnit === 'KG' ? 'selected' : ''}>Kg (KG)</option>
                                        <option value="LT" ${op.newItemUnit === 'LT' ? 'selected' : ''}>Litro (LT)</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>
                `}

                <div class="field-group">
                    <label class="field-label">Fornecedor</label>
                    <input class="field-input" type="text" value="${op.supplier}" oninput="state.movementOperation.supplier=this.value" placeholder="Nome do fornecedor (opcional)">
                </div>
                <div class="field-group">
                    <label class="field-label">Quantidade *</label>
                    <input class="field-input" type="number" value="${op.quantity}" oninput="state.movementOperation.quantity=parseInt(this.value)||1" min="1" required>
                </div>
                <div class="field-group">
                    <label class="field-label">Observações</label>
                    <textarea class="field-input" rows="3" oninput="state.movementOperation.observations=this.value" placeholder="Informações adicionais">${op.observations}</textarea>
                </div>

                <div class="row-end" style="padding-top:8px;">
                    <button type="button" onclick="cancelMovement()" class="btn-ghost">CANCELAR</button>
                    <button type="submit" class="btn-primary" style="min-width:160px;">
                        <i class="ph ph-check-circle"></i> CONFIRMAR COMPRA
                    </button>
                </div>
            </form>
        </div>
    </div>
</div>
    `;
}

function renderStock() {
    const filteredItems = getFilteredItems();
    const categories = [...new Set(state.items.map(i => i.categoria))];
    const activeWh = state.warehouses.find(w => w.id === state.activeWarehouse);
    const otherWh = state.warehouses.find(w => w.id !== state.activeWarehouse);

    return `
<div class="page-wrap">
    ${renderHeader()}
    <div class="page-content">
        <div class="row-between">
            <h1 class="page-title">Estoque de EPIs</h1>
            <div class="row">
                <button onclick="exportStockToXLSX()" class="btn-secondary"><i class="ph-fill ph-download-simple"></i> <span>Exportar</span></button>
                <button onclick="openNewItem()" class="btn-primary"><i class="ph-fill ph-plus-circle"></i> <span>Novo Item</span></button>
            </div>
        </div>

        <div class="card" style="padding:0;overflow:hidden;">
            <div class="tab-bar">
                ${state.warehouses.map(wh => {
        const icon = wh.id === 'alm-1' ? 'warehouse' : wh.id === 'alm-2' ? 'truck' : 'warning-circle';
        const isEmg = wh.id === 'alm-emergencial';
        const count = wh.id === 'alm-emergencial'
            ? (state.emergency.cart.length > 0
                ? `<span class="tab-count" style="background:var(--red);color:#fff;">${state.emergency.cart.length}</span>`
                : `<span class="tab-count">${state.items.filter(i => (i.warehouse_id || 'alm-1') === wh.id).length}</span>`)
            : `<span class="tab-count">${state.items.filter(i => (i.warehouse_id || 'alm-1') === wh.id).length}</span>`;
        return `<button class="tab-btn ${state.activeWarehouse === wh.id ? 'active' : ''}"
                        onclick="state.activeWarehouse='${wh.id}';state.filters.category='TODAS';state.filters.searchTerm='';render()"
                        style="${isEmg && state.activeWarehouse !== wh.id ? 'color:var(--red);' : ''}">
                        <i class="ph-fill ph-${icon}"></i>
                        ${wh.nome}
                        ${count}
                    </button>`;
    }).join('')}
            </div>
            <div class="info-bar">
                <div>
                    <div class="info-bar-title">${activeWh?.nome || 'Almoxarifado'}</div>
                    <div class="info-bar-sub">${activeWh?.descricao || ''}</div>
                </div>
                <div class="row">
                    <button onclick="startTransfer('${state.activeWarehouse}')" class="btn-secondary" style="font-size:12px;padding:7px 12px;">
                        <i class="ph ph-arrows-left-right"></i> Transferência
                    </button>
                    ${state.activeWarehouse !== 'alm-emergencial' ? `
                    <button onclick="navigateToWarehouses()" class="btn-secondary" style="font-size:12px;padding:7px 12px;">
                        <i class="ph ph-gear"></i> Configurar
                    </button>` : ''}
                </div>
            </div>
        </div>

        ${state.activeWarehouse === 'alm-emergencial' ? renderEmergencial() : `
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <select class="field-input field-select"
                style="width:auto;padding:7px 12px;font-size:13px;border-radius:20px;background:var(--bg-2);border-color:transparent;"
                onchange="state.filters.category=this.value;render()">
                <option value="TODAS">Todas as categorias</option>
                ${categories.map(c => `<option value="${c}" ${state.filters.category === c ? 'selected' : ''}>${c}</option>`).join('')}
            </select>
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;color:var(--text-2);white-space:nowrap;">
                <input type="checkbox" ${state.filters.lowStockOnly ? 'checked' : ''} onchange="state.filters.lowStockOnly=this.checked;render()" style="width:15px;height:15px;accent-color:var(--orange);">
                Estoque baixo
            </label>
            ${state.filters.searchTerm || state.filters.category !== 'TODAS' || state.filters.lowStockOnly ? `
                <button onclick="state.filters.searchTerm='';state.filters.category='TODAS';state.filters.lowStockOnly=false;render()"
                    style="font-size:12px;color:var(--text-3);background:none;border:none;cursor:pointer;padding:4px 8px;border-radius:4px;display:flex;align-items:center;gap:4px;"
                    onmouseover="this.style.color='var(--text-1)'" onmouseout="this.style.color='var(--text-3)'">
                    <i class="ph ph-x"></i> Limpar
                </button>
            ` : ''}
        </div>

        ${filteredItems.length === 0 ? `
            <div class="card">
                <div class="empty-state">
                    <i class="ph ph-package"></i>
                    <p>Nenhum item encontrado em ${activeWh?.nome || 'este almoxarifado'}</p>
                    ${state.filters.searchTerm || state.filters.category !== 'TODAS' || state.filters.lowStockOnly ? `
                        <div style="margin-top:16px;">
                            <button onclick="state.filters={startDate:getFirstDayOfMonth(),endDate:getCurrentDate(),type:'TODOS',searchTerm:'',category:'TODAS',minQuantity:'',maxQuantity:'',lowStockOnly:false};render()" class="btn-secondary">Limpar Filtros</button>
                        </div>
                    ` : `
                        <div style="margin-top:16px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
                            <button onclick="openNewItem()" class="btn-primary">Cadastrar Item</button>
                            ${state.activeWarehouse !== 'alm-1' ? `<button onclick="startTransfer('alm-1')" class="btn-cyan"><i class="ph-fill ph-arrows-left-right"></i> Transferir do Central</button>` : ''}
                        </div>
                    `}
                </div>
            </div>
        ` : `
            <div class="count-label">Mostrando <strong>${filteredItems.length}</strong> de <strong>${state.items.filter(i => (i.warehouse_id || 'alm-1') === state.activeWarehouse).length}</strong> itens em <strong>${activeWh?.nome}</strong></div>
            <div class="grid-cards">
                ${filteredItems.map(item => `
                    <div class="item-card">
                        <div class="item-card-name">${item.nome}</div>
                        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;">
                            <span class="badge badge-gray">${item.categoria}</span>
                            <span class="badge badge-gray">${item.unidade}</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:8px;">
                            <span style="font-size:11px;text-transform:uppercase;color:var(--text-3);">Quantidade</span>
                            <span class="item-card-qty ${item.quantidade < 10 ? 'low' : 'ok'}">${item.quantidade}</span>
                        </div>
                        ${item.tamanhos && Object.keys(item.tamanhos).length > 0 ? `
                            <div class="sizes-grid">
                                ${renderVariationChips(item)}
                            </div>
                        ` : ''}
                        ${item.unidades_por_caixa && item.unidades_por_caixa > 1 ? `
                            <div style="font-size:11px;color:var(--text-2);margin-top:6px;"><i class="ph ph-package"></i> ${item.unidades_por_caixa} un/caixa</div>
                        ` : ''}
                        <div class="item-actions">
                            <button onclick='openEditItem(${JSON.stringify(item).replace(/'/g, "&#39;")})' class="btn-secondary" style="flex:1;font-size:12px;padding:8px;"><i class="ph ph-pencil-simple"></i> Editar</button>
                            <button onclick="startTransfer('${item.warehouse_id || 'alm-1'}','${item.id}')" class="btn-cyan" style="padding:8px 12px;font-size:12px;" title="Transferir / Dar Baixa"><i class="ph ph-arrows-left-right"></i> Transferir</button>
                            <button onclick="handleDeleteItem('${item.id}')" class="btn-danger" style="padding:8px 10px;"><i class="ph ph-trash"></i></button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `}
        `}

        ${state.baixaModal.open ? renderBaixaModal() : ''}
    </div>
</div>
    `;
}

function renderBaixaModal() {
    const m = state.baixaModal;
    const item = m.item;
    if (!item) return '';
    const hasSizes = item.tamanhos && Object.keys(item.tamanhos).length > 0;
    const sizeKeys = hasSizes ? Object.entries(item.tamanhos).filter(([, q]) => q > 0).map(([s]) => s) : [];
    const maxQty = hasSizes && m.size
        ? (item.tamanhos[m.size] || 0)
        : item.quantidade;
    return `
    <div style="position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;"
         onclick="if(event.target===this){state.baixaModal.open=false;render()}">
        <div style="position:absolute;inset:0;background:rgba(0,0,0,0.55);backdrop-filter:blur(4px);"></div>
        <div style="position:relative;background:var(--bg-1);border-radius:var(--radius-lg);padding:28px;width:100%;max-width:420px;box-shadow:0 20px 60px rgba(0,0,0,0.4);border:1px solid var(--border);">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
                <div>
                    <div style="font-weight:800;font-size:16px;color:var(--red);display:flex;align-items:center;gap:8px;">
                        <i class="ph-fill ph-arrow-fat-lines-down"></i> Dar Baixa
                    </div>
                    <div style="font-size:13px;color:var(--text-2);margin-top:3px;font-weight:500;">${item.nome}</div>
                </div>
                <button onclick="state.baixaModal.open=false;render()" class="btn-icon"><i class="ph ph-x"></i></button>
            </div>

            <div style="display:flex;flex-direction:column;gap:14px;">
                ${hasSizes ? `
                <div class="field-group">
                    <label class="field-label">Tamanho / Numeração *</label>
                    <select class="field-input field-select"
                        onchange="state.baixaModal.size=this.value;state.baixaModal.quantidade=1;render()">
                        <option value="">— Selecione o tamanho —</option>
                        ${sizeKeys.map(s => `<option value="${s}" ${m.size === s ? 'selected' : ''}>${formatVariationLabel(s)} — disponível: ${item.tamanhos[s]}</option>`).join('')}
                    </select>
                </div>` : ''}

                <div class="field-group">
                    <label class="field-label">Quantidade a dar baixa *</label>
                    <input class="field-input" type="number" min="1" max="${maxQty}"
                        value="${m.quantidade}"
                        ${hasSizes && !m.size ? 'disabled placeholder="Selecione o tamanho primeiro"' : ''}
                        oninput="state.baixaModal.quantidade=Math.min(${maxQty},Math.max(1,parseInt(this.value)||1))">
                    <div style="font-size:11px;color:var(--text-3);margin-top:4px;">Disponível em estoque: <strong>${maxQty}</strong> ${item.unidade}</div>
                </div>

                <div class="field-group">
                    <label class="field-label">Motivo / Observação <span style="color:var(--text-3);font-weight:400;">(opcional)</span></label>
                    <input class="field-input" type="text" placeholder="Ex: entrega ao colaborador, descarte..."
                        value="${m.motivo}"
                        oninput="state.baixaModal.motivo=this.value">
                </div>

                <div style="display:flex;gap:10px;padding-top:4px;">
                    <button onclick="state.baixaModal.open=false;render()" class="btn-secondary" style="flex:1;">Cancelar</button>
                    <button onclick="confirmDarBaixa()"
                        class="btn-primary"
                        style="flex:2;background:var(--red);border-color:var(--red);"
                        ${m.saving ? 'disabled' : ''}
                        ${hasSizes && !m.size ? 'disabled' : ''}>
                        ${m.saving
            ? '<span class="loading-spinner" style="width:14px;height:14px;border-width:2px;"></span> Processando...'
            : '<i class="ph-fill ph-arrow-fat-lines-down"></i> Confirmar Baixa'}
                    </button>
                </div>
            </div>
        </div>
    </div>`;
}

function renderEmergencial() {
    const em = state.emergency;
    // Todos os itens de todos os almoxarifados com estoque > 0
    const allItems = state.items
        .filter(i => i.quantidade > 0)
        .sort((a, b) => a.nome.localeCompare(b.nome));

    const whName = id => state.warehouses.find(w => w.id === id)?.nome || id;

    const cartHtml = em.cart.length === 0
        ? `<p style="color:var(--text-3);font-size:13px;text-align:center;padding:16px 0;">Nenhum item adicionado ainda</p>`
        : em.cart.map((entry, idx) => `
            <div class="resultado-row">
                <div>
                    <span style="font-weight:600;font-size:14px;">${entry.item_name}</span>
                    <span class="badge badge-gray" style="margin-left:6px;">${entry.unidade}</span>
                    <span class="badge badge-blue" style="margin-left:4px;font-size:10px;">${whName(entry.warehouse_id)}</span>
                </div>
                <div style="display:flex;align-items:center;gap:10px;">
                    <span style="font-size:15px;font-weight:700;color:var(--red);">−${entry.quantidade}</span>
                    <button onclick="emergencyRemoveFromCart(${idx})" class="btn-icon" title="Remover">
                        <i class="ph ph-x"></i>
                    </button>
                </div>
            </div>`).join('');

    const emgSelectedItem = em.formItemId ? state.items.find(i => i.id === em.formItemId) : null;
    const emgHasSizes = emgSelectedItem?.tamanhos && Object.keys(emgSelectedItem.tamanhos).length > 0;
    const emgCartQtyForSize = em.cart.filter(c => c.item_id === em.formItemId && c.size === (em.formSize || null)).reduce((a, c) => a + c.quantidade, 0);
    const emgMaxQty = emgHasSizes
        ? Math.max(0, (emgSelectedItem.tamanhos[em.formSize] || 0) - emgCartQtyForSize)
        : emgSelectedItem ? Math.max(0, emgSelectedItem.quantidade - emgCartQtyForSize) : 9999;

    const addFormHtml = em.showForm ? `
        <div class="card" style="border:2px solid var(--red);margin-top:0;">
            <div class="section-title" style="margin-bottom:14px;color:var(--red);">
                <i class="ph-fill ph-plus-circle"></i> Adicionar Item
            </div>
            <div class="stack-sm">
                <div class="field-group">
                    <label class="field-label">Item *</label>
                    <select class="field-input field-select" id="emgItemId"
                        onchange="state.emergency.formItemId=this.value;state.emergency.formSize='';state.emergency.formQty=1;render()">
                        <option value="">— Selecione —</option>
                        ${allItems.map(i => {
        const wh = whName(i.warehouse_id || 'alm-1');
        const hasSz = i.tamanhos && Object.keys(i.tamanhos).length > 0;
        const label = hasSz
            ? `[${wh}] ${i.nome} — ${Object.entries(i.tamanhos).filter(([, q]) => q > 0).map(([s, q]) => `${formatVariationLabel(s)}:${q}`).join(', ')}`
            : `[${wh}] ${i.nome} — disp: ${i.quantidade} ${i.unidade}`;
        return `<option value="${i.id}" ${em.formItemId === i.id ? 'selected' : ''}>${label}</option>`;
    }).join('')}
                    </select>
                </div>
                ${emgSelectedItem ? (emgHasSizes ? `
                <div class="field-group">
                    <label class="field-label">Tamanho / Numeração *</label>
                    <select class="field-input field-select"
                        onchange="state.emergency.formSize=this.value;state.emergency.formQty=1;render()">
                        <option value="">— Selecione o tamanho —</option>
                        ${Object.entries(emgSelectedItem.tamanhos).filter(([, q]) => q > 0).map(([s, q]) =>
        `<option value="${s}" ${em.formSize === s ? 'selected' : ''}>${formatVariationLabel(s)} — ${q} disponível${q !== 1 ? 'is' : ''}</option>`
    ).join('')}
                    </select>
                </div>` : `
                <div class="field-group">
                    <label class="field-label">Tamanho / Numeração <span style="font-weight:400;color:var(--text-3)">(ex: 38, 39, M, G)</span></label>
                    <input class="field-input" type="text" placeholder="Digite o tamanho ou numeração..."
                        value="${em.formSize || ''}"
                        oninput="state.emergency.formSize=this.value.trim();render()">
                </div>`) : ''}
                <div class="field-group">
                    <label class="field-label">Quantidade *</label>
                    <input class="field-input" type="number" min="1" max="${emgMaxQty || 9999}" id="emgQty"
                        value="${em.formQty}"
                        ${emgHasSizes && !em.formSize ? 'disabled' : ''}
                        oninput="state.emergency.formQty=this.value">
                    ${emgSelectedItem ? `<div style="font-size:11px;color:var(--text-3);margin-top:4px;">Disponível: ${emgMaxQty}</div>` : ''}
                </div>
                <div style="display:flex;gap:10px;margin-top:4px;">
                    <button onclick="emergencyAddToCart()" class="btn-primary"
                        ${emgHasSizes && !em.formSize ? 'disabled' : ''}>
                        <i class="ph-fill ph-plus-circle"></i> Adicionar ao Carrinho
                    </button>
                    <button onclick="state.emergency.showForm=false;render()" class="btn-secondary">
                        Cancelar
                    </button>
                </div>
            </div>
        </div>` : '';

    const emgItems = state.items.filter(i => (i.warehouse_id || 'alm-1') === 'alm-emergencial' && i.quantidade > 0);
    return emgItems.length === 0
        ? `<div class="card"><div class="empty-state"><i class="ph ph-warning-circle"></i><p>Nenhum item no Emergencial</p><div style="margin-top:16px;"><button onclick="startTransfer('alm-1')" class="btn-secondary"><i class="ph ph-arrows-left-right"></i> Transferir do Central</button></div></div></div>`
        : `<div class="card">
            <div class="section-title" style="margin-bottom:12px;">
                <i class="ph ph-package"></i> Itens no Emergencial
                <span class="badge badge-gray" style="margin-left:8px;">${emgItems.length} itens</span>
            </div>
            <div class="grid-cards" style="--min-card:180px;">
                ${emgItems.map(item => `
                    <div class="item-card" style="border-left:3px solid var(--red);">
                        <div class="item-card-name">${item.nome}</div>
                        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">
                            <span class="badge badge-blue">${item.categoria}</span>
                            <span class="badge badge-gray">${item.unidade}</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;align-items:flex-end;">
                            <span style="font-size:11px;text-transform:uppercase;color:var(--text-3);">Qtd</span>
                            <span class="item-card-qty ${item.quantidade < 5 ? 'low' : 'ok'}">${item.quantidade}</span>
                        </div>
                        ${item.tamanhos && Object.keys(item.tamanhos).length > 0 ? `
                            <div class="sizes-grid" style="margin-top:8px;">
                                ${renderVariationChips(item)}
                            </div>` : ''}
                        <div style="display:flex;gap:6px;margin-top:10px;border-top:1px solid var(--border);padding-top:10px;">
                            <button onclick='openEditItem(${JSON.stringify(item).replace(/'/g, "&#39;")})' class="btn-secondary" style="flex:1;font-size:11px;padding:5px 8px;">
                                <i class="ph ph-pencil-simple"></i> Editar
                            </button>
                            <button onclick="handleDeleteItem('${item.id}')" class="btn-secondary" style="font-size:11px;padding:5px 8px;color:var(--red);border-color:var(--red);">
                                <i class="ph ph-trash"></i>
                            </button>
                        </div>
                    </div>`).join('')}
            </div>
        </div>`;
}



function renderWarehouses() {
    return `
<div class="page-wrap">
    ${renderHeader()}
    <div class="page-content-sm">
        <div class="row-between">
            <h1 class="page-title">Almoxarifados</h1>
            <button onclick="goBack()" class="btn-icon"><i class="ph ph-x"></i></button>
        </div>

        <div class="stack">
            ${state.warehouses.map(wh => `
                <div class="card">
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;gap:12px;">
                        <div>
                            <div style="font-weight:700;font-size:15px;color:var(--text-1);">${wh.nome}</div>
                            <div style="font-size:12px;color:var(--text-3);margin-top:2px;">${wh.descricao || ''}</div>
                        </div>
                        <span class="badge badge-gray">${state.items.filter(i => (i.warehouse_id || 'alm-1') === wh.id).length} itens</span>
                    </div>
                    <form onsubmit="handleSaveWarehouse(event,'${wh.id}')" class="stack-sm">
                        <div class="field-group">
                            <label class="field-label">Nome *</label>
                            <input class="field-input" type="text" id="wh-nome-${wh.id}" value="${wh.nome}" placeholder="Nome do almoxarifado" required>
                        </div>
                        <div class="field-group">
                            <label class="field-label">Descrição</label>
                            <input class="field-input" type="text" id="wh-desc-${wh.id}" value="${wh.descricao || ''}" placeholder="Descrição opcional">
                        </div>
                        <div>
                            <button type="submit" class="btn-primary"><i class="ph ph-floppy-disk"></i> Salvar Alterações</button>
                        </div>
                    </form>
                </div>
            `).join('')}
        </div>
    </div>
</div>
    `;
}

function renderTransfer() {
    const op = state.transferOperation;
    const fromWh = state.warehouses.find(w => w.id === op.fromWarehouse);
    const toWh = state.warehouses.find(w => w.id === op.toWarehouse);
    const sourceItems = state.items.filter(i => (i.warehouse_id || 'alm-1') === op.fromWarehouse && i.quantidade > 0);
    const selectedItem = sourceItems.find(i => i.id === op.selectedItem);
    const hasSizes = selectedItem?.tamanhos && Object.keys(selectedItem.tamanhos).length > 0;
    const availableQty = hasSizes && op.size
        ? (selectedItem.tamanhos[op.size] || 0)
        : (selectedItem?.quantidade || 0);

    return `
<div class="page-wrap">
    ${renderHeader()}
    <div class="page-content-sm">
        <div class="card-lg">
            <div class="row-between" style="margin-bottom:24px;">
                <h1 class="page-title"><i class="ph ph-arrows-left-right" style="color:var(--text-3);"></i> Transferência</h1>
                <button onclick="goBack()" class="btn-icon"><i class="ph ph-x"></i></button>
            </div>

            <form onsubmit="event.preventDefault();confirmTransfer();" class="stack">
                <div class="field-group">
                    <label class="field-label">De (Origem)</label>
                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;">
                        ${state.warehouses.map(wh => `
                            <label class="radio-card ${op.fromWarehouse === wh.id ? 'selected' : ''}">
                                <input type="radio" name="fromWarehouse" value="${wh.id}" ${op.fromWarehouse === wh.id ? 'checked' : ''}
                                    onchange="state.transferOperation.fromWarehouse=this.value;state.transferOperation.selectedItem=null;render()" style="width:16px;height:16px;">
                                <div><div class="radio-card-title">${wh.nome}</div><div class="radio-card-sub">${wh.descricao}</div></div>
                            </label>
                        `).join('')}
                    </div>
                </div>

                <div class="field-group">
                    <label class="field-label">Para (Destino)</label>
                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;">
                        ${state.warehouses.map(wh => `
                            <label class="radio-card ${op.toWarehouse === wh.id ? 'selected' : ''}">
                                <input type="radio" name="toWarehouse" value="${wh.id}" ${op.toWarehouse === wh.id ? 'checked' : ''}
                                    onchange="state.transferOperation.toWarehouse=this.value;render()" style="width:16px;height:16px;">
                                <div><div class="radio-card-title">${wh.nome}</div><div class="radio-card-sub">${wh.descricao}</div></div>
                            </label>
                        `).join('')}
                        <label class="radio-card ${op.toWarehouse === 'DAR_BAIXA' ? 'selected' : ''}" style="${op.toWarehouse === 'DAR_BAIXA' ? 'border-color:var(--red);background:rgba(var(--red-rgb,220,38,38),0.08);' : ''}">
                            <input type="radio" name="toWarehouse" value="DAR_BAIXA" ${op.toWarehouse === 'DAR_BAIXA' ? 'checked' : ''}
                                onchange="state.transferOperation.toWarehouse=this.value;render()" style="width:16px;height:16px;">
                            <div>
                                <div class="radio-card-title" style="${op.toWarehouse === 'DAR_BAIXA' ? 'color:var(--red);' : ''}"><i class="ph-fill ph-arrow-fat-lines-down"></i> Dar Baixa</div>
                                <div class="radio-card-sub">Saída direta — entrega ao colaborador</div>
                            </div>
                        </label>
                    </div>
                    ${op.toWarehouse === 'DAR_BAIXA' ? `<div style="margin-top:10px;padding:10px 14px;background:rgba(220,38,38,0.08);border:1px solid var(--red);border-radius:var(--radius);font-size:12px;color:var(--red);display:flex;align-items:center;gap:8px;"><i class="ph ph-info"></i> O item será removido do estoque imediatamente, sem movimentação entre almoxarifados.</div>` : ''}
                </div>

                <div class="field-group">
                    <label class="field-label">Item para Transferir *</label>
                    ${sourceItems.length === 0 ? `
                        <div class="warning-banner"><i class="ph ph-warning"></i> Nenhum item disponível em ${fromWh?.nome || 'origem'}.</div>
                    ` : `
                        <select class="field-input field-select" onchange="state.transferOperation.selectedItem=this.value;state.transferOperation.size=null;render()" required>
                            <option value="">-- Escolha um item --</option>
                            ${sourceItems.map(i => {
        const label = i.tamanhos && Object.keys(i.tamanhos).length > 0
            ? `${i.nome} — ${Object.entries(i.tamanhos).filter(([, q]) => q > 0).map(([s, q]) => `${formatVariationLabel(s)}: ${q}`).join(', ')}`
            : `${i.nome} (Disponível: ${i.quantidade})`;
        return `<option value="${i.id}" ${op.selectedItem === i.id ? 'selected' : ''}>${label}</option>`;
    }).join('')}
                        </select>
                    `}
                </div>

                ${selectedItem ? `
                    <div class="item-preview selected">
                        <div>
                            <div style="font-size:11px;color:var(--text-3);">Item selecionado</div>
                            <div style="font-weight:700;font-size:15px;color:var(--text-1);">${selectedItem.nome}</div>
                            ${hasSizes && !op.size ? `<div style="font-size:11px;color:var(--orange);margin-top:4px;"><i class="ph ph-warning"></i> Selecione um tamanho</div>` : ''}
                        </div>
                        <div style="text-align:right;">
                            <div style="font-size:11px;color:var(--text-3);">${op.size ? `Tam ${formatVariationLabel(op.size)}` : 'Disponível'}</div>
                            <div style="font-size:22px;font-weight:700;color:${availableQty > 0 ? 'var(--green)' : 'var(--red)'};">${availableQty}</div>
                        </div>
                    </div>
                    ${hasSizes ? `
                        <div class="field-group">
                            <label class="field-label">Tamanho / Numeração *</label>
                            <select class="field-input field-select" onchange="state.transferOperation.size=this.value;state.transferOperation.quantity=1;render()" required>
                                <option value="">-- Selecione --</option>
                                ${Object.entries(selectedItem.tamanhos).filter(([, q]) => q > 0).map(([s, q]) => `<option value="${s}" ${op.size === s ? 'selected' : ''}>${formatVariationLabel(s)} — ${q} disponível${q !== 1 ? 'is' : ''}</option>`).join('')}
                            </select>
                        </div>
                    ` : `
                        <div class="field-group">
                            <label class="field-label">Tamanho / Numeração <span style="font-weight:400;color:var(--text-3)">(ex: 38, 39, M, G)</span></label>
                            <input class="field-input" type="text" placeholder="Digite o tamanho ou numeração..."
                                value="${op.size || ''}"
                                oninput="state.transferOperation.size=this.value.trim()||null;render()">
                        </div>
                    `}
                ` : ''}

                <div class="field-group">
                    <label class="field-label">Quantidade *</label>
                    <input class="field-input" type="number" value="${op.quantity}" oninput="state.transferOperation.quantity=parseInt(this.value)||1" min="1" max="${availableQty || 9999}" ${hasSizes && !op.size ? 'disabled' : ''} required>
                    ${availableQty > 0 ? `<div style="font-size:11px;color:var(--text-3);margin-top:4px;">Máximo disponível: ${availableQty}</div>` : ''}
                </div>
                <div class="field-group">
                    <label class="field-label">Observações</label>
                    <textarea class="field-input" rows="2" oninput="state.transferOperation.observations=this.value" placeholder="Motivo da transferência">${op.observations}</textarea>
                </div>

                <div class="row-end" style="padding-top:8px; gap: 8px;">
                    <button type="button" onclick="goBack()" class="btn-ghost">CANCELAR</button>
                    ${op.toWarehouse === 'DAR_BAIXA'
            ? `<button type="button" onclick="transferDarBaixa()" class="btn-primary" style="min-width:160px;background:var(--red);border-color:var(--red);">
                                <i class="ph-fill ph-arrow-fat-lines-down"></i> CONFIRMAR BAIXA
                           </button>`
            : `<button type="submit" class="btn-cyan" style="min-width:160px;">
                                <i class="ph ph-arrows-left-right"></i> CONFIRMAR TRANSFERÊNCIA
                           </button>`
        }
                </div>
            </form>
        </div>
    </div>
</div>
    `;
}

function renderHistory() {
    const filteredMovements = getFilteredMovements();
    const paginatedMovements = getPaginatedMovements();
    const totalPages = Math.ceil(filteredMovements.length / state.itemsPerPage);

    const typeColorMap = { emerald: 'green', blue: 'blue', purple: 'purple', amber: 'amber', red: 'red', cyan: 'cyan', slate: 'gray' };

    return `
<div class="page-wrap">
    ${renderHeader()}
    <div class="page-content">
        <div class="row-between">
            <h1 class="page-title">Histórico de Movimentações</h1>
            <button onclick="exportMovementsToXLSX()" class="btn-secondary"><i class="ph-fill ph-download-simple"></i> <span>Exportar Excel</span></button>
        </div>

        <div class="card">
            <div class="section-title" style="margin-bottom:14px;">Filtros</div>
            <div class="grid-3" style="margin-bottom:12px;">
                <div class="field-group">
                    <label class="field-label">Data Inicial</label>
                    <input class="field-input" type="date" value="${state.filters.startDate}" onchange="state.filters.startDate=this.value">
                </div>
                <div class="field-group">
                    <label class="field-label">Data Final</label>
                    <input class="field-input" type="date" value="${state.filters.endDate}" onchange="state.filters.endDate=this.value">
                </div>
                <div class="field-group">
                    <label class="field-label">Tipo</label>
                    <select class="field-input field-select" onchange="state.filters.type=this.value">
                        <option value="TODOS" ${state.filters.type === 'TODOS' ? 'selected' : ''}>Todos</option>
                        ${Object.entries(MOVEMENT_TYPES).map(([code, info]) => `<option value="${code}" ${state.filters.type === code ? 'selected' : ''}>${info.label}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div class="field-group" style="margin-bottom:12px;">
                <label class="field-label">Pesquisar</label>
                <input class="field-input" type="text" value="${state.filters.searchTerm}" oninput="handleSearchInput(this.value)" placeholder="Buscar por item, colaborador, fornecedor...">
            </div>
            <button onclick="applyFilters()" class="btn-secondary" ${state.isLoading ? 'disabled' : ''}>
                <i class="ph ph-magnifying-glass"></i> Buscar
            </button>
        </div>

        <div class="card">
            <div class="row-between" style="margin-bottom:12px;">
                <span class="count-label">Mostrando <strong>${paginatedMovements.length}</strong> de <strong>${filteredMovements.length}</strong></span>
                ${totalPages > 0 ? `<span class="count-label">Pág ${state.currentPage}/${totalPages}</span>` : ''}
            </div>

            ${state.isLoading ? `
                <div class="loading-overlay"><div class="loading-spinner"></div><span>${state.loadingMessage}</span></div>
            ` : filteredMovements.length === 0 ? `
                <div class="empty-state">
                    <i class="ph ph-database"></i>
                    <p>Nenhuma movimentação encontrada</p>
                    <small>Ajuste os filtros ou registre uma movimentação</small>
                </div>
            ` : `
                <div class="stack-sm">
                    ${paginatedMovements.map(movement => {
        const typeInfo = MOVEMENT_TYPES[movement.type] || MOVEMENT_TYPES['AJUSTE'];
        const isPositive = typeInfo.sign === '+';
        return `
                            <div class="movement-row">
                                <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">
                                    <div style="flex:1;min-width:0;">
                                        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap;">
                                            <span style="font-weight:600;font-size:14px;color:var(--text-1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${movement.item_name}</span>
                                            <span class="badge badge-gray">${typeInfo.label}</span>
                                        </div>
                                        <div class="movement-meta">
                                            <div>${formatDate(movement.date)}${movement.user_name || movement.user ? ` · <span style="color:var(--accent);font-weight:600;">${movement.user_name || movement.user}</span>` : ''}</div>
                                            ${movement.employee ? `<div>Colaborador: ${movement.employee}</div>` : ''}
                                            ${movement.supplier ? `<div>Fornecedor: ${movement.supplier}</div>` : ''}
                                            ${movement.observations ? `<div style="color:var(--text-2);">${movement.observations}</div>` : ''}
                                        </div>
                                    </div>
                                    <div style="text-align:right;flex-shrink:0;padding-top:2px;">
                                        <div class="movement-qty ${isPositive ? 'positive' : 'negative'}">${typeInfo.sign}${movement.quantity}</div>
                                    </div>
                                </div>
                            </div>
                        `;
    }).join('')}
                </div>

                ${totalPages > 1 ? `
                    <div class="pagination">
                        <button class="page-btn" onclick="changePage(-1)" ${state.currentPage === 1 ? 'disabled' : ''}>
                            <i class="ph ph-caret-left"></i>
                        </button>
                        ${Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
        let p;
        if (totalPages <= 5) p = i + 1;
        else if (state.currentPage <= 3) p = i + 1;
        else if (state.currentPage >= totalPages - 2) p = totalPages - 4 + i;
        else p = state.currentPage - 2 + i;
        return `<button class="page-btn ${state.currentPage === p ? 'active' : ''}" onclick="state.currentPage=${p};render()">${p}</button>`;
    }).join('')}
                        <button class="page-btn" onclick="changePage(1)" ${state.currentPage === totalPages ? 'disabled' : ''}>
                            <i class="ph ph-caret-right"></i>
                        </button>
                    </div>
                ` : ''}
            `}
        </div>
    </div>
</div>
    `;
}

function renderEditItem() {
    const item = state.editingItem || {};
    const itemHasTam   = hasTamanhos(item);
    const itemHasCond  = hasCondicoes(item);
    return `
<div class="page-wrap">
    ${renderHeader()}
    <div class="page-content-sm">
        <div class="card-lg">
            <div class="row-between" style="margin-bottom:${item.warehouse_id === 'alm-emergencial' ? '12px' : '24px'};">
                <h1 class="page-title">${item.id ? 'Editar Item' : 'Novo Item'}</h1>
                <button onclick="goBack()" class="btn-icon"><i class="ph ph-x"></i></button>
            </div>
            ${item.warehouse_id === 'alm-emergencial' ? `
            <div style="display:flex;align-items:center;gap:8px;background:rgba(214,69,69,.08);border:1.5px solid var(--red);border-radius:10px;padding:10px 14px;margin-bottom:20px;">
                <i class="ph ph-warning-circle" style="color:var(--red);font-size:18px;flex-shrink:0;"></i>
                <span style="font-size:13px;font-weight:600;color:var(--red);">Almoxarifado Emergencial</span>
                <span style="font-size:12px;color:var(--text-3);margin-left:4px;">— alterações afetam apenas o estoque emergencial</span>
            </div>` : ''}
            <form onsubmit="handleSaveItem(event)" class="stack">
                <div class="grid-2">
                    <div class="field-group" style="grid-column:1/-1;">
                        <label class="field-label">Nome do Item *</label>
                        <input class="field-input" type="text" id="itemName" value="${item.nome || ''}" placeholder="Ex: Capacete de Segurança" required>
                    </div>
                    <div class="field-group">
                        <label class="field-label">Categoria *</label>
                        <select class="field-input field-select" id="itemCategory" required>
                            <option value="">Selecione...</option>
                            <option value="Proteção Individual" ${item.categoria === 'Proteção Individual' ? 'selected' : ''}>Proteção Individual</option>
                            <option value="Ferramentas" ${item.categoria === 'Ferramentas' ? 'selected' : ''}>Ferramentas</option>
                            <option value="Uniformes" ${item.categoria === 'Uniformes' ? 'selected' : ''}>Uniformes</option>
                            <option value="Outros" ${item.categoria === 'Outros' ? 'selected' : ''}>Outros</option>
                        </select>
                    </div>
                    <div class="field-group">
                        <label class="field-label">Unidade *</label>
                        <select class="field-input field-select" id="itemUnit">
                            <option value="UN" ${item.unidade === 'UN' ? 'selected' : ''}>Unidade (UN)</option>
                            <option value="PAR" ${item.unidade === 'PAR' ? 'selected' : ''}>Par (PAR)</option>
                            <option value="CX" ${item.unidade === 'CX' ? 'selected' : ''}>Caixa (CX)</option>
                            <option value="KG" ${item.unidade === 'KG' ? 'selected' : ''}>Kg (KG)</option>
                            <option value="LT" ${item.unidade === 'LT' ? 'selected' : ''}>Litro (LT)</option>
                        </select>
                    </div>
                        <div class="field-group">
                        <label class="field-label">Unidades por Caixa</label>
                        <input class="field-input" type="number" id="itemUnitsPerBox" value="${item.unidades_por_caixa || 1}" min="1">
                    </div>
                    <div class="field-group" style="grid-column:1/-1;">
                        <label class="field-label">Observações</label>
                        <textarea class="field-input" id="itemObs" rows="2" placeholder="Informações adicionais...">${item.observacoes || ''}</textarea>
                    </div>
                </div>

                <!-- Tamanhos / Numeração -->
                <div class="field-group" style="grid-column:1/-1;">
                    <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-weight:600;font-size:13px;color:var(--text-2);">
                        <input type="checkbox" id="hasSizes" style="width:18px;height:18px;accent-color:var(--accent);"
                            ${itemHasTam ? 'checked' : ''}
                            onchange="updateItemFormLayout()">
                        Este item tem tamanhos / numerações diferentes
                    </label>
                </div>
                <div class="field-group" style="grid-column:1/-1;">
                    <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-weight:600;font-size:13px;color:var(--text-2);">
                        <input type="checkbox" id="hasCondicoes" style="width:18px;height:18px;accent-color:var(--green);"
                            ${itemHasCond ? 'checked' : ''}
                            onchange="updateItemFormLayout()">
                        Este item tem condição (NOVO / HIGIENIZADO)
                    </label>
                </div>

                <!-- Quantidade única -->
                <div id="singleQuantityArea" class="${!itemHasTam && !itemHasCond ? 'block' : 'hidden'}" style="grid-column:1/-1;">
                    <div class="field-group">
                        <label class="field-label">Quantidade</label>
                        <input class="field-input" type="number" id="itemQuantity" value="${item.quantidade || 0}" min="0">
                    </div>
                </div>

                <!-- Só condição (NOVO / HIGIENIZADO) -->
                <div id="condicoesOnlyArea" class="${!itemHasTam && itemHasCond ? 'block' : 'hidden'}" style="grid-column:1/-1;">
                    <div class="field-group">
                        <label class="field-label">Quantidades por Condição</label>
                        <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;">
                            <label style="display:flex;align-items:center;gap:8px;font-weight:600;font-size:13px;color:var(--green);">
                                NOVO:
                                <input type="number" id="condicaoNovo" class="field-input" style="width:100px;"
                                    value="${item.tamanhos?.['NOVO'] ?? 0}" min="0">
                            </label>
                            <label style="display:flex;align-items:center;gap:8px;font-weight:600;font-size:13px;color:var(--accent);">
                                HIGIENIZADO:
                                <input type="number" id="condicaoHig" class="field-input" style="width:100px;"
                                    value="${item.tamanhos?.['HIGIENIZADO'] ?? 0}" min="0">
                            </label>
                        </div>
                    </div>
                </div>

                <!-- Tamanhos (com ou sem condição) -->
                <div id="sizesConfigArea" class="${itemHasTam ? 'block' : 'hidden'}" style="grid-column:1/-1;">
                    <div class="field-group">
                        <label class="field-label" id="sizeListLabel">${itemHasTam && itemHasCond ? 'Tamanhos × Condição (NOVO / HIGIENIZADO)' : 'Tamanhos e Quantidades'}</label>
                        <div id="sizesList" class="stack-sm">
                            ${(() => {
                                if (!itemHasTam) return '';
                                if (itemHasCond) {
                                    const sizes = [...new Set(
                                        Object.keys(item.tamanhos)
                                            .filter(k => k.includes('|'))
                                            .map(k => k.split('|')[0])
                                    )];
                                    return sizes.map(s => `
                                        <div class="size-row" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:6px;">
                                            <input type="text" class="size-name field-input" style="width:90px;" placeholder="Ex: P ou 40" value="${s}" required>
                                            <span style="font-size:12px;color:var(--green);font-weight:600;">NOVO:</span>
                                            <input type="number" class="size-qty-novo field-input" style="width:80px;" value="${item.tamanhos[s+'|NOVO'] ?? 0}" min="0">
                                            <span style="font-size:12px;color:var(--accent);font-weight:600;">HIG:</span>
                                            <input type="number" class="size-qty-hig field-input" style="width:80px;" value="${item.tamanhos[s+'|HIGIENIZADO'] ?? 0}" min="0">
                                            <button type="button" onclick="this.parentElement.remove()" class="btn-icon" style="color:var(--red)"><i class="ph-bold ph-trash"></i></button>
                                        </div>`).join('');
                                } else {
                                    return Object.entries(item.tamanhos).map(([s, q]) => `
                                        <div class="flex gap-3 items-center size-row mb-2" style="display:flex;gap:10px;align-items:center;">
                                            <input type="text" class="size-name field-input" style="width:120px;" placeholder="Ex: 40 ou M" value="${s}" required>
                                            <input type="number" class="size-qty field-input" style="width:100px;" placeholder="Qtd" value="${q}" min="0" required>
                                            <button type="button" onclick="this.parentElement.remove()" class="btn-icon" style="color:var(--red)"><i class="ph-bold ph-trash"></i></button>
                                        </div>`).join('');
                                }
                            })()}
                        </div>
                        <button type="button" id="addSizeBtn" onclick="addSizeRow()" class="btn-secondary" style="margin-top:10px;">
                            <i class="ph ph-plus"></i> Adicionar Tamanho
                        </button>
                    </div>
                </div>

                <div class="row-end" style="padding-top:8px;">
                    <button type="button" onclick="goBack()" class="btn-ghost">CANCELAR</button>
                    <button type="submit" class="btn-primary" style="min-width:140px;">
                        <i class="ph ph-floppy-disk"></i> ${item.id ? 'SALVAR' : 'CADASTRAR'}
                    </button>
                </div>
            </form>
        </div>
    </div>
</div>
    `;
}

function renderContagem() {
    const vinculoOn = isVinculoAlmoxEnabled();
    const activeWhId = getContagemWarehouseId();
    const activeWhNome = state.warehouses.find(w => w.id === activeWhId)?.nome || activeWhId;
    const alm2Items = state.items
        .filter(i => (i.warehouse_id || 'alm-1') === activeWhId)
        .sort((a, b) => a.nome.localeCompare(b.nome));

    if (state.contagem.loading) {
        return `
        <div class="page-wrap">
            ${renderHeader()}
            <div class="page-content-sm">
                <div class="card" style="text-align:center;padding:48px;">
                    <div class="loading-spinner" style="margin:0 auto 16px;"></div>
                    <p style="color:var(--text-2);">Carregando contagem...</p>
                </div>
            </div>
        </div>`;
    }

    // ---- Helper: tabela de resultado (usada no result e no histórico) ----
    function buildRelatorioTable(itens) {
        // itens = [{ item_name, c1_qtd, c2_qtd, c3_qtd, saida (turno), saida_adm }]
        const hasC3 = itens.some(r => r.c3_qtd != null);
        return `<div style="overflow-x:auto;">
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
                <thead>
                    <tr style="border-bottom:2px solid var(--border);">
                        <th style="text-align:left;padding:8px 4px 8px 0;color:var(--text-3);font-weight:600;font-size:11px;text-transform:uppercase;">Item</th>
                        <th style="text-align:right;padding:8px 4px;color:var(--text-3);font-weight:600;font-size:11px;text-transform:uppercase;white-space:nowrap;" title="Estoque fim do turno anterior">C1</th>
                        <th style="text-align:right;padding:8px 4px;color:var(--text-3);font-weight:600;font-size:11px;text-transform:uppercase;white-space:nowrap;" title="Conferência ao chegar">C2</th>
                        ${hasC3 ? `<th style="text-align:right;padding:8px 4px;color:var(--text-3);font-weight:600;font-size:11px;text-transform:uppercase;white-space:nowrap;" title="Pós distribuição ADM">C3</th>` : ''}
                        <th style="text-align:right;padding:8px 4px;color:var(--text-3);font-weight:600;font-size:11px;text-transform:uppercase;white-space:nowrap;">Consumo Turno</th>
                        ${hasC3 ? `<th style="text-align:right;padding:8px 0 8px 4px;color:var(--text-3);font-weight:600;font-size:11px;text-transform:uppercase;white-space:nowrap;">Dist. ADM</th>` : ''}
                    </tr>
                </thead>
                <tbody>
                    ${itens.map(r => {
            const saidaTurno = r.saida;
            const saidaADM = r.saida_adm ?? null;
            let consumidoCell;
            if (saidaTurno === null || saidaTurno === undefined) {
                consumidoCell = `<span style="color:var(--text-3);font-size:11px;">sem C1</span>`;
            } else if (saidaTurno > 0) {
                consumidoCell = `<strong style="color:var(--red);">${saidaTurno}</strong>`;
            } else if (saidaTurno < 0) {
                consumidoCell = `<span style="color:var(--green);font-size:12px;">+${Math.abs(saidaTurno)} rep.</span>`;
            } else {
                consumidoCell = `<span style="color:var(--text-3);">—</span>`;
            }
            let admCell = '';
            if (hasC3) {
                if (saidaADM === null || saidaADM === undefined) {
                    admCell = `<td style="padding:10px 0 10px 4px;text-align:right;"><span style="color:var(--text-3);font-size:11px;">—</span></td>`;
                } else if (saidaADM > 0) {
                    admCell = `<td style="padding:10px 0 10px 4px;text-align:right;"><strong style="color:#e67e00;">${saidaADM}</strong></td>`;
                } else {
                    admCell = `<td style="padding:10px 0 10px 4px;text-align:right;"><span style="color:var(--text-3);">—</span></td>`;
                }
            }
            return `<tr style="border-bottom:1px solid var(--border);">
                            <td style="padding:10px 4px 10px 0;font-weight:500;">${r.item_name}</td>
                            <td style="padding:10px 4px;text-align:right;color:var(--text-2);">${r.c1_qtd ?? '—'}</td>
                            <td style="padding:10px 4px;text-align:right;color:var(--text-2);">${r.c2_qtd ?? '—'}</td>
                            ${hasC3 ? `<td style="padding:10px 4px;text-align:right;color:var(--text-2);">${r.c3_qtd ?? '—'}</td>` : ''}
                             <td style="padding:10px 4px;text-align:right;">${consumidoCell}</td>
                             ${admCell}
                         </tr>`;
        }).join('')}
                </tbody>
            </table>
        </div>`;
    }

    // ---- Helper: formulário de contagem ----
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
            return `<div class="card"><div class="empty-state">
                <i class="ph ph-package"></i>
                <p>Nenhum item cadastrado em ${activeWhNome}</p>
                <div style="margin-top:16px;"><button onclick="navigateTo('stock')" class="btn-secondary">Ver Estoque</button></div>
            </div></div>`;
        }

        const hasC1done = Object.values(state.contagem.todayCounts).some(c => c.c1);
        const hasC2done = Object.values(state.contagem.todayCounts).some(c => c.c2);
        const hasC3done = Object.values(state.contagem.todayCounts).some(c => c.c3);

        const sess = state.contagem.currentSession;
        const sessionId = state.contagem.turno || '';
        const isSession = isSessionId(sessionId);

        // Banner de contexto da sessão
        const turnoInfo = sessionId
            ? `<div style="display:flex;align-items:center;gap:10px;padding:10px 16px;
                          background:var(--bg-2);border-bottom:1px solid var(--border);flex-wrap:wrap;">
                   <span style="font-size:12px;color:var(--text-2);font-weight:600;">${formatDate(state.contagem.date)}</span>
                   ${isSession && sess ? `
                     <span style="font-size:11px;color:var(--text-3);">|</span>
                     ${turnoBadge(sess.turno_noite)} <span style="font-size:11px;color:var(--text-3);">19:00 → 07:00</span>
                     <span style="font-size:11px;color:var(--text-3);">·</span>
                     ${turnoBadge(sess.turno_dia)} <span style="font-size:11px;color:var(--text-3);">ADM</span>
                   ` : ''}
               </div>` : '';

        // Badge de warehouse vinculado (quando diferente do padrão)
        const whBadge = (vinculoOn && activeWhId !== 'alm-2')
            ? `<div style="display:flex;align-items:center;gap:6px;padding:6px 16px;
                          background:#fff8e7;border-bottom:1px solid #f0d080;font-size:11px;color:#7a5900;font-weight:600;">
                   <i class="ph-fill ph-warehouse"></i>
                   Contando em: ${activeWhNome}
               </div>`
            : '';

        // Sublabels das colunas — horários sempre fixos
        const c1Sub = sess
            ? `19:00 · Turno ${sess.turno_noite || '—'}`
            : '19:00 · Turno Noite';
        const c2Sub = '07:00 · Conferência';
        const c3Sub = sess
            ? `ADM + Turno ${sess.turno_dia || '—'}`
            : 'ADM + Turno Dia';

        function colHeader(n, label, sublabel, done) {
            const clr = done ? 'var(--green)' : n === num ? 'var(--accent)' : 'var(--text-2)';
            const bg = done ? '#e8f5ee' : n === num ? '#eef2ff' : 'var(--bg-2)';
            const bdr = done ? 'var(--green)' : n === num ? 'var(--accent)' : 'var(--border)';
            return `<th style="padding:10px 6px;text-align:center;background:${bg};border-left:1px solid var(--border);border-bottom:2px solid ${bdr};min-width:110px;cursor:pointer;"
                        onclick="state.contagem.contagemStep=${n};render()">
                <div style="display:flex;flex-direction:column;align-items:center;gap:2px;">
                    <span style="font-weight:800;font-size:14px;color:${clr};">${label}</span>
                    <span style="font-size:10px;color:${clr};opacity:0.85;white-space:nowrap;">${sublabel}</span>
                    ${done ? `<span style="font-size:9px;font-weight:700;color:var(--green);">SALVO</span>` : ''}
                </div>
            </th>`;
        }

        // Expande itens com variações em múltiplas linhas (uma por variação)
        function expandItemRows(item) {
            if (!item.tamanhos || Object.keys(item.tamanhos).length === 0) {
                return [{ item, varKey: null }];
            }
            return Object.keys(item.tamanhos).map(varKey => ({ item, varKey }));
        }

        const expandedRows = alm2Items.flatMap(expandItemRows);

        const tableRows = expandedRows.map(({ item, varKey }, idx) => {
            const ek = varKey ? `${item.id}::${varKey}` : item.id;
            const saved1 = state.contagem.todayCounts[ek]?.c1;
            const saved2 = state.contagem.todayCounts[ek]?.c2;
            const saved3 = state.contagem.todayCounts[ek]?.c3;
            const val1 = state.contagem.entries1[ek] ?? '';
            const val2 = state.contagem.entries2[ek] ?? '';
            const val3 = state.contagem.entries3[ek] ?? '';
            const rowBg = idx % 2 === 0 ? 'var(--bg-1)' : 'var(--bg-2)';
            const cell1Bg = saved1 ? '#e8f5ee' : val1 !== '' ? '#f0f4ff' : rowBg;
            const cell2Bg = saved2 ? '#e8f5ee' : val2 !== '' ? '#f0f4ff' : rowBg;
            const cell3Bg = saved3 ? '#e8f5ee' : val3 !== '' ? '#f0f4ff' : rowBg;
            const parsed = varKey ? parseVariationKey(varKey) : {};
            const condColor = parsed.condicao === 'NOVO' ? 'var(--green)'
                : parsed.condicao === 'HIGIENIZADO' ? 'var(--accent)' : 'var(--text-2)';
            function cellInput(stKey, val, cellBg) {
                return `<td style="padding:3px 4px;background:${cellBg};border-left:1px solid var(--border);text-align:center;">
                    <input type="number" min="0" placeholder="—" value="${val}"
                        style="width:72px;height:32px;border:1px solid var(--border);border-radius:6px;text-align:center;
                               font-size:13px;font-weight:600;background:transparent;color:var(--text-1);
                               outline:none;padding:0 4px;"
                        onfocus="this.style.borderColor='var(--accent)';this.style.boxShadow='0 0 0 2px var(--accent-glow)'"
                        onblur="this.style.borderColor='var(--border)';this.style.boxShadow=''"
                        oninput="state.contagem.${stKey}['${ek}']=this.value">
                </td>`;
            }
            return `<tr style="border-bottom:1px solid var(--border);">
                <td style="padding:9px 12px;font-weight:500;font-size:13px;background:${rowBg};white-space:nowrap;">
                    ${item.nome}
                    ${varKey ? `<span style="font-size:11px;color:${condColor};font-weight:700;margin-left:6px;">— ${formatVariationLabel(varKey)}</span>` : ''}
                    <span style="font-size:10px;color:var(--text-3);font-weight:400;margin-left:4px;">${item.unidade}</span>
                </td>
                ${cellInput('entries1', val1, cell1Bg)}
                ${cellInput('entries2', val2, cell2Bg)}
                ${cellInput('entries3', val3, cell3Bg)}
            </tr>`;
        }).join('');

        function saveBtn(n, done) {
            const saving = state.contagem.saving;
            const clr = done ? 'var(--green)' : 'var(--accent)';
            const lbl = saving
                ? `<span class="loading-spinner" style="width:12px;height:12px;border-width:2px;"></span>`
                : done ? `<i class="ph-fill ph-check-circle"></i> C${n} OK` : `Salvar C${n}`;
            return `<td style="padding:8px 6px;text-align:center;border-left:1px solid var(--border);">
                <button onclick="saveContagem(${n})" ${saving ? 'disabled' : ''}
                    style="font-size:11px;padding:6px 14px;border-radius:6px;border:1.5px solid ${clr};
                           background:${done ? '#e8f5ee' : 'var(--accent)'};color:${done ? 'var(--green)' : '#fff'};
                           font-weight:700;cursor:pointer;white-space:nowrap;"
                    onmouseover="this.style.opacity='.8'" onmouseout="this.style.opacity='1'">
                    ${lbl}
                </button>
            </td>`;
        }

        return `<div class="card" style="padding:0;overflow:hidden;">
            ${turnoInfo}
            ${whBadge}
            <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;">
                <table style="width:100%;border-collapse:collapse;font-size:13px;">
                    <thead>
                        <tr style="border-bottom:2px solid var(--border);">
                            <th style="padding:10px 12px;text-align:left;background:var(--bg-2);font-size:12px;font-weight:700;color:var(--text-2);white-space:nowrap;">
                                EPI's
                                <span style="font-size:10px;font-weight:400;color:var(--text-3);margin-left:4px;">(${alm2Items.length} itens · ${expandedRows.length} linhas)</span>
                            </th>
                             ${colHeader(1, 'C1', c1Sub, hasC1done)}
                             ${colHeader(2, 'C2', c2Sub, hasC2done)}
                             ${colHeader(3, 'C3', c3Sub, hasC3done)}
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRows}
                    </tbody>
                    <tfoot>
                        <tr style="border-top:2px solid var(--border);background:var(--bg-2);">
                            <td style="padding:10px 12px;font-size:11px;color:var(--text-3);">
                                ${hasC1done && hasC2done && hasC3done
                ? `<span style="color:var(--green);font-weight:700;">✓ Todas as contagens salvas</span>`
                : 'Preencha e salve cada coluna'}
                            </td>
                            ${saveBtn(1, hasC1done)}
                            ${saveBtn(2, hasC2done)}
                            ${saveBtn(3, hasC3done)}
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>`;
    }

    // ---- Helper: fluxo de nova contagem — formulário de sessão ----
    function buildNewContagemFlow() {
        const step = state.contagem.newStep;
        const sess = state.contagem.currentSession || {};

        // Passo 1: formulário de configuração da sessão
        if (step === 1) {
            function turnoOpts(selected, onChangeFn) {
                return ['A', 'B', 'C', 'D'].map(t => {
                    const sel = selected === t;
                    return '<button type="button"'
                        + ' onclick="' + onChangeFn + '(\'' + t + '\');render()"'
                        + ' style="padding:10px 18px;border-radius:8px;border:2px solid ' + (sel ? turnoColor(t) : 'var(--border)') + ';'
                        + 'background:' + (sel ? turnoBg(t) : 'var(--bg-1)') + ';'
                        + 'color:' + (sel ? turnoColor(t) : 'var(--text-2)') + ';'
                        + 'font-weight:' + (sel ? '800' : '600') + ';font-size:14px;cursor:pointer;transition:all .12s;">'
                        + ' Turno ' + t
                        + '</button>';
                }).join('');
            }

            const noite = sess.turno_noite || '';
            const dia = sess.turno_dia || '';

            return `<div class="card-lg">
                <div style="margin-bottom:20px;">
                    <div style="font-weight:700;font-size:15px;color:var(--text-1);margin-bottom:4px;">Nova Contagem</div>
                    <p style="font-size:12px;color:var(--text-3);">Selecione a data e os turnos para iniciar.</p>
                </div>
                <div class="stack-sm">

                    <!-- Data -->
                    <div class="field-group">
                        <label class="field-label">Data da contagem</label>
                        <input class="field-input" type="date" value="${state.contagem.date}"
                            onchange="state.contagem.date=this.value;state.contagem.entries1={};state.contagem.entries2={};state.contagem.entries3={};state.contagem.todayCounts={};render();">
                    </div>

                    <!-- Turno Noite (C1) — fixo 19:00 → 07:00 -->
                    <div style="border:1px solid var(--border);border-radius:10px;padding:14px;background:var(--bg-2);">
                        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                            <div style="font-weight:700;font-size:13px;color:var(--text-1);">Turno da Noite</div>
                            <span style="font-size:11px;font-weight:600;color:var(--text-3);background:var(--bg-3);padding:2px 8px;border-radius:4px;">19:00 → 07:00</span>
                        </div>
                        <p style="font-size:11px;color:var(--text-3);margin-bottom:10px;">Quem está de plantão na noite?</p>
                        <div style="display:flex;gap:8px;flex-wrap:wrap;">
                            ${turnoOpts(noite, 'setTurnoNoite')}
                        </div>
                    </div>

                    <!-- ADM + Turno Dia (C3) -->
                    <div style="border:1px solid var(--border);border-radius:10px;padding:14px;background:var(--bg-2);">
                        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                            <div style="font-weight:700;font-size:13px;color:var(--text-1);">ADM + Turno do Dia</div>
                        </div>
                        <p style="font-size:11px;color:var(--text-3);margin-bottom:10px;">Quem divide o dia com o ADM?</p>
                        <div style="display:flex;gap:8px;flex-wrap:wrap;">
                            ${turnoOpts(dia, 'setTurnoDia')}
                        </div>
                    </div>

                    <!-- Fim de Semana -->
                    <div style="border:1px solid var(--border);border-radius:10px;overflow:hidden;">
                        <button type="button" onclick="toggleFDS()"
                            style="width:100%;display:flex;align-items:center;justify-content:space-between;
                                   padding:12px 14px;background:${sess.isFDS ? '#eef2ff' : 'var(--bg-2)'};
                                   border:none;cursor:pointer;gap:10px;">
                            <div style="display:flex;align-items:center;gap:8px;">
                                <i class="ph ${sess.isFDS ? 'ph-calendar-check' : 'ph-calendar'}"
                                   style="font-size:16px;color:${sess.isFDS ? 'var(--accent)' : 'var(--text-3)'}"></i>
                                <span style="font-weight:700;font-size:13px;color:${sess.isFDS ? 'var(--accent)' : 'var(--text-2)'}">
                                    Final de Semana
                                </span>
                            </div>
                            <div style="width:36px;height:20px;border-radius:10px;
                                        background:${sess.isFDS ? 'var(--accent)' : 'var(--border)'};
                                        position:relative;transition:background .2s;">
                                <div style="width:16px;height:16px;border-radius:50%;background:#fff;
                                            position:absolute;top:2px;
                                            left:${sess.isFDS ? '18px' : '2px'};transition:left .2s;"></div>
                            </div>
                        </button>

                        ${sess.isFDS ? `
                        <div style="padding:12px 14px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:8px;">
                            <div style="font-size:11px;color:var(--text-3);margin-bottom:2px;">
                                Liste os turnos que cobriram o período:
                            </div>
                            ${(sess.turnosWeekend || []).map((t, i) => `
                            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                                <input type="date" value="${t.data && /^\d{4}-\d{2}-\d{2}$/.test(t.data) ? t.data : ''}"
                                    onchange="setWeekendShift(${i},'data',this.value)"
                                    style="padding:7px 8px;border:1px solid var(--border);border-radius:7px;
                                           font-size:13px;font-weight:600;color:var(--text-1);">
                                <div style="display:flex;gap:4px;">
                                    ${['A','B','C','D'].map(l => `
                                    <button type="button" onclick="setWeekendShift(${i},'letra','${l}')"
                                        style="width:30px;height:30px;border-radius:6px;border:2px solid ${t.letra===l?turnoColor(l):'var(--border)'};
                                               background:${t.letra===l?turnoBg(l):'transparent'};
                                               color:${t.letra===l?turnoColor(l):'var(--text-3)'};
                                               font-weight:800;font-size:12px;cursor:pointer;">${l}</button>`).join('')}
                                </div>
                                <div style="display:flex;gap:4px;">
                                    ${['19 A 07','07 A 19'].map(h => `
                                    <button type="button" onclick="setWeekendShift(${i},'horario','${h}')"
                                        style="padding:5px 10px;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;
                                               border:2px solid ${t.horario===h?'var(--accent)':'var(--border)'};
                                               background:${t.horario===h?'var(--accent)':'transparent'};
                                               color:${t.horario===h?'#fff':'var(--text-3)'};">
                                        ${h}</button>`).join('')}
                                </div>
                                <button type="button" onclick="removeWeekendShift(${i})"
                                    style="width:28px;height:28px;border-radius:6px;border:1px solid var(--border);
                                           background:transparent;color:var(--red);cursor:pointer;font-size:14px;
                                           display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                                    <i class="ph ph-trash"></i>
                                </button>
                            </div>`).join('')}
                            <button type="button" onclick="addWeekendShift()"
                                style="display:flex;align-items:center;gap:6px;padding:7px 12px;border-radius:7px;
                                       border:1px dashed var(--accent);background:transparent;
                                       color:var(--accent);font-size:12px;font-weight:600;cursor:pointer;margin-top:2px;">
                                <i class="ph ph-plus"></i> Adicionar turno
                            </button>
                        </div>` : ''}
                    </div>

                    <!-- Botões -->
                    <div style="display:flex;gap:10px;margin-top:4px;">
                        <button onclick="state.contagem.tab='home';render()" class="btn-secondary">
                            <i class="ph ph-arrow-left"></i> Cancelar
                        </button>
                        <button class="btn-primary" style="flex:1;"
                            onclick="startContagemSession()">
                            <i class="ph-fill ph-clipboard-text"></i> Iniciar Contagem
                        </button>
                    </div>
                </div>
            </div>`;
        }

        // step 3: exibe a tabela de contagem (step 2 foi eliminado)
        const cStep = state.contagem.contagemStep || 1;
        return buildCountForm(cStep);
    }


    // ---- Relatorio inteligente por turno ----
    let resultContent = '';
    if (state.contagem.savedResult && state.contagem.tab === 'newContagem') {
        const rSess = state.contagem.currentSession;
        const result = state.contagem.savedResult;
        const baixaKey = state.contagem.turno
            ? `${state.contagem.date}_${state.contagem.turno}`
            : state.contagem.date;
        const baixaJaFeita = state.contagem.baixaAplicada || state.contagem.baixaDates[baixaKey];

        // ---- Tabela de consumo por secao ----
        function sectionTable(items, col1Label, col2Label, diffLabel, diffFn) {
            const rows = items.map(r => {
                const v1 = r[col1Label] ?? null;
                const v2 = r[col2Label] ?? null;
                const diff = (v1 !== null && v2 !== null) ? diffFn(v1, v2) : null;
                const diffColor = diff > 0 ? 'var(--red)' : diff === 0 ? 'var(--text-3)' : 'var(--text-2)';
                return `<tr style="border-bottom:1px solid var(--border);">
                    <td style="padding:8px 10px;font-weight:500;font-size:13px;">${r.item_name}</td>
                    <td style="padding:8px 6px;text-align:right;font-size:13px;color:var(--text-2);">${v1 ?? '—'}</td>
                    <td style="padding:8px 6px;text-align:right;font-size:13px;color:var(--text-2);">${v2 ?? '—'}</td>
                    <td style="padding:8px 10px;text-align:right;font-weight:700;font-size:13px;color:${diffColor};">
                        ${diff !== null ? (diff > 0 ? '−' + diff : diff === 0 ? '0' : '+' + Math.abs(diff)) : '—'}
                    </td>
                </tr>`;
            }).join('');
            const totalDiff = items.reduce((acc, r) => {
                const v1 = r[col1Label]; const v2 = r[col2Label];
                return acc + (v1 !== null && v2 !== null ? diffFn(v1, v2) : 0);
            }, 0);
            return `<div style="overflow-x:auto;">
                <table style="width:100%;border-collapse:collapse;font-size:13px;">
                    <thead><tr style="background:var(--bg-2);border-bottom:2px solid var(--border);">
                        <th style="padding:8px 10px;text-align:left;font-size:11px;color:var(--text-3);font-weight:700;">Item</th>
                        <th style="padding:8px 6px;text-align:right;font-size:11px;color:var(--text-3);font-weight:700;">${col1Label.toUpperCase()}</th>
                        <th style="padding:8px 6px;text-align:right;font-size:11px;color:var(--text-3);font-weight:700;">${col2Label.toUpperCase()}</th>
                        <th style="padding:8px 10px;text-align:right;font-size:11px;color:var(--text-3);font-weight:700;">${diffLabel}</th>
                    </tr></thead>
                    <tbody>${rows}</tbody>
                    <tfoot><tr style="background:var(--bg-2);border-top:2px solid var(--border);">
                        <td colspan="3" style="padding:8px 10px;font-size:12px;font-weight:700;">Total consumido</td>
                        <td style="padding:8px 10px;text-align:right;font-weight:800;font-size:14px;color:${totalDiff > 0 ? 'var(--red)' : 'var(--text-2)'};">
                            ${totalDiff > 0 ? '−' + totalDiff : totalDiff}
                        </td>
                    </tr></tfoot>
                </table>
            </div>`;
        }

        const turnoNoite = rSess?.turno_noite
            ? `TURNO ${rSess.turno_noite} — 19:00 A 07:00`
            : 'Turno Noite — 19:00 A 07:00';
        const turnoDiaAdm = rSess?.turno_dia
            ? `ADM + TURNO ${rSess.turno_dia}`
            : 'ADM + Turno Dia';
        const sessionId = state.contagem.turno || '';

        const totalC1C2 = result.reduce((a, r) => a + ((r.c1_qtd != null && r.c2_qtd != null) ? Math.max(0, r.c1_qtd - r.c2_qtd) : 0), 0);
        const totalC2C3 = result.reduce((a, r) => a + ((r.c2_qtd != null && r.c3_qtd != null) ? Math.max(0, r.c2_qtd - r.c3_qtd) : 0), 0);

        resultContent = `<div style="display:flex;flex-direction:column;gap:14px;">

            <!-- Cabecalho da sessao -->
            <div class="card" style="padding:14px 16px;">
                <div style="display:flex;flex-direction:column;gap:6px;">
                    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                        <span style="font-weight:800;font-size:15px;color:var(--text-1);">Relatório de Distribuição Almoxarifado</span>
                        <span style="font-size:12px;color:var(--text-3);">${formatDate(state.contagem.date)}</span>
                        ${rSess ? `
                        <span style="font-size:12px;color:var(--text-3);">·</span>
                        ${turnoBadge(rSess.turno_noite)} <span style="font-size:12px;color:var(--text-3);">noite</span>
                        <span style="font-size:12px;color:var(--text-3);">·</span>
                        ${turnoBadge(rSess.turno_dia)} <span style="font-size:12px;color:var(--text-3);">dia</span>` : ''}
                    </div>
                    ${(() => {
                        const fds = parseFDS(rSess?.observacao);
                        if (!fds) return '';
                        const linhas = fds.turnos.map(t =>
                            `<span style="display:inline-flex;align-items:center;gap:6px;font-size:11px;">
                                <span style="font-weight:600;color:var(--text-2);">${t.data && /^\d{4}-\d{2}-\d{2}$/.test(t.data) ? t.data.slice(8,10)+'/'+t.data.slice(5,7) : (t.data||'')}</span>
                                ${turnoBadge(t.letra)}
                                <span style="color:var(--text-3);">${t.horario}</span>
                            </span>`
                        ).join('<span style="color:var(--border);margin:0 4px;">|</span>');
                        return `<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:2px;">
                            <span style="font-size:11px;font-weight:700;color:var(--orange);text-transform:uppercase;letter-spacing:.04em;">Final de Semana</span>
                            <span style="color:var(--border);">·</span>
                            ${linhas}
                        </div>`;
                    })()}
                </div>
            </div>

            <!-- Secao Turno Noite -->
            <div class="card" style="padding:0;overflow:hidden;">
                <div style="padding:12px 16px;border-bottom:2px solid var(--border);background:var(--bg-2);
                            display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
                    <div>
                        <div style="font-weight:700;font-size:13px;color:var(--text-1);">${turnoNoite}</div>
                        <div style="font-size:11px;color:var(--text-3);">Consumo = C1 - C2</div>
                    </div>
                    <span style="font-size:20px;font-weight:800;color:${totalC1C2>0?'var(--red)':'var(--text-3)'};">${totalC1C2>0?'−'+totalC1C2:'0'} unid</span>
                </div>
                ${sectionTable(result, 'c1_qtd', 'c2_qtd', 'Consumido', (a, b) => Math.max(0, a - b))}
            </div>

            <!-- Secao ADM + Turno Dia -->
            <div class="card" style="padding:0;overflow:hidden;">
                <div style="padding:12px 16px;border-bottom:2px solid var(--border);background:var(--bg-2);
                            display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
                    <div>
                        <div style="font-weight:700;font-size:13px;color:var(--text-1);">${turnoDiaAdm}</div>
                        <div style="font-size:11px;color:var(--text-3);">Distribuido = C2 - C3</div>
                    </div>
                    <span style="font-size:20px;font-weight:800;color:${totalC2C3>0?'var(--orange)':'var(--text-3)'};">${totalC2C3>0?'−'+totalC2C3:'0'} unid</span>
                </div>
                ${sectionTable(result, 'c2_qtd', 'c3_qtd', 'Distribuido', (a, b) => Math.max(0, a - b))}
            </div>

            <!-- Acoes -->
            <div class="card" style="padding:14px 16px;">
                ${baixaJaFeita
                ? `<div style="display:flex;align-items:center;gap:8px;background:#e8f5ee;color:var(--green);padding:10px 14px;border-radius:8px;font-size:13px;font-weight:600;border:1px solid var(--green);margin-bottom:12px;">
                           <i class="ph-fill ph-check-circle" style="font-size:16px;"></i>
                           Baixa ja aplicada no estoque do Almoxarifado 2
                       </div>`
                : `<div style="background:#fff8e1;border:1px solid #ffc107;border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:12px;color:#7a5800;">
                           Baixa pendente &mdash; clique em &ldquo;Dar Baixa&rdquo; para atualizar o estoque.
                       </div>`
            }
                <div style="display:flex;gap:10px;flex-wrap:wrap;">
                    <button onclick="switchContagemTab('history')" class="btn-secondary">
                        <i class="ph ph-clock-counter-clockwise"></i> Ver Historico
                    </button>
                    <button onclick="state.contagem.savedResult=null;state.contagem.newStep=3;render()" class="btn-secondary">
                        <i class="ph ph-pencil"></i> Corrigir Contagem
                    </button>
                    <button onclick="copiarRelatorioWhatsApp()" class="btn-secondary" title="Copiar relatorio formatado para WhatsApp" style="gap:6px;">
                        <i class="ph ph-copy"></i> Copiar WhatsApp
                    </button>
                    ${baixaJaFeita ? '' : `
                    <button onclick="aplicarBaixaContagem()" class="btn-primary" style="flex:1;background:var(--green);" ${state.contagem.saving ? 'disabled' : ''}>
                        <i class="ph-fill ph-arrow-fat-lines-down"></i> Dar Baixa no Almoxarifado 2
                    </button>`}
                </div>
            </div>

        </div>`;
    }
    // ---- Histórico ----
    let historyContent = '';
    if (state.contagem.tab === 'history') {
        if (state.contagem.historyLoading) {
            historyContent = `<div class="card" style="text-align:center;padding:48px;">
                <div class="loading-spinner" style="margin:0 auto 16px;"></div>
                <p style="color:var(--text-2);">Carregando histórico...</p>
            </div>`;
        } else if (state.contagem.history.length === 0) {
            historyContent = `<div class="card"><div class="empty-state">
                <i class="ph ph-clipboard-text"></i>
                <p>Nenhuma contagem registrada ainda</p>
            </div></div>`;
        } else {
            // ---- Filtro de turno ----
            const turnoFilterBar = `
                <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;">
                    ${['TODOS', 'A', 'B', 'C', 'D'].map(t => `
                        <button onclick="state.contagem.historyTurnoFilter='${t}';render()"
                            style="padding:6px 14px;border-radius:20px;border:1px solid ${t === 'TODOS' ? 'var(--border)' : turnoColor(t)};
                                   background:${state.contagem.historyTurnoFilter === t ? (t === 'TODOS' ? 'var(--bg-3)' : turnoBg(t)) : 'transparent'};
                                   color:${t === 'TODOS' ? 'var(--text-2)' : turnoColor(t)};font-size:12px;font-weight:600;cursor:pointer;">
                            ${t === 'TODOS' ? 'Todos' : `Turno ${t}`}
                        </button>`).join('')}
                </div>`;

            // ---- Agrupamento por (date, turno) ----
            const allRows = state.contagem.history;
            const histGroups = {};
            allRows.forEach(row => {
                const key = `${row.date}_${row.turno || 'null'}`;
                if (!histGroups[key]) {
                    histGroups[key] = { date: row.date, turno: row.turno || null, horario: row.horario || '', c1Map: {}, c2Map: {}, c3Map: {} };
                }
                if (row.contagem_num === 1) histGroups[key].c1Map[row.item_id] = row;
                if (row.contagem_num === 2) histGroups[key].c2Map[row.item_id] = row;
                if (row.contagem_num === 3) histGroups[key].c3Map[row.item_id] = row;
            });

            const filteredHistGroups = Object.values(histGroups)
                .filter(g => state.contagem.historyTurnoFilter === 'TODOS' || (!isSessionId(g.turno) && g.turno === state.contagem.historyTurnoFilter))
                .sort((a, b) => b.date.localeCompare(a.date));

            const histCards = [];
            filteredHistGroups.forEach(g => {
                const { date, turno, horario, c1Map, c2Map, c3Map } = g;
                const baixaKey = turno ? `${date}_${turno}` : date;
                const baixaFeita = state.contagem.baixaDates[baixaKey];

                if (Object.keys(c3Map).length > 0 || Object.keys(c2Map).length > 0) {
                    const allItemIds = new Set([...Object.keys(c1Map), ...Object.keys(c2Map), ...Object.keys(c3Map)]);
                    const itens = Array.from(allItemIds).map(itemId => {
                        const c1 = c1Map[itemId];
                        const c2 = c2Map[itemId];
                        const c3 = c3Map[itemId];
                        const saida = (c1 != null && c2 != null) ? c1.quantidade - c2.quantidade : null;
                        const saida_adm = (c2 != null && c3 != null) ? c2.quantidade - c3.quantidade : null;
                        return {
                            item_id: itemId,
                            item_name: (c1 || c2 || c3).item_name,
                            c1_qtd: c1?.quantidade ?? null,
                            c2_qtd: c2?.quantidade ?? null,
                            c3_qtd: c3?.quantidade ?? null,
                            saida,
                            saida_adm
                        };
                    });
                    const totalConsumo = itens.filter(r => r.saida > 0).length;
                    const statusLabel = Object.keys(c3Map).length > 0 ? 'Relatório completo' : 'Aguardando C3 (ADM)';
                    const resumoBadge = totalConsumo > 0
                        ? `<span class="badge badge-red">${totalConsumo} consumido(s)</span>`
                        : `<span class="badge badge-green">sem consumo</span>`;
                    const baixaBadge = baixaFeita
                        ? `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:var(--green);font-weight:600;"><i class="ph-fill ph-check-circle"></i> Baixa aplicada</span>`
                        : '';

                    const sessObs = (isSessionId(turno) && state.contagem.sessionMap)
                        ? (state.contagem.sessionMap[turno] || {})
                        : {};
                    const c1DateDisp = sessObs.c1_date ? sessObs.c1_date.slice(8,10)+'/'+sessObs.c1_date.slice(5,7) : formatDate(date).slice(0,5);
                    const c2DateDisp = sessObs.c2_date ? sessObs.c2_date.slice(8,10)+'/'+sessObs.c2_date.slice(5,7) : formatDate(date).slice(0,5);
                    const c3DateDisp = sessObs.c3_date ? sessObs.c3_date.slice(8,10)+'/'+sessObs.c3_date.slice(5,7) : formatDate(date).slice(0,5);
                    const c1DateVal = sessObs.c1_date || date;
                    const c2DateVal = sessObs.c2_date || date;
                    const c3DateVal = sessObs.c3_date || date;

                    histCards.push(`<div class="card">
                        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px;gap:8px;flex-wrap:wrap;">
                            <div>
                                <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap;">
                                    <span style="font-weight:700;font-size:14px;">${formatDate(date)}</span>
                                    ${isSessionId(turno)
                            ? `<span style="font-size:11px;font-weight:700;color:var(--accent);background:#eef2ff;padding:2px 8px;border-radius:4px;letter-spacing:0.03em;">Sessão</span>`
                            : turnoBadge(turno)}
                                    ${horario ? `<span style="font-size:11px;color:var(--text-3);">${horario}</span>` : ''}
                                    ${resumoBadge}
                                </div>
                                <div style="font-size:11px;color:var(--text-3);">${statusLabel} &nbsp;${baixaBadge}</div>
                            </div>
                            <div style="display:flex;gap:6px;flex-shrink:0;flex-wrap:wrap;">
                                <button onclick="viewSessionReport('${date}','${turno || ''}','${horario || ''}')" class="btn-primary" style="font-size:11px;padding:4px 10px;">
                                    <i class="ph ph-file-text"></i> Visualizar
                                </button>
                                <button onclick="editContagemDate('${date}',1,'${turno || ''}','${horario || ''}')" class="btn-secondary" style="font-size:11px;padding:4px 10px;">
                                    <i class="ph ph-pencil"></i> C1
                                </button>
                                <button onclick="editContagemDate('${date}',2,'${turno || ''}','${horario || ''}')" class="btn-secondary" style="font-size:11px;padding:4px 10px;">
                                    <i class="ph ph-pencil"></i> C2
                                </button>
                                <button onclick="editContagemDate('${date}',3,'${turno || ''}','${horario || ''}')" class="btn-secondary" style="font-size:11px;padding:4px 10px;">
                                    <i class="ph ph-pencil"></i> C3
                                </button>
                                <button onclick="showDateChangeModal('${date}','${turno || ''}')" class="btn-secondary" style="font-size:11px;padding:4px 10px;color:var(--accent);border-color:var(--accent);">
                                    <i class="ph ph-calendar-blank"></i> Data
                                </button>
                                <button onclick="deleteContagemDate('${date}',0,'${turno || ''}')" class="btn-secondary" style="font-size:11px;padding:4px 10px;color:var(--red);border-color:var(--red);">
                                    <i class="ph ph-trash"></i> Excluir
                                </button>
                                ${baixaFeita ? `<button onclick="desfazerBaixaContagem('${date}','${turno || ''}')" class="btn-secondary" style="font-size:11px;padding:4px 10px;color:var(--red);border-color:var(--red);">
                                    <i class="ph ph-arrow-counter-clockwise"></i> Desfazer Baixa
                                </button>` : ''}
                            </div>
                        </div>
                        ${isSessionId(turno) ? `<div style="display:flex;gap:16px;flex-wrap:wrap;padding-top:10px;border-top:1px solid var(--border);font-size:12px;color:var(--text-2);">
                            <span>C1 <strong>${c1DateDisp}</strong>
                                <button onclick="showContagemDateModal('${turno}','c1_date','${c1DateVal}','Data da C1')" style="background:none;border:none;cursor:pointer;padding:0 4px;color:var(--accent);font-size:13px;" title="Editar data C1">✏</button>
                            </span>
                            <span>C2 <strong>${c2DateDisp}</strong>
                                <button onclick="showContagemDateModal('${turno}','c2_date','${c2DateVal}','Data da C2')" style="background:none;border:none;cursor:pointer;padding:0 4px;color:var(--accent);font-size:13px;" title="Editar data C2">✏</button>
                            </span>
                            <span>C3 <strong>${c3DateDisp}</strong>
                                <button onclick="showContagemDateModal('${turno}','c3_date','${c3DateVal}','Data da C3')" style="background:none;border:none;cursor:pointer;padding:0 4px;color:var(--accent);font-size:13px;" title="Editar data C3">✏</button>
                            </span>
                        </div>` : ''}
                    </div>`);
                } else if (Object.keys(c1Map).length > 0) {
                    const rowsHtml = Object.values(c1Map).map(row =>
                        `<tr style="border-bottom:1px solid var(--border);">
                            <td style="padding:10px 4px 10px 0;font-weight:500;">${row.item_name}</td>
                            <td style="padding:10px 4px;text-align:right;color:var(--text-2);">${row.quantidade}</td>
                            <td style="padding:10px 4px;text-align:right;color:var(--text-3);">—</td>
                            <td style="padding:10px 0 10px 4px;text-align:right;color:var(--text-3);font-size:11px;">aguardando C2</td>
                        </tr>`
                    ).join('');
                    histCards.push(`<div class="card">
                        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px;gap:8px;flex-wrap:wrap;">
                            <div>
                                <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap;">
                                    <span style="font-weight:700;font-size:14px;">${formatDate(date)}</span>
                                    ${isSessionId(turno)
                            ? `<span style="font-size:11px;font-weight:700;color:var(--accent);background:#eef2ff;padding:2px 8px;border-radius:4px;letter-spacing:0.03em;">Sessão</span>`
                            : turnoBadge(turno)}
                                    ${horario ? `<span style="font-size:11px;color:var(--text-3);">${horario}</span>` : ''}
                                </div>
                                <div style="font-size:11px;color:var(--text-3);">Contagem 1 registrada &nbsp;<span class="badge badge-gray" style="font-size:10px;">C2 pendente</span></div>
                            </div>
                            <div style="display:flex;gap:6px;flex-shrink:0;flex-wrap:wrap;">
                                <button onclick="editContagemDate('${date}',1,'${turno || ''}','${horario || ''}')" class="btn-secondary" style="font-size:11px;padding:4px 10px;">
                                    <i class="ph ph-pencil"></i> Editar
                                </button>
                                <button onclick="showDateChangeModal('${date}','${turno || ''}')" class="btn-secondary" style="font-size:11px;padding:4px 10px;color:var(--accent);border-color:var(--accent);">
                                    <i class="ph ph-calendar-blank"></i> Data
                                </button>
                                <button onclick="deleteContagemDate('${date}',1,'${turno || ''}')" class="btn-secondary" style="font-size:11px;padding:4px 10px;color:var(--red);border-color:var(--red);">
                                    <i class="ph ph-trash"></i> Excluir
                                </button>
                            </div>
                        </div>
                        <div style="overflow-x:auto;">
                            <table style="width:100%;border-collapse:collapse;font-size:13px;">
                                <thead><tr style="border-bottom:2px solid var(--border);">
                                    <th style="text-align:left;padding:8px 4px 8px 0;color:var(--text-3);font-weight:600;font-size:11px;text-transform:uppercase;">Item</th>
                                    <th style="text-align:right;padding:8px 4px;color:var(--text-3);font-weight:600;font-size:11px;text-transform:uppercase;">C1</th>
                                    <th style="text-align:right;padding:8px 4px;color:var(--text-3);font-weight:600;font-size:11px;text-transform:uppercase;">C2</th>
                                    <th style="text-align:right;padding:8px 0 8px 4px;color:var(--text-3);font-weight:600;font-size:11px;text-transform:uppercase;">Consumido</th>
                                </tr></thead>
                                <tbody>${rowsHtml}</tbody>
                            </table>
                        </div>
                    </div>`);
                }
            });

            historyContent = turnoFilterBar + (histCards.join('') || `<div class="card"><div class="empty-state">
                <i class="ph ph-clipboard-text"></i><p>Nenhum registro encontrado</p>
            </div></div>`);
        }
    }

    // ---- Chamados em aberto (usado pela aba Chamados e pelo badge) ----
    const openTickets = state.contagem.openTickets;

    const homeContent = `
        <div class="card">
            <div class="empty-state" style="padding:32px 20px;">
                <i class="ph ph-clipboard-text" style="color:var(--text-3);"></i>
                <p>Inicie uma nova contagem</p>
                <div style="margin-top:16px;">
                    <button onclick="state.contagem.tab='newContagem';state.contagem.newStep=1;render()" class="btn-primary">
                        <i class="ph-fill ph-plus-circle"></i> Nova Contagem
                    </button>
                </div>
            </div>
        </div>`;

    // ---- Chamados tab: lista dedicada de chamados em aberto ----
    const chamadosContent = state.contagem.historyLoading
        ? `<div class="card" style="text-align:center;padding:40px;">
               <div class="loading-spinner" style="margin:0 auto 12px;"></div>
               <p style="color:var(--text-2);font-size:13px;">Carregando chamados...</p>
           </div>`
        : openTickets.length === 0
            ? `<div class="card">
                   <div class="empty-state" style="padding:40px 20px;">
                       <i class="ph ph-check-circle" style="color:var(--green);font-size:40px;"></i>
                       <p style="font-weight:600;color:var(--green);margin-bottom:4px;">Nenhum chamado em aberto</p>
                       <p style="color:var(--text-3);font-size:12px;">Todos os turnos estão em dia!</p>
                       <div style="margin-top:20px;">
                           <button onclick="state.contagem.tab='home';state.contagem.newStep=1;render()" class="btn-primary">
                               <i class="ph-fill ph-plus-circle"></i> Nova Contagem
                           </button>
                       </div>
                   </div>
               </div>`
            : `<div style="display:flex;flex-direction:column;gap:10px;">
                    ${openTickets.map(t => {
                const isSess = isSessionId(t.turno);
                const cor = isSess ? 'var(--accent)' : turnoColor(t.turno);
                const bg = isSess ? '#eef2ff' : turnoBg(t.turno);
                const statusLabel = t.hasC3
                    ? `<span style="font-size:11px;color:var(--green);font-weight:600;"><i class="ph-fill ph-check-circle"></i> C3 feita — aguardando baixa</span>`
                    : t.hasC2
                        ? `<span style="font-size:11px;color:var(--blue,#3b82f6);font-weight:600;"><i class="ph ph-hourglass"></i> C2 feita — aguardando C3 (ADM)</span>`
                        : `<span style="font-size:11px;color:var(--orange);font-weight:600;"><i class="ph ph-clock"></i> C1 registrada — aguardando C2</span>`;
                const actionBtn = t.hasC3
                    ? `<button onclick="viewSessionReport('${t.date}','${t.turno || ''}','${t.horario || ''}')"
                                  class="btn-primary" style="flex:1;font-size:12px;padding:8px 12px;background:var(--green);border-color:var(--green);">
                                  <i class="ph-fill ph-arrow-fat-lines-down"></i> Dar Baixa
                               </button>`
                    : t.hasC2
                        ? `<button onclick="editContagemDate('${t.date}',2,'${t.turno || ''}','${t.horario || ''}')"
                                  class="btn-secondary" style="font-size:12px;padding:8px 12px;">
                                  <i class="ph ph-pencil"></i> Editar C2
                               </button>
                           <button onclick="openTicketForC2('${t.date}','${t.turno || ''}','${t.horario || ''}')"
                                  class="btn-primary" style="flex:1;font-size:12px;padding:8px 12px;">
                                  <i class="ph-fill ph-clipboard-check"></i> Fazer C3 (ADM)
                               </button>`
                        : `<button onclick="editContagemDate('${t.date}',1,'${t.turno || ''}','${t.horario || ''}')"
                                  class="btn-secondary" style="font-size:12px;padding:8px 12px;">
                                  <i class="ph ph-pencil"></i> Editar C1
                               </button>
                           <button onclick="openTicketForC2('${t.date}','${t.turno || ''}','${t.horario || ''}')"
                                  class="btn-secondary" style="flex:1;font-size:12px;padding:8px 12px;">
                                  <i class="ph-fill ph-clipboard-check"></i> Fazer C2
                               </button>`;
                const headerLabel = isSess
                    ? `<span style="font-size:12px;font-weight:800;color:${cor};letter-spacing:0.03em;">SESSÃO</span>`
                    : `<span style="font-weight:800;font-size:26px;color:${cor};font-family:var(--font-display);line-height:1;">${t.turno || '—'}</span>`;
                return `<div style="border:2px solid ${cor};border-radius:12px;padding:14px 16px;background:${bg};display:flex;align-items:center;gap:14px;flex-wrap:wrap;">
                            <div style="display:flex;align-items:center;gap:10px;min-width:${isSess ? '160px' : '100px'};">
                                ${headerLabel}
                                <div>
                                    <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:${cor};">${isSess ? 'Sessao' : 'Turno'}</div>
                                    <div style="font-size:12px;font-weight:600;color:var(--text-1);">${formatDate(t.date)}</div>
                                    ${t.horario ? `<div style="font-size:11px;color:var(--text-3);">${t.horario}</div>` : ''}
                                </div>
                            </div>
                            <div style="flex:1;min-width:120px;">${statusLabel}</div>
                            <div style="display:flex;gap:6px;align-items:center;flex-shrink:0;">
                                ${actionBtn}
                                <button onclick="deleteContagemDate('${t.date}',1,'${t.turno || ''}')"
                                    style="font-size:11px;color:var(--text-3);background:none;border:none;cursor:pointer;padding:8px 6px;" title="Excluir">
                                    <i class="ph ph-trash"></i>
                                </button>
                            </div>
                        </div>`;
            }).join('')}
                </div>`;

    const tab = state.contagem.tab;
    let mainContent = '';
    if (tab === 'chamados') {
        mainContent = chamadosContent;
    } else if (tab === 'newContagem') {
        if (state.contagem.savedResult) {
            mainContent = resultContent;
        } else if (state.contagem.newStep === 3) {
            // Prioridade: 1) editingNum (edição pontual)  2) contagemStep (clique na bolinha)  3) auto
            let formNum;
            if (state.contagem.editingNum) {
                formNum = state.contagem.editingNum;
            } else if (state.contagem.contagemStep) {
                formNum = state.contagem.contagemStep;
            } else {
                const hasSavedC1 = Object.values(state.contagem.todayCounts).some(c => c.c1);
                formNum = hasSavedC1 ? 2 : 1;
            }
            mainContent = buildCountForm(formNum);
        } else {
            mainContent = buildNewContagemFlow();
        }
    } else if (tab === 'history') {
        mainContent = historyContent;
    } else {
        mainContent = homeContent;
    }

    return `
    <div class="page-wrap">
        ${renderHeader()}
        <div class="page-content-sm">
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
                ${tab !== 'newContagem' ? `
                <button onclick="state.contagem.tab='newContagem';state.contagem.newStep=1;state.contagem.turno=null;state.contagem.horario='';render()" class="btn-primary">
                    <i class="ph-fill ph-plus-circle"></i> Nova Contagem
                </button>` : `
                <button onclick="state.contagem.tab='chamados';state.contagem.turno=null;state.contagem.horario='';state.contagem.newStep=1;state.contagem.savedResult=null;render()" class="btn-secondary">
                    <i class="ph ph-x"></i> Cancelar
                </button>`}
            </div>
            <div class="tab-bar" style="margin-bottom:12px;">
                <button class="tab-btn ${tab === 'chamados' ? 'active' : ''}"
                    onclick="switchContagemTab('chamados')" style="position:relative;">
                    <i class="ph ph-bell-ringing"></i> Chamados
                    ${openTickets.length > 0 ? `<span style="background:var(--orange);color:#fff;border-radius:99px;font-size:10px;font-weight:700;padding:1px 7px;margin-left:5px;vertical-align:middle;">${openTickets.length}</span>` : ''}
                </button>
                <button class="tab-btn ${tab === 'home' || tab === 'newContagem' ? 'active' : ''}"
                    onclick="state.contagem.tab='home';render()">
                    <i class="ph ph-clipboard-text"></i> Contagens
                </button>
                <button class="tab-btn ${tab === 'history' ? 'active' : ''}"
                    onclick="switchContagemTab('history')">
                    <i class="ph ph-clock-counter-clockwise"></i> Histórico
                </button>
            </div>
            ${mainContent}
        </div>
    </div>`;
}

function renderHeader() {
    const views = [
        { id: 'stock', label: 'Estoque', icon: 'ph ph-warehouse' },
        { id: 'contagem', label: 'Contagem Diária', icon: 'ph ph-clipboard-text' },
        { id: 'history', label: 'Histórico', icon: 'ph ph-clock-counter-clockwise' },
        { id: 'epi_dashboard', label: 'Dashboard EPI', icon: 'ph ph-chart-bar' },
        { id: 'warehouses', label: 'Almoxarifados', icon: 'ph ph-buildings' },
    ];
    return `
        <div id="global-sync-bar"></div>
        <div id="topbar">
            <div id="topbar-left">
                <button class="topbar-icon-btn" onclick="openSidebar()" aria-label="Menu" title="Menu">
                    <i class="ph ph-list"></i>
                </button>
            </div>
            <div class="logo">
                <span class="logo-gps">Grupo GPS</span>
                <div class="logo-divider"></div>
                <span class="logo-gestao">Almoxarifado EPI</span>
            </div>
            ${['stock', 'history'].includes(state.view) ? `
            <div class="topbar-search-wrapper">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"
                    style="position:absolute;left:12px;top:50%;transform:translateY(-50%);width:13px;height:13px;color:var(--text-3);pointer-events:none;">
                    <circle cx="7" cy="7" r="5"/><path d="M11 11l3 3"/>
                </svg>
                <input type="text" id="global-search"
                    placeholder="Pesquisar..."
                    value="${state.filters.searchTerm}"
                    oninput="handleSearchInput(this.value)"
                    autocomplete="off"
                    aria-label="Pesquisar">
            </div>` : ''}
            <div id="topbar-right">
                <button class="topbar-icon-btn" onclick="exportAll()" title="Exportar" aria-label="Exportar">
                    <i class="ph ph-download-simple"></i>
                </button>
                <button class="topbar-icon-btn" onclick="handleLogout()" title="Sair" aria-label="Sair" style="color:var(--red)">
                    <i class="ph ph-sign-out"></i>
                </button>
            </div>
        </div>

        <div id="nav-menu-overlay" class="nav-menu-overlay hidden" onclick="closeSidebar()">
            <div class="nav-menu-panel" onclick="event.stopPropagation()">
                <div class="nav-menu-header">
                    <div>
                        <div style="font-weight:800;font-size:15px;color:#0f3868;">Grupo GPS</div>
                        <div style="font-size:11px;color:var(--text-3);font-weight:500;margin-top:2px;">Almoxarifado EPI</div>
                    </div>
                </div>
                <div class="nav-menu-body">
                    ${views.map(v => {
        const openCount = v.id === 'contagem' ? state.contagem.openTickets.length : 0;
        const badge = openCount > 0
            ? `<span style="margin-left:auto;background:var(--orange);color:#fff;border-radius:99px;font-size:10px;font-weight:700;padding:2px 8px;min-width:20px;text-align:center;">${openCount}</span>`
            : '';
        return `
                        <button class="nav-menu-item ${state.view === v.id ? 'active' : ''}"
                            onclick="closeSidebar(); ${v.id === 'contagem' ? 'navigateToContagem()'
                : v.id === 'epi_dashboard' ? 'navigateToEpiDashboard()'
                    : `navigateTo('${v.id}')`
            }"
                            style="display:flex;align-items:center;gap:8px;">
                            <i class="${v.icon}"></i>
                            <span style="flex:1;">${v.label}</span>
                            ${badge}
                        </button>`;
    }).join('')}
                </div>
                <div class="nav-menu-footer">
                    <div class="nav-menu-user-info">
                        <i class="ph-fill ph-user-circle" style="font-size:18px;color:var(--text-3);"></i>
                        <span>${state.user?.nome || state.user?.email || '—'}</span>
                    </div>
                    <button class="btn-ghost" onclick="closeSidebar(); handleLogout()" style="width:100%;justify-content:flex-start;gap:8px;">
                        <i class="ph ph-sign-out"></i> Sair
                    </button>
                </div>
            </div>
        </div>
    `;
}

function openSidebar() {
    const overlay = document.getElementById('nav-menu-overlay');
    if (overlay) overlay.classList.remove('hidden');
}

function closeSidebar() {
    const overlay = document.getElementById('nav-menu-overlay');
    if (overlay) overlay.classList.add('hidden');
}

function exportAll() {
    if (state.view === 'history') {
        exportMovementsToXLSX();
    } else {
        exportStockToXLSX();
    }
}

// ============================================
// COPIAR RELATORIO PARA WHATSAPP
// ============================================
function copiarRelatorioWhatsApp() {
    var result = state.contagem.savedResult;
    var rSess = state.contagem.currentSession;
    if (!result) return;

    var turnoNoite = (rSess && rSess.turno_noite) ? rSess.turno_noite : '?';
    var turnoDia   = (rSess && rSess.turno_dia)   ? rSess.turno_dia   : '?';

    // Noite é sempre 19:00→07:00 (cruza meia-noite: data do relatório = dia seguinte)
    var sessDate  = new Date(state.contagem.date + 'T12:00:00');
    var noiteDate = new Date(sessDate.getTime() - 86400000);

    function fmtDia(d) {
        return String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0');
    }

    // Inclui itens com valor positivo: usa diferença quando ambos existem,
    // ou o valor único disponível quando só um lado foi preenchido
    var itensNoite = result.filter(function(r) {
        if (r.c1_qtd != null && r.c2_qtd != null) return (r.c1_qtd - r.c2_qtd) > 0;
        return false; // sem C1 não há como saber consumo noturno
    });
    var itensDia = result.filter(function(r) {
        if (r.c2_qtd != null && r.c3_qtd != null) return (r.c2_qtd - r.c3_qtd) > 0;
        if (r.c2_qtd == null  && r.c3_qtd != null) return r.c3_qtd > 0; // só C3: usa direto
        return false;
    });

    function qtdNoite(r) {
        return (r.c1_qtd != null && r.c2_qtd != null) ? r.c1_qtd - r.c2_qtd : r.c1_qtd;
    }
    function qtdDia(r) {
        return (r.c2_qtd != null && r.c3_qtd != null) ? r.c2_qtd - r.c3_qtd : r.c3_qtd;
    }

    var txt = 'RELATORIO DE DISTRIBUIÇÃO ALMOXARIFADO\n';
    var fdsData = parseFDS(rSess && rSess.observacao);
    if (fdsData && fdsData.turnos && fdsData.turnos.length) {
        txt += 'Final De Semana\n';
        fdsData.turnos.forEach(function(t) {
            txt += (t.data || '—') + ' - letra ' + (t.letra || '?') + ' - ' + (t.horario || '') + '\n';
        });
    }
    txt += '\n';

    if (itensNoite.length > 0) {
        txt += '*TURNO ' + turnoNoite + ' — ' + fmtDia(noiteDate) + ' — 19:00 às 07:00*\n\n';
        itensNoite.forEach(function(r) {
            txt += '• ' + qtdNoite(r) + ' ' + r.item_name.toUpperCase() + '\n';
        });
    }

    if (itensDia.length > 0) {
        txt += '\n';
        txt += '*ADM + TURNO ' + turnoDia + ' — ' + fmtDia(sessDate) + '*\n\n';
        itensDia.forEach(function(r) {
            txt += '• ' + qtdDia(r) + ' ' + r.item_name.toUpperCase() + '\n';
        });
    }

    if (itensNoite.length === 0 && itensDia.length === 0) {
        showToast('Sem dados para copiar — complete a contagem primeiro.', 'error');
        return;
    }

    navigator.clipboard.writeText(txt)
        .then(function () { showToast('Copiado! Cole no WhatsApp.', 'success'); })
        .catch(function () { showToast('Erro ao copiar. Tente novamente.', 'error'); });
}

// ============================================
// DASHBOARD EPI — COMPLETO
// ============================================
var _dashCharts = {};

async function navigateToEpiDashboard() {
    state.view = 'epi_dashboard';
    if (!state.dashboard) {
        state.dashboard = { loading: false, data: [], sessions: [], stockItems: [], movements: [], period: '30d', dashTab: 'overview' };
    }
    render();
    await loadDashboardData();
}

async function loadDashboardData() {
    if (!state.dashboard) return;
    state.dashboard.loading = true;
    render();
    try {
        var p = state.dashboard.period;
        var days = p === '7d' ? 7 : p === '30d' ? 30 : p === '90d' ? 90 : null;
        var since = null;
        if (days) {
            var sd = new Date();
            sd.setDate(sd.getDate() - days);
            since = sd.toISOString().split('T')[0];
        }
        var dcQ = sbClient.from('daily_counts').select('*').order('date', { ascending: true });
        var sQ = sbClient.from('count_sessions').select('*').order('created_at', { ascending: false });
        var mQ = sbClient.from('movements').select('*').order('date', { ascending: false }).limit(100);
        if (since) { dcQ = dcQ.gte('date', since); sQ = sQ.gte('created_at', since); mQ = mQ.gte('date', since); }
        var results = await Promise.all([dcQ, sQ, sbClient.from('items').select('*').order('nome'), mQ]);
        state.dashboard.data = results[0].data || [];
        state.dashboard.sessions = results[1].data || [];
        state.dashboard.stockItems = results[2].data || [];
        state.dashboard.movements = results[3].data || [];
    } catch (e) {
        state.dashboard.data = [];
        state.dashboard.sessions = [];
        state.dashboard.stockItems = [];
        state.dashboard.movements = [];
    }
    state.dashboard.loading = false;
    render();
    setTimeout(renderDashboardCharts, 60);
}

function setDashTab(tab) {
    if (!state.dashboard) return;
    state.dashboard.dashTab = tab;
    render();
    setTimeout(renderDashboardCharts, 60);
}

function _destroyDashChart(id) {
    if (_dashCharts[id]) { try { _dashCharts[id].destroy(); } catch (e) { } delete _dashCharts[id]; }
}

function _mkDashChart(id, cfg) {
    _destroyDashChart(id);
    var el = document.getElementById(id);
    if (!el) return;
    _dashCharts[id] = new Chart(el, cfg);
}

function _computeDashMetrics() {
    var dash = state.dashboard || {};
    var rows = dash.data || [];
    var sessions = dash.sessions || [];
    var stockItems = dash.stockItems || [];
    var sessMap = {};
    sessions.forEach(function (s) { sessMap[s.id] = s; });
    var sesRows = rows.filter(function (r) { return isSessionId(r.turno || ''); });
    var byItem = {}, byTurnoLetter = { A: 0, B: 0, C: 0, D: 0, ADM: 0 }, byDate = {};
    var totalConsNoite = 0, totalDistAdm = 0;
    sesRows.forEach(function (r) {
        var cons = (r.c1_qtd != null && r.c2_qtd != null) ? Math.max(0, r.c1_qtd - r.c2_qtd) : 0;
        var dist = (r.c2_qtd != null && r.c3_qtd != null) ? Math.max(0, r.c2_qtd - r.c3_qtd) : 0;
        if (cons === 0 && dist === 0) return;
        if (!byItem[r.item_name]) byItem[r.item_name] = { consumo: 0, distAdm: 0 };
        byItem[r.item_name].consumo += cons;
        byItem[r.item_name].distAdm += dist;
        totalConsNoite += cons;
        totalDistAdm += dist;
        var sess = sessMap[r.turno];
        var letra = sess ? (sess.turno_noite || '') : '';
        if (['A', 'B', 'C', 'D'].includes(letra)) byTurnoLetter[letra] += cons;
        byTurnoLetter.ADM += dist;
        var d = r.date;
        if (!byDate[d]) byDate[d] = { cons: 0, dist: 0 };
        byDate[d].cons += cons;
        byDate[d].dist += dist;
    });
    var allItems = Object.entries(byItem).sort(function (a, b) {
        return (b[1].consumo + b[1].distAdm) - (a[1].consumo + a[1].distAdm);
    });
    var lowStock = stockItems.filter(function (i) {
        return i.estoque_minimo != null && i.quantidade != null && i.quantidade <= i.estoque_minimo;
    });
    return {
        byItem: byItem, byTurnoLetter: byTurnoLetter, byDate: byDate,
        sortedDates: Object.keys(byDate).sort(),
        allItems: allItems, totalEPIs: totalConsNoite + totalDistAdm,
        totalConsNoite: totalConsNoite, totalDistAdm: totalDistAdm,
        sessCount: sessions.length, lowStock: lowStock,
        totalStockItems: stockItems.length
    };
}

function _computeControlMetrics() {
    var dash       = state.dashboard || {};
    var stockItems = dash.stockItems  || [];
    var movements  = dash.movements   || [];
    var sessions   = dash.sessions    || [];
    var dailyRows  = dash.data        || [];
    var p          = dash.period      || '30d';
    var pDays      = p === '7d' ? 7 : p === '90d' ? 90 : 30;

    var outboundByItem = {};
    movements.forEach(function (m) {
        if (['SAIDA', 'DISTRIBUICAO', 'REPOSICAO'].indexOf(m.type) >= 0)
            outboundByItem[m.item_name] = (outboundByItem[m.item_name] || 0) + (m.quantity || 0);
    });
    var movedItems = Object.keys(outboundByItem);

    var alertItems = stockItems
        .filter(function (i) {
            return (i.quantidade || 0) === 0 ||
                (i.estoque_minimo != null && (i.quantidade || 0) < i.estoque_minimo);
        })
        .map(function (item) {
            var saidas = outboundByItem[item.nome] || 0;
            var cons   = saidas / pDays;
            var dias   = cons > 0 ? Math.floor((item.quantidade || 0) / cons) : null;
            var sug    = cons > 0 ? Math.ceil(cons * 7) : null;
            var wh     = (state.warehouses || []).find(function (w) {
                return w.id === (item.warehouse_id || 'alm-1');
            });
            return {
                nome: item.nome, categoria: item.categoria || '—',
                almoxarifado: wh ? wh.nome : '—',
                quantidade: item.quantidade || 0,
                minimo: item.estoque_minimo,
                consMedia: cons, diasRestantes: dias, qtdSugerida: sug,
                isZero: (item.quantidade || 0) === 0
            };
        })
        .sort(function (a, b) {
            if (a.isZero !== b.isZero) return a.isZero ? -1 : 1;
            return (a.diasRestantes != null ? a.diasRestantes : 9999) -
                   (b.diasRestantes != null ? b.diasRestantes : 9999);
        });

    var itemsWithCons = alertItems.filter(function (a) { return a.diasRestantes != null; });
    var diasMedio = itemsWithCons.length > 0
        ? Math.round(itemsWithCons.reduce(function (s, a) { return s + a.diasRestantes; }, 0) / itemsWithCons.length)
        : null;

    var itemConsMap = {};
    movements.forEach(function (m) {
        if (m.type === 'SAIDA' || m.type === 'DISTRIBUICAO') {
            if (!itemConsMap[m.item_name]) itemConsMap[m.item_name] = { cons: 0, distAdm: 0 };
            if (m.type === 'SAIDA')        itemConsMap[m.item_name].cons    += (m.quantity || 0);
            else                           itemConsMap[m.item_name].distAdm += (m.quantity || 0);
        }
    });
    var top10 = Object.entries(itemConsMap)
        .sort(function (a, b) {
            return (b[1].cons + b[1].distAdm) - (a[1].cons + a[1].distAdm);
        })
        .slice(0, 10);

    var top5parado = stockItems
        .filter(function (i) {
            return (i.quantidade || 0) > 0 && movedItems.indexOf(i.nome) < 0;
        })
        .map(function (i) {
            var allMovs  = state.movements || [];
            var lastMov  = allMovs
                .filter(function (m) { return m.item_name === i.nome; })
                .sort(function (a, b) { return b.date.localeCompare(a.date); })[0];
            var lastDate = lastMov ? lastMov.date : null;
            var diasP    = lastDate
                ? Math.floor((Date.now() - new Date(lastDate).getTime()) / 86400000)
                : null;
            var wh = (state.warehouses || []).find(function (w) {
                return w.id === (i.warehouse_id || 'alm-1');
            });
            return {
                nome: i.nome, categoria: i.categoria || '—',
                almoxarifado: wh ? wh.nome : '—',
                lastMov: lastDate ? formatDate(lastDate) : 'Nunca',
                diasParado: diasP
            };
        })
        .sort(function (a, b) {
            return (b.diasParado != null ? b.diasParado : 9999) -
                   (a.diasParado != null ? a.diasParado : 9999);
        })
        .slice(0, 5);

    var totalDist = 0, byDate = {};
    movements.forEach(function (m) {
        if (['SAIDA', 'DISTRIBUICAO', 'REPOSICAO'].indexOf(m.type) >= 0) {
            totalDist += (m.quantity || 0);
            if (m.date) byDate[m.date] = (byDate[m.date] || 0) + (m.quantity || 0);
        }
    });
    var diaTopEntry = Object.entries(byDate).sort(function (a, b) { return b[1] - a[1]; })[0];
    var diaTop = diaTopEntry ? { data: formatDate(diaTopEntry[0]), total: diaTopEntry[1] } : null;

    var sesGroups = {};
    dailyRows.forEach(function (row) {
        if (!row.turno || !isSessionId(row.turno)) return;
        var sid = row.turno;
        if (!sesGroups[sid]) sesGroups[sid] = { c1: 0, c2: 0, c3: 0, hC1: false, hC2: false, hC3: false };
        if (row.contagem_num === 1) { sesGroups[sid].c1 += (row.quantidade || 0); sesGroups[sid].hC1 = true; }
        if (row.contagem_num === 2) { sesGroups[sid].c2 += (row.quantidade || 0); sesGroups[sid].hC2 = true; }
        if (row.contagem_num === 3) { sesGroups[sid].c3 += (row.quantidade || 0); sesGroups[sid].hC3 = true; }
    });

    var baixaMap = {};
    movements.forEach(function (m) {
        if (m.observations && m.observations.indexOf('Baixa Contagem Diária') >= 0) {
            var match = m.observations.match(/Turno\s+(\d{8})/);
            var key   = match ? (m.date + '_' + match[1]) : m.date;
            baixaMap[key] = true;
        }
    });

    var contagemRows = sessions.map(function (s) {
        var sid = s.id || '';
        var g   = sesGroups[sid] || { c1: 0, c2: 0, c3: 0, hC1: false, hC2: false, hC3: false };
        var dN  = (g.hC1 && g.hC2) ? g.c1 - g.c2 : null;
        var dA  = (g.hC2 && g.hC3) ? g.c2 - g.c3 : null;
        var dateDisp = sid.length === 8
            ? sid.slice(6,8) + '/' + sid.slice(4,6) + '/' + sid.slice(0,4) : sid;
        var isoD = sid.length === 8
            ? sid.slice(0,4) + '-' + sid.slice(4,6) + '-' + sid.slice(6,8) : null;
        var bKey = isoD ? (isoD + '_' + sid) : isoD;
        var bSt  = baixaMap[bKey] ? 'APLICADA'
            : (g.hC3 ? 'APLICADA' : (g.hC1 ? 'PENDENTE' : 'SEM DADOS'));
        return {
            id: sid, date: dateDisp, isoDate: isoD,
            turnoNoite: s.turno_noite || '?', turnoDia: s.turno_dia || '?',
            c1: g.c1, c2: g.c2, c3: g.c3,
            deltaNight: dN, deltaAdm: dA,
            baixaStatus: bSt
        };
    }).sort(function (a, b) {
        return (b.isoDate || '').localeCompare(a.isoDate || '');
    });

    var totSaidasCont = contagemRows.reduce(function (s, r) {
        return s + Math.max(0, r.deltaNight || 0) + Math.max(0, r.deltaAdm || 0);
    }, 0);
    var maiorCons = contagemRows.reduce(function (mx, r) {
        var tot = Math.max(0, r.deltaNight || 0) + Math.max(0, r.deltaAdm || 0);
        return tot > mx ? tot : mx;
    }, 0);

    return {
        alertItems: alertItems,
        zeradosCount: alertItems.filter(function (a) { return a.isZero; }).length,
        baixoCount:   alertItems.filter(function (a) { return !a.isZero; }).length,
        diasMedioRestante: diasMedio,
        giroData: {
            top10: top10, top5parado: top5parado,
            totalDistribuido: totalDist,
            mediaDiaria: totalDist / pDays,
            diaTop: diaTop
        },
        contagemData: {
            rows: contagemRows,
            totalSaidas: totSaidasCont,
            sessAplicadas: contagemRows.filter(function (r) { return r.baixaStatus === 'APLICADA'; }).length,
            sessPendentes: contagemRows.filter(function (r) { return r.baixaStatus === 'PENDENTE'; }).length,
            maiorConsumo: maiorCons
        }
    };
}

function _escHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _kpiCard(label, value, icon, color, alert) {
    return '<div class="card" style="padding:14px 12px;text-align:center;' + (alert ? 'border:1.5px solid ' + color + ';' : '') + '">' +
        '<div style="font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">' +
        '<i class="ph ' + icon + '" style="color:' + color + ';"></i> ' + label + '</div>' +
        '<div style="font-size:28px;font-weight:800;color:' + color + ';">' + value + '</div></div>';
}

function _chartCard(title, chartId, height) {
    return '<div class="card" style="padding:16px;">' +
        '<div class="section-title" style="margin-bottom:12px;">' + title + '</div>' +
        '<div style="position:relative;height:' + (height || 220) + 'px;"><canvas id="' + chartId + '"></canvas></div></div>';
}

function _renderTabOverview(m) {
    return '<div style="display:grid;grid-template-columns:2fr 1fr;gap:14px;margin-bottom:14px;">' +
        _chartCard('<i class="ph ph-trend-up" style="color:var(--accent);"></i> Distribuição Diária — Linha do Tempo', 'dash-chart-timeline', 200) +
        _chartCard('<i class="ph ph-chart-pie" style="color:var(--accent);"></i> Por Turno', 'dash-chart-turno', 200) +
        '</div>' +
        _chartCard('<i class="ph ph-ranking" style="color:var(--accent);"></i> Top 10 EPIs Consumidos', 'dash-chart-top', 250);
}

function _renderTabItems(m) {
    var total = m.totalEPIs || 1;
    var rows = m.allItems.map(function (entry, i) {
        var nome = entry[0], v = entry[1];
        var tot = v.consumo + v.distAdm;
        var pct = ((tot / total) * 100).toFixed(1);
        var barW = Math.min(100, parseFloat(pct));
        return '<tr style="border-bottom:1px solid var(--border);">' +
            '<td style="padding:9px 12px;font-weight:700;color:var(--text-3);font-size:12px;">' + (i + 1) + '</td>' +
            '<td style="padding:9px 12px;font-weight:600;">' + nome + '</td>' +
            '<td style="padding:9px 12px;text-align:right;color:var(--red);font-weight:700;">' + v.consumo + '</td>' +
            '<td style="padding:9px 12px;text-align:right;color:var(--orange);font-weight:700;">' + v.distAdm + '</td>' +
            '<td style="padding:9px 12px;text-align:right;font-weight:800;">' + tot + '</td>' +
            '<td style="padding:9px 12px;text-align:right;">' +
            '<div style="display:flex;align-items:center;justify-content:flex-end;gap:6px;">' +
            '<div style="width:60px;height:5px;border-radius:3px;background:var(--border);">' +
            '<div style="height:5px;border-radius:3px;background:var(--accent);width:' + barW + '%;"></div></div>' +
            '<span style="font-size:11px;color:var(--text-2);min-width:36px;">' + pct + '%</span></div></td></tr>';
    }).join('');
    var empty = m.allItems.length === 0 ? '<tr><td colspan="6" style="padding:32px;text-align:center;color:var(--text-3);">Nenhum dado no período selecionado</td></tr>' : '';
    return '<div class="card"><div style="padding:14px 16px 10px;border-bottom:1px solid var(--border);">' +
        '<div class="section-title"><i class="ph ph-list-numbers" style="color:var(--accent);"></i> Ranking Completo de Itens</div>' +
        '<p style="font-size:12px;color:var(--text-3);margin:4px 0 0;">' + m.allItems.length + ' itens com movimentação no período</p>' +
        '</div><div style="overflow-x:auto;">' +
        '<table style="width:100%;border-collapse:collapse;font-size:13px;">' +
        '<thead><tr style="background:var(--bg-2);">' +
        '<th style="padding:8px 12px;text-align:left;font-size:11px;color:var(--text-3);">#</th>' +
        '<th style="padding:8px 12px;text-align:left;font-size:11px;color:var(--text-3);">Item</th>' +
        '<th style="padding:8px 12px;text-align:right;font-size:11px;color:var(--red);">Cons. Noite</th>' +
        '<th style="padding:8px 12px;text-align:right;font-size:11px;color:var(--orange);">Dist. ADM</th>' +
        '<th style="padding:8px 12px;text-align:right;font-size:11px;color:var(--text-2);">Total</th>' +
        '<th style="padding:8px 12px;text-align:right;font-size:11px;color:var(--text-3);">% do Total</th>' +
        '</tr></thead><tbody>' + rows + empty + '</tbody></table></div></div>';
}

function _renderTabSessions() {
    var dash = state.dashboard || {};
    var sessions = dash.sessions || [];
    var fdsCount = 0;
    sessions.forEach(function (s) {
        try { var o = JSON.parse(s.observacao || '{}'); if (o.fds) fdsCount++; } catch (e) { }
    });
    var cards = '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px;">' +
        _kpiCard('Total de Sessões', sessions.length, 'ph-calendar', 'var(--accent)') +
        _kpiCard('Final de Semana', fdsCount, 'ph-calendar-blank', 'var(--orange)') +
        _kpiCard('Sessões Normais', sessions.length - fdsCount, 'ph-calendar-check', 'var(--green)') +
        '</div>';
    var rows = sessions.map(function (s) {
        var isFDS = false, fdsInfo = '';
        try {
            var o = JSON.parse(s.observacao || '{}');
            if (o.fds && o.turnos) {
                isFDS = true;
                fdsInfo = o.turnos.map(function (t) { return (t.data || '') + ' ' + (t.letra || '') + ' ' + (t.horario || ''); }).join(' / ');
            }
        } catch (e) { }
        var sid = s.id || '';
        var dateStr = sid.length === 8 ? sid.slice(6, 8) + '/' + sid.slice(4, 6) + '/' + sid.slice(0, 4) : sid;
        var tn = s.turno_noite || '?', td2 = s.turno_dia || '?';
        var badge = function (l, c) {
            return '<span style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:' + c + ';color:#fff;font-size:11px;font-weight:800;">' + l + '</span>';
        };
        var typeBg = isFDS ? 'rgba(224,135,42,.12)' : 'rgba(46,158,90,.12)';
        var typeColor = isFDS ? 'var(--orange)' : 'var(--green)';
        return '<tr style="border-bottom:1px solid var(--border);">' +
            '<td style="padding:9px 12px;font-weight:600;">' + dateStr + '</td>' +
            '<td style="padding:9px 12px;">' + badge(tn, 'var(--red)') + '<span style="font-size:11px;color:var(--text-3);margin-left:6px;">19:00 → 07:00</span></td>' +
            '<td style="padding:9px 12px;">' + badge(td2, 'var(--orange)') + '</td>' +
            '<td style="padding:9px 12px;"><span style="padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700;background:' + typeBg + ';color:' + typeColor + ';">' + (isFDS ? 'FDS' : 'Normal') + '</span></td>' +
            '<td style="padding:9px 12px;font-size:12px;color:var(--text-2);">' + (fdsInfo || '—') + '</td></tr>';
    }).join('');
    var empty = sessions.length === 0 ? '<tr><td colspan="5" style="padding:32px;text-align:center;color:var(--text-3);">Nenhuma sessão no período</td></tr>' : '';
    var table = '<div class="card"><div style="padding:14px 16px 10px;border-bottom:1px solid var(--border);">' +
        '<div class="section-title"><i class="ph ph-calendar-check" style="color:var(--accent);"></i> Histórico de Sessões</div></div>' +
        '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:13px;">' +
        '<thead><tr style="background:var(--bg-2);">' +
        '<th style="padding:8px 12px;text-align:left;font-size:11px;color:var(--text-3);">Data</th>' +
        '<th style="padding:8px 12px;text-align:left;font-size:11px;color:var(--text-3);">Turno Noite</th>' +
        '<th style="padding:8px 12px;text-align:left;font-size:11px;color:var(--text-3);">ADM + Dia</th>' +
        '<th style="padding:8px 12px;text-align:left;font-size:11px;color:var(--text-3);">Tipo</th>' +
        '<th style="padding:8px 12px;text-align:left;font-size:11px;color:var(--text-3);">Final de Semana</th>' +
        '</tr></thead><tbody>' + rows + empty + '</tbody></table></div></div>';
    return cards + table;
}

function _renderTabStock() {
    var dash = state.dashboard || {};
    var items = dash.stockItems || [];
    var lowStock = items.filter(function (i) {
        return i.estoque_minimo != null && i.quantidade != null && i.quantidade <= i.estoque_minimo;
    });
    var alertSection = '';
    if (lowStock.length > 0) {
        var alertRows = lowStock.map(function (i) {
            return '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-radius:8px;margin-bottom:4px;background:rgba(214,69,69,.06);">' +
                '<div><div style="font-weight:600;font-size:13px;">' + i.nome + '</div>' +
                '<div style="font-size:11px;color:var(--text-3);">' + (i.categoria || 'Sem categoria') + '</div></div>' +
                '<div style="text-align:right;"><div style="font-size:22px;font-weight:800;color:var(--red);">' + (i.quantidade || 0) + '</div>' +
                '<div style="font-size:10px;color:var(--text-3);">mín: ' + i.estoque_minimo + '</div></div></div>';
        }).join('');
        alertSection = '<div class="card" style="margin-bottom:14px;border:1.5px solid var(--red);">' +
            '<div style="padding:12px 16px;background:rgba(214,69,69,.06);border-bottom:1px solid var(--border);">' +
            '<div class="section-title" style="color:var(--red);"><i class="ph ph-warning"></i> Alertas — Estoque Baixo (' + lowStock.length + ')</div></div>' +
            '<div style="padding:8px;">' + alertRows + '</div></div>';
    }
    var tableRows = items.map(function (i) {
        var isLow = i.estoque_minimo != null && i.quantidade != null && i.quantidade <= i.estoque_minimo;
        var sc = isLow ? 'var(--red)' : 'var(--green)';
        var sbg = isLow ? 'rgba(214,69,69,.1)' : 'rgba(46,158,90,.1)';
        return '<tr style="border-bottom:1px solid var(--border);">' +
            '<td style="padding:9px 12px;font-weight:600;">' + i.nome + '</td>' +
            '<td style="padding:9px 12px;font-size:12px;color:var(--text-2);">' + (i.categoria || '—') + '</td>' +
            '<td style="padding:9px 12px;text-align:right;font-weight:800;color:' + (isLow ? 'var(--red)' : 'var(--text-1)') + ';">' + (i.quantidade || 0) + '</td>' +
            '<td style="padding:9px 12px;text-align:right;color:var(--text-3);">' + (i.estoque_minimo != null ? i.estoque_minimo : '—') + '</td>' +
            '<td style="padding:9px 12px;"><span style="padding:2px 8px;border-radius:12px;font-size:10px;font-weight:700;background:' + sbg + ';color:' + sc + ';">' + (isLow ? 'BAIXO' : 'OK') + '</span></td></tr>';
    }).join('');
    var empty = items.length === 0 ? '<tr><td colspan="5" style="padding:32px;text-align:center;color:var(--text-3);">Nenhum item cadastrado</td></tr>' : '';
    var chartCard = '<div style="margin-bottom:14px;">' + _chartCard('<i class="ph ph-chart-bar" style="color:var(--accent);"></i> Estoque por Item (Top 20)', 'dash-chart-stock', 300) + '</div>';
    var tableCard = '<div class="card"><div style="padding:14px 16px 10px;border-bottom:1px solid var(--border);">' +
        '<div class="section-title"><i class="ph ph-package" style="color:var(--accent);"></i> Todos os Itens em Estoque (' + items.length + ')</div></div>' +
        '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:13px;">' +
        '<thead><tr style="background:var(--bg-2);">' +
        '<th style="padding:8px 12px;text-align:left;font-size:11px;color:var(--text-3);">Item</th>' +
        '<th style="padding:8px 12px;text-align:left;font-size:11px;color:var(--text-3);">Categoria</th>' +
        '<th style="padding:8px 12px;text-align:right;font-size:11px;color:var(--text-3);">Qtd</th>' +
        '<th style="padding:8px 12px;text-align:right;font-size:11px;color:var(--text-3);">Mínimo</th>' +
        '<th style="padding:8px 12px;text-align:left;font-size:11px;color:var(--text-3);">Status</th>' +
        '</tr></thead><tbody>' + tableRows + empty + '</tbody></table></div></div>';
    return alertSection + chartCard + tableCard;
}

function _renderTabMovements(m) {
    var dash = state.dashboard || {};
    var movements = dash.movements || [];
    var byType = {};
    movements.forEach(function (mv) { byType[mv.type] = (byType[mv.type] || 0) + 1; });
    var typeColors = { emerald: 'var(--green)', blue: 'var(--accent)', purple: '#6366f1', red: 'var(--red)', amber: 'var(--orange)', cyan: '#06b6d4' };
    var typeBgs = { emerald: 'rgba(46,158,90,.12)', blue: 'rgba(74,127,215,.12)', purple: 'rgba(99,102,241,.12)', red: 'rgba(214,69,69,.12)', amber: 'rgba(224,135,42,.12)', cyan: 'rgba(6,182,212,.12)' };
    var summaryCards = Object.entries(MOVEMENT_TYPES).filter(function (e) { return byType[e[0]] > 0; }).map(function (e) {
        var k = e[0], v = e[1];
        var c = typeColors[v.color] || 'var(--text-2)';
        return _kpiCard(v.label, byType[k], 'ph-' + v.icon, c);
    }).join('');
    var movRows = movements.map(function (mv) {
        var td2 = MOVEMENT_TYPES[mv.type] || { label: mv.type, color: 'blue', icon: 'arrow-right', sign: '' };
        var c = typeColors[td2.color] || 'var(--text-2)';
        var cbg = typeBgs[td2.color] || 'rgba(0,0,0,.06)';
        var dfmt = mv.date ? mv.date.slice(8, 10) + '/' + mv.date.slice(5, 7) + '/' + mv.date.slice(0, 4) : '—';
        var obs = mv.observations || '—';
        if (obs.length > 40) obs = obs.slice(0, 40) + '…';
        return '<tr style="border-bottom:1px solid var(--border);">' +
            '<td style="padding:9px 12px;font-size:12px;color:var(--text-2);">' + dfmt + '</td>' +
            '<td style="padding:9px 12px;"><span style="padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700;background:' + cbg + ';color:' + c + ';">' + td2.sign + ' ' + td2.label + '</span></td>' +
            '<td style="padding:9px 12px;font-weight:600;">' + (mv.item_name || '—') + '</td>' +
            '<td style="padding:9px 12px;text-align:right;font-weight:700;">' + (mv.quantity || 0) + '</td>' +
            '<td style="padding:9px 12px;font-size:12px;color:var(--text-2);">' + (mv.user_name || '—') + '</td>' +
            '<td style="padding:9px 12px;font-size:12px;color:var(--text-3);">' + obs + '</td></tr>';
    }).join('');
    var empty = movements.length === 0 ? '<tr><td colspan="6" style="padding:32px;text-align:center;color:var(--text-3);">Nenhuma movimentação no período</td></tr>' : '';
    return '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:14px;">' + summaryCards + '</div>' +
        '<div class="card"><div style="padding:14px 16px 10px;border-bottom:1px solid var(--border);">' +
        '<div class="section-title"><i class="ph ph-arrows-left-right" style="color:var(--accent);"></i> Últimas ' + movements.length + ' Movimentações</div></div>' +
        '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:13px;">' +
        '<thead><tr style="background:var(--bg-2);">' +
        '<th style="padding:8px 12px;text-align:left;font-size:11px;color:var(--text-3);">Data</th>' +
        '<th style="padding:8px 12px;text-align:left;font-size:11px;color:var(--text-3);">Tipo</th>' +
        '<th style="padding:8px 12px;text-align:left;font-size:11px;color:var(--text-3);">Item</th>' +
        '<th style="padding:8px 12px;text-align:right;font-size:11px;color:var(--text-3);">Qtd</th>' +
        '<th style="padding:8px 12px;text-align:left;font-size:11px;color:var(--text-3);">Usuário</th>' +
        '<th style="padding:8px 12px;text-align:left;font-size:11px;color:var(--text-3);">Obs</th>' +
        '</tr></thead><tbody>' + movRows + empty + '</tbody></table></div></div>';
}

function _renderTabAlerts(cm) {
    var alerts = cm.alertItems || [];
    var kpis = '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px;">' +
        _kpiCard('Itens Zerados',    cm.zeradosCount || 0, 'ph-x-circle',      '#ef4444', (cm.zeradosCount || 0) > 0) +
        _kpiCard('Abaixo do Mínimo', cm.baixoCount   || 0, 'ph-warning-circle','#f59e0b', (cm.baixoCount   || 0) > 0) +
        _kpiCard('Dias Médio Rest.', cm.diasMedioRestante != null ? cm.diasMedioRestante + 'd' : '—',
            'ph-clock', 'var(--accent)') +
        '</div>';

    var exportBtn = '<div style="text-align:right;margin-bottom:10px;">' +
        '<button onclick="exportAlertsToXLSX()" class="btn-secondary" style="font-size:12px;">' +
        '<i class="ph ph-download-simple"></i> Exportar Alertas</button></div>';

    if (alerts.length === 0) {
        return kpis +
            '<div class="card" style="text-align:center;padding:40px;border:1.5px solid var(--green);">' +
            '<i class="ph ph-check-circle" style="font-size:32px;color:var(--green);"></i>' +
            '<p style="color:var(--green);font-weight:600;margin-top:8px;">Todos os itens com estoque adequado!</p></div>';
    }

    var rows = alerts.map(function (a) {
        var bg  = a.isZero ? 'rgba(239,68,68,.07)' : 'rgba(245,158,11,.07)';
        var bdg = a.isZero
            ? '<span style="padding:2px 8px;border-radius:12px;font-size:10px;font-weight:700;background:#fee2e2;color:#ef4444;">ZERADO</span>'
            : '<span style="padding:2px 8px;border-radius:12px;font-size:10px;font-weight:700;background:#fef9c3;color:#d97706;">BAIXO</span>';
        var diasFmt = a.diasRestantes != null
            ? '<span style="font-weight:700;color:' +
              (a.diasRestantes <= 3 ? '#ef4444' : a.diasRestantes <= 7 ? '#f59e0b' : 'var(--text-1)') +
              ';">' + a.diasRestantes + 'd</span>'
            : '<span style="color:var(--text-3);">—</span>';
        var sugFmt = a.qtdSugerida != null
            ? '<span style="font-weight:700;color:var(--accent);">' + a.qtdSugerida + '</span>'
            : '<span style="color:var(--text-3);">—</span>';
        return '<tr style="border-bottom:1px solid var(--border);background:' + bg + ';">' +
            '<td style="padding:9px 12px;font-weight:600;">' + _escHtml(a.nome) + '</td>' +
            '<td style="padding:9px 12px;font-size:12px;color:var(--text-2);">' + _escHtml(a.almoxarifado) + '</td>' +
            '<td style="padding:9px 12px;text-align:right;font-weight:700;color:' +
            (a.isZero ? '#ef4444' : '#f59e0b') + ';">' + a.quantidade + '</td>' +
            '<td style="padding:9px 12px;text-align:right;color:var(--text-3);">' +
            (a.minimo != null ? _escHtml(a.minimo) : '—') + '</td>' +
            '<td style="padding:9px 12px;text-align:center;">' + bdg + '</td>' +
            '<td style="padding:9px 12px;text-align:center;">' + diasFmt + '</td>' +
            '<td style="padding:9px 12px;text-align:center;">' + sugFmt + '</td></tr>';
    }).join('');

    return kpis + exportBtn +
        '<div class="card"><div style="padding:14px 16px 10px;border-bottom:1px solid var(--border);">' +
        '<div class="section-title"><i class="ph ph-warning" style="color:#ef4444;"></i> Itens em Alerta (' +
        alerts.length + ')</div>' +
        '<p style="font-size:12px;color:var(--text-3);margin:4px 0 0;">Zerados primeiro → ordenado por dias restantes</p>' +
        '</div><div style="overflow-x:auto;">' +
        '<table style="width:100%;border-collapse:collapse;font-size:13px;">' +
        '<thead><tr style="background:var(--bg-2);">' +
        '<th style="padding:8px 12px;text-align:left;font-size:11px;color:var(--text-3);">Item</th>' +
        '<th style="padding:8px 12px;text-align:left;font-size:11px;color:var(--text-3);">Almoxarifado</th>' +
        '<th style="padding:8px 12px;text-align:right;font-size:11px;color:var(--text-3);">Qtd</th>' +
        '<th style="padding:8px 12px;text-align:right;font-size:11px;color:var(--text-3);">Mínimo</th>' +
        '<th style="padding:8px 12px;text-align:center;font-size:11px;color:var(--text-3);">Status</th>' +
        '<th style="padding:8px 12px;text-align:center;font-size:11px;color:var(--text-3);">Dias Rest.</th>' +
        '<th style="padding:8px 12px;text-align:center;font-size:11px;color:var(--text-3);">Qtd Sug. (7d)</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table></div></div>';
}

function _renderTabGiro(cm) {
    var g = cm.giroData || { top10: [], top5parado: [], totalDistribuido: 0, mediaDiaria: 0, diaTop: null };
    var kpis = '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px;">' +
        _kpiCard('Total Distribuído', g.totalDistribuido, 'ph-package', 'var(--accent)') +
        _kpiCard('Média Diária', g.mediaDiaria.toFixed(1), 'ph-chart-line', 'var(--green)') +
        _kpiCard('Pico Diário', g.diaTop
            ? g.diaTop.total + ' (' + _escHtml(g.diaTop.data) + ')'
            : '—', 'ph-rocket-launch', 'var(--orange)') +
        '</div>';

    var chartCard = '<div style="margin-bottom:14px;">' +
        _chartCard(
            '<i class="ph ph-chart-bar" style="color:var(--accent);"></i> Top 10 Mais Consumidos',
            'dash-chart-giro', 280) + '</div>';

    var paradoRows = g.top5parado.length === 0
        ? '<tr><td colspan="5" style="padding:24px;text-align:center;color:var(--text-3);">Todos os itens tiveram saída no período</td></tr>'
        : g.top5parado.map(function (p) {
            var diasFmt = p.diasParado != null
                ? '<span style="font-weight:700;color:' +
                  (p.diasParado > 30 ? '#ef4444' : '#f59e0b') + ';">' + p.diasParado + 'd</span>'
                : '—';
            return '<tr style="border-bottom:1px solid var(--border);">' +
                '<td style="padding:9px 12px;font-weight:600;">' + _escHtml(p.nome) + '</td>' +
                '<td style="padding:9px 12px;font-size:12px;color:var(--text-2);">' + _escHtml(p.categoria) + '</td>' +
                '<td style="padding:9px 12px;font-size:12px;color:var(--text-2);">' + _escHtml(p.almoxarifado) + '</td>' +
                '<td style="padding:9px 12px;font-size:12px;color:var(--text-3);">' + _escHtml(p.lastMov) + '</td>' +
                '<td style="padding:9px 12px;text-align:right;">' + diasFmt + '</td></tr>';
        }).join('');

    return kpis + chartCard +
        '<div class="card"><div style="padding:14px 16px 10px;border-bottom:1px solid var(--border);">' +
        '<div class="section-title"><i class="ph ph-clock" style="color:var(--orange);"></i> Top 5 Itens Sem Saída no Período</div>' +
        '</div><div style="overflow-x:auto;">' +
        '<table style="width:100%;border-collapse:collapse;font-size:13px;">' +
        '<thead><tr style="background:var(--bg-2);">' +
        '<th style="padding:8px 12px;text-align:left;font-size:11px;color:var(--text-3);">Item</th>' +
        '<th style="padding:8px 12px;text-align:left;font-size:11px;color:var(--text-3);">Categoria</th>' +
        '<th style="padding:8px 12px;text-align:left;font-size:11px;color:var(--text-3);">Almoxarifado</th>' +
        '<th style="padding:8px 12px;text-align:left;font-size:11px;color:var(--text-3);">Última Mov.</th>' +
        '<th style="padding:8px 12px;text-align:right;font-size:11px;color:var(--text-3);">Dias Parado</th>' +
        '</tr></thead><tbody>' + paradoRows + '</tbody></table></div></div>';
}

function _renderTabCounts(cm) {
    var cd = cm.contagemData || { rows: [], totalSaidas: 0, sessAplicadas: 0, sessPendentes: 0, maiorConsumo: 0 };
    var kpis = '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px;">' +
        _kpiCard('Baixas Aplicadas', cd.sessAplicadas, 'ph-check-circle', 'var(--green)') +
        _kpiCard('Pendentes', cd.sessPendentes, 'ph-clock',
            cd.sessPendentes > 0 ? 'var(--orange)' : 'var(--green)', cd.sessPendentes > 0) +
        _kpiCard('Total Saídas (Cont.)', cd.totalSaidas, 'ph-arrow-up-right', 'var(--red)') +
        '</div>';

    if (cd.rows.length === 0) {
        return kpis + '<div class="card" style="text-align:center;padding:40px;">' +
            '<p style="color:var(--text-3);">Nenhuma sessão de contagem no período</p></div>';
    }

    var totDN = cd.rows.reduce(function (s, r) { return s + Math.max(0, r.deltaNight || 0); }, 0);
    var totDA = cd.rows.reduce(function (s, r) { return s + Math.max(0, r.deltaAdm   || 0); }, 0);

    var badge = function (l, c) {
        return '<span style="display:inline-flex;align-items:center;justify-content:center;' +
            'width:22px;height:22px;border-radius:50%;background:' + c + ';color:#fff;' +
            'font-size:11px;font-weight:800;">' + _escHtml(l) + '</span>';
    };

    var rows = cd.rows.map(function (r) {
        var anom   = r.deltaNight != null && r.deltaNight < 0;
        var rowBg  = anom ? 'background:rgba(239,68,68,.07);' : '';
        var dnFmt  = r.deltaNight != null
            ? '<span style="font-weight:700;color:' +
              (r.deltaNight < 0 ? '#ef4444' : r.deltaNight > 0 ? '#10b981' : 'var(--text-3)') + ';">' +
              (r.deltaNight >= 0 ? '+' : '') + r.deltaNight + '</span>'
            : '<span style="color:var(--text-3);">—</span>';
        var daFmt  = r.deltaAdm != null
            ? '<span style="font-weight:700;color:' +
              (r.deltaAdm > 0 ? '#f59e0b' : 'var(--text-3)') + ';">' +
              (r.deltaAdm >= 0 ? '+' : '') + r.deltaAdm + '</span>'
            : '<span style="color:var(--text-3);">—</span>';
        var bxBdg  = r.baixaStatus === 'APLICADA'
            ? '<span style="padding:2px 8px;border-radius:12px;font-size:10px;font-weight:700;background:#d1fae5;color:#065f46;">APLICADA</span>'
            : r.baixaStatus === 'PENDENTE'
            ? '<span style="padding:2px 8px;border-radius:12px;font-size:10px;font-weight:700;background:#fef9c3;color:#d97706;">PENDENTE</span>'
            : '<span style="font-size:11px;color:var(--text-3);">—</span>';
        return '<tr style="border-bottom:1px solid var(--border);' + rowBg + '">' +
            '<td style="padding:9px 12px;font-weight:600;">' + _escHtml(r.date) + '</td>' +
            '<td style="padding:9px 12px;">' + badge(r.turnoNoite, '#ef4444') + '</td>' +
            '<td style="padding:9px 12px;">' + badge(r.turnoDia,   '#f59e0b') + '</td>' +
            '<td style="padding:9px 12px;text-align:right;color:var(--text-2);">' + r.c1 + '</td>' +
            '<td style="padding:9px 12px;text-align:right;color:var(--text-2);">' + r.c2 + '</td>' +
            '<td style="padding:9px 12px;text-align:center;">' + dnFmt + '</td>' +
            '<td style="padding:9px 12px;text-align:right;color:var(--text-2);">' + r.c3 + '</td>' +
            '<td style="padding:9px 12px;text-align:center;">' + daFmt + '</td>' +
            '<td style="padding:9px 12px;text-align:center;">' + bxBdg + '</td></tr>';
    }).join('');

    var footer = '<tr style="background:var(--bg-2);font-weight:700;font-size:12px;">' +
        '<td style="padding:8px 12px;" colspan="3">TOTAIS</td>' +
        '<td></td><td></td>' +
        '<td style="padding:8px 12px;text-align:center;color:var(--green);">+' + totDN + '</td>' +
        '<td></td>' +
        '<td style="padding:8px 12px;text-align:center;color:var(--orange);">+' + totDA + '</td>' +
        '<td></td></tr>';

    return kpis +
        '<div class="card"><div style="padding:14px 16px 10px;border-bottom:1px solid var(--border);">' +
        '<div class="section-title"><i class="ph ph-clipboard-text" style="color:var(--accent);"></i> Histórico de Sessões de Contagem</div>' +
        '<p style="font-size:12px;color:var(--text-3);margin:4px 0 0;">Δ negativo (vermelho) indica anomalia — C2 > C1</p>' +
        '</div><div style="overflow-x:auto;">' +
        '<table style="width:100%;border-collapse:collapse;font-size:13px;">' +
        '<thead><tr style="background:var(--bg-2);">' +
        '<th style="padding:8px 12px;text-align:left;font-size:11px;color:var(--text-3);">Data</th>' +
        '<th style="padding:8px 12px;font-size:11px;color:var(--red);">T. Noite</th>' +
        '<th style="padding:8px 12px;font-size:11px;color:var(--orange);">T. Dia</th>' +
        '<th style="padding:8px 12px;text-align:right;font-size:11px;color:var(--text-3);">C1 Total</th>' +
        '<th style="padding:8px 12px;text-align:right;font-size:11px;color:var(--text-3);">C2 Total</th>' +
        '<th style="padding:8px 12px;text-align:center;font-size:11px;color:var(--red);">Δ Noite</th>' +
        '<th style="padding:8px 12px;text-align:right;font-size:11px;color:var(--text-3);">C3 Total</th>' +
        '<th style="padding:8px 12px;text-align:center;font-size:11px;color:var(--orange);">Δ ADM</th>' +
        '<th style="padding:8px 12px;text-align:center;font-size:11px;color:var(--text-3);">Baixa</th>' +
        '</tr></thead><tbody>' + rows + footer + '</tbody></table></div></div>';
}

function renderEpiDashboard() {
    var dash = state.dashboard || { loading: false, data: [], period: '30d', dashTab: 'overview' };
    var tab = dash.dashTab || 'overview';

    if (dash.loading) {
        return '<div class="page-wrap">' + renderHeader() + '<div class="page-content">' +
            '<div class="row-between" style="margin-bottom:16px;">' +
            '<h1 class="page-title"><i class="ph ph-chart-bar" style="color:var(--accent);"></i> Dashboard EPI</h1></div>' +
            '<div class="card" style="text-align:center;padding:64px;">' +
            '<div class="loading-spinner" style="margin:0 auto 16px;"></div>' +
            '<p style="color:var(--text-2);">Carregando dados...</p></div></div></div>';
    }

    var m = _computeDashMetrics();
    var lowN = m.lowStock.length;
    var periodOpts = [['7d', '7 dias'], ['30d', '30 dias'], ['90d', '90 dias'], ['all', 'Tudo']];
    var tabs = [
        ['overview', 'ph-chart-line', 'Visão Geral'],
        ['items', 'ph-list-numbers', 'Por Item'],
        ['sessions', 'ph-calendar-check', 'Sessões'],
        ['stock', 'ph-package', 'Estoque'],
        ['movements', 'ph-arrows-left-right', 'Movimentações']
    ];

    var kpis = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:16px;">' +
        _kpiCard('EPIs Distribuídos', m.totalEPIs, 'ph-package', 'var(--accent)') +
        _kpiCard('Cons. Noite', m.totalConsNoite, 'ph-moon', 'var(--red)') +
        _kpiCard('Dist. ADM', m.totalDistAdm, 'ph-sun', 'var(--orange)') +
        _kpiCard('Sessões', m.sessCount, 'ph-calendar-check', 'var(--green)') +
        _kpiCard('Itens Únicos', m.allItems.length, 'ph-tag', '#6366f1') +
        _kpiCard('Est. Baixo', lowN, 'ph-warning', lowN > 0 ? 'var(--red)' : 'var(--green)', lowN > 0) +
        '</div>';

    var perOpts = periodOpts.map(function (po) {
        var active = dash.period === po[0];
        return '<button onclick="state.dashboard.period=\'' + po[0] + '\';loadDashboardData()"' +
            ' style="padding:5px 14px;border-radius:20px;font-size:12px;font-weight:600;cursor:pointer;' +
            'border:1.5px solid ' + (active ? 'var(--accent)' : 'var(--border)') + ';' +
            'background:' + (active ? 'var(--accent)' : 'transparent') + ';' +
            'color:' + (active ? '#fff' : 'var(--text-2)') + ';">' + po[1] + '</button>';
    }).join('');

    var periodBar = '<div class="card" style="margin-bottom:12px;padding:12px 16px;">' +
        '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">' +
        '<span style="font-size:12px;font-weight:600;color:var(--text-3);">PERÍODO:</span>' +
        perOpts + '</div></div>';

    var tabNav = '<div style="display:flex;gap:0;border-bottom:2px solid var(--border);margin-bottom:16px;overflow-x:auto;">' +
        tabs.map(function (t) {
            var active = tab === t[0];
            return '<button onclick="setDashTab(\'' + t[0] + '\')"' +
                ' style="display:flex;align-items:center;gap:6px;padding:10px 16px;font-size:13px;font-weight:600;' +
                'border:none;background:none;cursor:pointer;white-space:nowrap;' +
                'color:' + (active ? 'var(--accent)' : 'var(--text-2)') + ';' +
                'border-bottom:2px solid ' + (active ? 'var(--accent)' : 'transparent') + ';' +
                'margin-bottom:-2px;">' +
                '<i class="ph ' + t[1] + '"></i> ' + t[2] + '</button>';
        }).join('') + '</div>';

    var content = '';
    if (tab === 'overview') content = _renderTabOverview(m);
    else if (tab === 'items') content = _renderTabItems(m);
    else if (tab === 'sessions') content = _renderTabSessions();
    else if (tab === 'stock') content = _renderTabStock();
    else if (tab === 'movements') content = _renderTabMovements(m);

    return '<div class="page-wrap">' + renderHeader() + '<div class="page-content">' +
        '<div class="row-between" style="margin-bottom:16px;">' +
        '<h1 class="page-title"><i class="ph ph-chart-bar" style="color:var(--accent);"></i> Dashboard EPI</h1>' +
        '<button onclick="loadDashboardData()" class="btn-secondary"><i class="ph ph-arrows-clockwise"></i> Atualizar</button></div>' +
        periodBar + kpis + tabNav + content + '</div></div>';
}

function renderDashboardCharts() {
    if (state.view !== 'epi_dashboard') return;
    var dash = state.dashboard || {};
    if (dash.loading) return;
    var tab = dash.dashTab || 'overview';
    var m = _computeDashMetrics();

    if (tab === 'overview') {
        var timeLabels = m.sortedDates.map(function (d) { return d.slice(8, 10) + '/' + d.slice(5, 7); });
        var timeConsData = m.sortedDates.map(function (d) { return m.byDate[d].cons; });
        var timeDistData = m.sortedDates.map(function (d) { return m.byDate[d].dist; });
        _mkDashChart('dash-chart-timeline', {
            type: 'line',
            data: {
                labels: timeLabels,
                datasets: [
                    { label: 'Cons. Noite', data: timeConsData, borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,.12)', fill: true, tension: 0.35, pointRadius: 3, borderWidth: 2 },
                    { label: 'Dist. ADM', data: timeDistData, borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,.12)', fill: true, tension: 0.35, pointRadius: 3, borderWidth: 2 }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11 } } } },
                scales: {
                    x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 45 } },
                    y: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 10 } }, beginAtZero: true }
                }
            }
        });
        var turnoLabels = [], turnoData = [], turnoColors = ['#6366f1', '#f59e0b', '#ef4444', '#10b981', '#64748b'];
        var tIdx = 0;
        Object.entries(m.byTurnoLetter).forEach(function (e) {
            if (e[1] > 0) { turnoLabels.push(e[0] === 'ADM' ? 'ADM/Dia' : 'Turno ' + e[0]); turnoData.push(e[1]); tIdx++; }
        });
        _mkDashChart('dash-chart-turno', {
            type: 'doughnut',
            data: { labels: turnoLabels, datasets: [{ data: turnoData, backgroundColor: turnoColors.slice(0, tIdx), borderWidth: 2 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } } }
        });
        var top10 = m.allItems.slice(0, 10);
        _mkDashChart('dash-chart-top', {
            type: 'bar',
            data: {
                labels: top10.map(function (e) { var n = e[0]; return n.length > 22 ? n.slice(0, 22) + '…' : n; }),
                datasets: [
                    { label: 'Cons. Noite', data: top10.map(function (e) { return e[1].consumo; }), backgroundColor: 'rgba(239,68,68,.8)', borderRadius: 4 },
                    { label: 'Dist. ADM', data: top10.map(function (e) { return e[1].distAdm; }), backgroundColor: 'rgba(245,158,11,.8)', borderRadius: 4 }
                ]
            },
            options: {
                indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11 } } } },
                scales: {
                    x: { stacked: false, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 10 } } },
                    y: { stacked: false, grid: { display: false }, ticks: { font: { size: 11 } } }
                }
            }
        });
    } else if (tab === 'stock') {
        var stockItems = (dash.stockItems || []).slice().sort(function (a, b) { return (b.quantidade || 0) - (a.quantidade || 0); }).slice(0, 20);
        var stockColors = stockItems.map(function (i) {
            return (i.estoque_minimo != null && i.quantidade != null && i.quantidade <= i.estoque_minimo) ? 'rgba(214,69,69,.8)' : 'rgba(46,158,90,.8)';
        });
        _mkDashChart('dash-chart-stock', {
            type: 'bar',
            data: {
                labels: stockItems.map(function (i) { var n = i.nome || ''; return n.length > 20 ? n.slice(0, 20) + '…' : n; }),
                datasets: [{ label: 'Em Estoque', data: stockItems.map(function (i) { return i.quantidade || 0; }), backgroundColor: stockColors, borderRadius: 4 }]
            },
            options: {
                indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 10 } }, beginAtZero: true },
                    y: { grid: { display: false }, ticks: { font: { size: 11 } } }
                }
            }
        });
    }
}

// ============================================
// INICIALIZAÇÃO (SSO)
// ============================================
document.addEventListener("DOMContentLoaded", async () => {
    await ALM_AUTH.init();
});
