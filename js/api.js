/**
 * Almoxarifado EPI — API
 * Funções de acesso ao banco de dados (Supabase)
 */

async function getItems(forceRefresh = false) {
    if (!forceRefresh && cache.items && isCacheValid(cache.itemsTimestamp)) {
        return { success: true, items: cache.items };
    }
    try {
        const { data, error } = await sbClient.from('items').select('*').order('nome');
        if (error) throw error;
        if (data) {
            data.forEach(item => {
                if (item.tamanhos !== null && typeof item.tamanhos === 'string') {
                    try { item.tamanhos = JSON.parse(item.tamanhos); }
                    catch (e) { item.tamanhos = null; }
                }
            });
        }
        cache.items = data;
        cache.itemsTimestamp = Date.now();
        return { success: true, items: data };
    } catch (error) {
        console.error('Erro ao buscar itens:', error);
        return { success: false, error: error.message };
    }
}

async function saveItem(item) {
    if (item.tamanhos !== null && typeof item.tamanhos === 'string') {
        try { item.tamanhos = JSON.parse(item.tamanhos); } catch (e) { item.tamanhos = null; }
    }
    const isNew = !state.items.find(i => i.id === item.id);
    const originalItems = [...state.items];
    if (isNew) {
        state.items.push(item);
    } else {
        const index = state.items.findIndex(i => i.id === item.id);
        state.items[index] = item;
    }
    render();
    showToast(isNew ? 'Item cadastrado!' : 'Item atualizado!', 'success', 2000);
    try {
        const { error } = await sbClient.from('items').upsert(item);
        if (error) throw error;
        cache.items = null;
        cache.itemsTimestamp = null;
        loadItems(true);
        return { success: true };
    } catch (error) {
        console.error('Erro ao salvar item:', error);
        state.items = originalItems;
        render();
        showToast('Erro ao salvar item: ' + error.message, 'error');
        return { success: false, error: error.message };
    }
}

async function deleteItem(itemId) {
    const itemBackup = state.items.find(i => i.id === itemId);
    state.items = state.items.filter(i => i.id !== itemId);
    render();
    showToast('Item excluído!', 'success', 2000);
    try {
        const { error } = await sbClient.from('items').delete().eq('id', itemId);
        if (error) throw error;
        cache.items = null;
        cache.itemsTimestamp = null;
        return { success: true };
    } catch (error) {
        console.error('Erro ao deletar item:', error);
        state.items.push(itemBackup);
        render();
        showToast('Erro ao excluir item: ' + error.message, 'error');
        return { success: false, error: error.message };
    }
}

async function saveMovement(movement) {
    const item = state.items.find(i => i.id === movement.item_id);
    if (item) {
        const oldQuantity = item.quantidade;
        const oldTamanhos = item.tamanhos ? JSON.parse(JSON.stringify(item.tamanhos)) : null;

        if (movement.size) {
            if (!item.tamanhos || typeof item.tamanhos !== 'object') item.tamanhos = {};
            if (movement.type === 'COMPRA') {
                item.tamanhos[movement.size] = (item.tamanhos[movement.size] || 0) + movement.quantity;
            } else {
                item.tamanhos[movement.size] = Math.max(0, (item.tamanhos[movement.size] || 0) - movement.quantity);
            }
            item.quantidade = Object.values(item.tamanhos).reduce((acc, curr) => acc + curr, 0);
        } else {
            if (movement.type === 'COMPRA') {
                item.quantidade += movement.quantity;
            } else if (['DISTRIBUICAO', 'SAIDA', 'REPOSICAO'].includes(movement.type)) {
                item.quantidade -= movement.quantity;
            } else if (movement.type === 'AJUSTE') {
                item.quantidade = movement.quantity;
            }
        }

        render();
        showToast('Movimentação registrada!', 'success', 2000);

        try {
            const { error: movError } = await sbClient.from('movements').insert([movement]);
            if (movError) throw movError;

            const { error: itemError } = await sbClient
                .from('items')
                .update({ quantidade: item.quantidade, tamanhos: item.tamanhos })
                .eq('id', item.id);
            if (itemError) throw itemError;

            cache.movements = null;
            cache.movementsTimestamp = null;
            cache.items = null;
            cache.itemsTimestamp = null;
            cache.statistics = null;
            cache.statisticsTimestamp = null;
            loadItems(true);
            return { success: true };
        } catch (error) {
            console.error('Erro ao salvar movimentação:', error);
            item.quantidade = oldQuantity;
            item.tamanhos = oldTamanhos;
            render();
            showToast('Erro ao registrar movimentação: ' + error.message, 'error');
            return { success: false, error: error.message };
        }
    }
}

async function getMovements(filters, forceRefresh = false) {
    const filterKey = JSON.stringify(filters);
    if (!forceRefresh && cache.movements && cache.movementsFilterKey === filterKey && isCacheValid(cache.movementsTimestamp)) {
        return { success: true, movements: cache.movements };
    }
    try {
        let query = sbClient.from('movements').select('*').order('date', { ascending: false });
        if (filters.startDate) query = query.gte('date', filters.startDate);
        if (filters.endDate)   query = query.lte('date', filters.endDate);
        if (filters.type && filters.type !== 'TODOS') query = query.eq('type', filters.type);
        const { data, error } = await query;
        if (error) throw error;
        cache.movements = data;
        cache.movementsFilterKey = filterKey;
        cache.movementsTimestamp = Date.now();
        return { success: true, movements: data };
    } catch (error) {
        console.error('Erro ao buscar movimentações:', error);
        return { success: false, error: error.message };
    }
}

async function getStatistics() {
    if (cache.statistics && isCacheValid(cache.statisticsTimestamp)) {
        return { success: true, statistics: cache.statistics };
    }
    try {
        const { count: totalItems } = await sbClient.from('items').select('*', { count: 'exact', head: true });
        const { data: stockData } = await sbClient.from('items').select('quantidade');
        const totalStock = stockData.reduce((acc, curr) => acc + (curr.quantidade || 0), 0);
        const { count: lowStock } = await sbClient.from('items').select('*', { count: 'exact', head: true }).lt('quantidade', 10);
        const statistics = { totalItems, totalStock, lowStock, lastUpdate: new Date().toISOString() };
        cache.statistics = statistics;
        cache.statisticsTimestamp = Date.now();
        return { success: true, statistics };
    } catch (error) {
        console.error('Erro ao buscar estatísticas:', error);
        return { success: false, error: error.message };
    }
}

async function getWarehouses(forceRefresh = false) {
    if (!forceRefresh && cache.warehouses && isCacheValid(cache.warehousesTimestamp)) {
        return { success: true, warehouses: cache.warehouses };
    }
    try {
        const { data, error } = await sbClient.from('warehouses').select('*').order('id');
        if (error) throw error;
        cache.warehouses = data;
        cache.warehousesTimestamp = Date.now();
        return { success: true, warehouses: data };
    } catch (error) {
        const defaults = [
            { id: 'alm-1', nome: 'Almoxarifado Central', descricao: 'Estoque principal de EPIs' },
            { id: 'alm-2', nome: 'Almoxarifado Distribuição', descricao: 'Itens prontos para distribuição' },
            { id: 'alm-emergencial', nome: 'Emergencial', descricao: 'Saídas emergenciais e distribuição imediata' }
        ];
        cache.warehouses = defaults;
        cache.warehousesTimestamp = Date.now();
        return { success: true, warehouses: defaults };
    }
}

async function saveWarehouse(warehouse) {
    try {
        const { error } = await sbClient.from('warehouses').upsert(warehouse);
        if (error) throw error;
        cache.warehouses = null;
        cache.warehousesTimestamp = null;
        await loadWarehouses(true);
        showToast('Almoxarifado atualizado!', 'success');
        return { success: true };
    } catch (error) {
        console.error('Erro ao salvar almoxarifado:', error);
        showToast('Erro ao salvar: ' + error.message, 'error');
        return { success: false, error: error.message };
    }
}

async function createCountSession(sessionData) {
    try {
        const { data, error } = await sbClient
            .from('count_sessions')
            .upsert(sessionData, { onConflict: 'id' })
            .select()
            .single();
        if (error) throw error;
        return data;
    } catch (err) {
        console.error('Erro ao criar sessão:', err);
        showToast('Erro ao criar sessão: ' + err.message, 'error');
        return null;
    }
}
