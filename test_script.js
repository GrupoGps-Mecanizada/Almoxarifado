
        // ============================================
        // CONFIGURAÇÃO SUPABASE
        // ============================================
        const SUPABASE_URL = 'https://mgcjidryrjqiceielmzp.supabase.co';
        const SUPABASE_ANON_KEY = 'sb_publishable_1FBWf1mb1o5_J60VDlsfaA_IOsIFq6e';
        const sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            auth: {
                flowType: 'implicit',
                detectSessionInUrl: false
            }
        });

        // ============================================
        // CACHE E ESTADO
        // ============================================

        // Cache otimizado
        const cache = {
            movements: null,
            movementsTimestamp: null,
            movementsFilterKey: null,
            items: null,
            itemsTimestamp: null,
            statistics: null,
            statisticsTimestamp: null,
            warehouses: null,
            warehousesTimestamp: null,
            CACHE_DURATION: 300000 // 5 minutos
        };

        // ============================================
        // TIPOS DE MOVIMENTAÇÃO
        // ============================================
        const MOVEMENT_TYPES = {
            'COMPRA': { label: 'Compra de Estoque', color: 'emerald', icon: 'shopping-cart', sign: '+' },
            'REPOSICAO': { label: 'Reposição', color: 'blue', icon: 'arrow-clockwise', sign: '-' },
            'DISTRIBUICAO': { label: 'Distribuição EPI', color: 'purple', icon: 'hand-coins', sign: '-' },
            'SAIDA': { label: 'Saída', color: 'red', icon: 'arrow-up-right', sign: '-' },
            'AJUSTE': { label: 'Ajuste', color: 'amber', icon: 'wrench', sign: '±' },
            'TRANSFERENCIA': { label: 'Transferência', color: 'cyan', icon: 'arrows-left-right', sign: '→' }
        };

        // ============================================
        // ESTADO DA APLICAÇÃO
        // ============================================
        let state = {
            view: 'checking',
            previousView: null,
            user: null,
            items: [],
            movements: [],
            selectedDate: getCurrentDate(),
            isLoading: false,
            loadingMessage: '',
            loginError: '',

            // Paginação
            currentPage: 1,
            itemsPerPage: 50,

            // Filtros avançados
            filters: {
                startDate: getFirstDayOfMonth(),
                endDate: getCurrentDate(),
                type: 'TODOS',
                searchTerm: '',
                category: 'TODAS',
                minQuantity: '',
                maxQuantity: '',
                lowStockOnly: false
            },

            // Operação de movimentação
            movementOperation: {
                active: false,
                type: null,
                selectedItem: null,
                employeeName: '',
                supplier: '',
                quantity: 1,
                observations: '',
                returnedOldEpi: null,
                targetWarehouse: 'alm-1',
                createNewItem: false,
                newItemName: '',
                newItemCategory: '',
                newItemUnit: 'UN'
            },

            // Edição de item
            editingItem: null,

            // Estatísticas e Analytics
            statistics: null,
            analytics: {
                weeklyExpenses: [],
                monthlyExpenses: [],
                topReplenishedItems: [],
                categoryDistribution: []
            },

            // Almoxarifados
            warehouses: [
                { id: 'alm-1', nome: 'Almoxarifado Central', descricao: 'Estoque principal de EPIs' },
                { id: 'alm-2', nome: 'Almoxarifado Distribuição', descricao: 'Itens prontos para distribuição' },
                { id: 'alm-emergencial', nome: 'Emergencial', descricao: 'Saídas emergenciais e distribuição imediata' }
            ],
            activeWarehouse: 'alm-1',

            // Saída Emergencial
            emergency: {
                cart: [],           // [{ item_id, item_name, unidade, quantidade, max, warehouse_id, size }]
                saving: false,
                showForm: false,
                formItemId: '',
                formSize: '',
                formQty: 1
            },

            // Operação de transferência
            transferOperation: {
                active: false,
                fromWarehouse: 'alm-1',
                toWarehouse: 'alm-2',
                selectedItem: null,
                size: null,
                quantity: 1,
                observations: ''
            },

            // Edição de almoxarifado
            editingWarehouse: null,

            // Modal de Dar Baixa Direta
            baixaModal: {
                open: false,
                item: null,       // item completo
                size: '',         // tamanho selecionado
                quantidade: 1,    // qtd a dar baixa
                motivo: '',       // observações opcionais
                saving: false
            },

            // Contagem Diária
            contagem: {
                loading: false,
                date: getCurrentDate(),
                entries1: {},        // C1 — Abastecimento (turno noite)
                entries2: {},        // C2 — Conferência de chegada
                entries3: {},        // C3 — Pós-distribuição ADM
                todayCounts: {},     // { item_id: { c1, c2, c3 } }
                lastC1: {},
                lastC2: {},
                saving: false,
                savedResult: null,
                baixaAplicada: false,
                baixaDates: {},
                tab: 'chamados',
                history: [],
                historyLoading: false,
                turno: null,         // session_id (ex: CTG-20250513-001)
                horario: '',
                newStep: 1,          // 1=form sessão | 2=data | 3=tabela contagem
                contagemStep: 1,
                openTickets: [],
                historyTurnoFilter: 'TODOS',
                // Sessão atual
                currentSession: null, // { id, date, turno_noite, turno_dia, c1_horario, c2_horario, c3_horario }
            }
        };

        // Navigation history para o botão voltar
        let navigationHistory = [];

        // Debounce timer
        let searchDebounceTimer = null;

        // Pull to refresh
        let touchStartY = 0;
        let pullDistance = 0;
        const PULL_THRESHOLD = 80;

        // ============================================
        // UTILITÁRIOS
        // ============================================
        function getCurrentDate() {
            return new Date().toISOString().split('T')[0];
        }

        function turnoColor(t) {
            return { A: 'var(--accent)', B: 'var(--green)', C: 'var(--orange)', D: 'var(--purple)', ADM: '#0891b2' }[t] || 'var(--text-3)';
        }
        function turnoBg(t) {
            return {
                A: 'var(--accent-glow)',
                B: 'color-mix(in srgb,var(--green) 10%,transparent)',
                C: 'color-mix(in srgb,var(--orange) 10%,transparent)',
                D: 'color-mix(in srgb,var(--purple) 10%,transparent)',
                ADM: 'color-mix(in srgb,#0891b2 10%,transparent)'
            }[t] || 'var(--bg-2)';
        }
        function turnoBadge(t) {
            if (!t) return `<span class="badge badge-gray">—</span>`;
            return `<span class="badge" style="background:${turnoBg(t)};color:${turnoColor(t)};font-weight:700;border:1px solid ${turnoColor(t)}33;">Turno ${t}</span>`;
        }

        function getFirstDayOfMonth() {
            const now = new Date();
            return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        }

        function formatDate(dateStr) {
            if (!dateStr) return '';
            try {
                let date;
                if (dateStr instanceof Date) {
                    date = dateStr;
                } else if (typeof dateStr === 'string') {
                    if (dateStr.includes('-') && dateStr.length === 10) {
                        date = new Date(dateStr + 'T12:00:00');
                    } else {
                        date = new Date(dateStr);
                    }
                } else {
                    date = new Date(dateStr);
                }

                return date.toLocaleDateString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric'
                });
            } catch (e) {
                console.error('Erro ao formatar data:', dateStr, e);
                return dateStr;
            }
        }

        function formatDateTime(dateStr) {
            if (!dateStr) return '';
            try {
                const date = new Date(dateStr);
                return date.toLocaleString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
            } catch (e) {
                console.error('Erro ao formatar data/hora:', dateStr, e);
                return dateStr;
            }
        }

        function formatCurrency(value) {
            return new Intl.NumberFormat('pt-BR', {
                style: 'currency',
                currency: 'BRL'
            }).format(value);
        }

        function getColorClass(color, type = 'bg') {
            const colors = {
                emerald: type === 'bg' ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'bg-emerald-600',
                red: type === 'bg' ? 'bg-red-500/20 border-red-500 text-red-400' : 'bg-red-600',
                blue: type === 'bg' ? 'bg-blue-500/20 border-blue-500 text-blue-400' : 'bg-blue-600',
                purple: type === 'bg' ? 'bg-purple-500/20 border-purple-500 text-purple-400' : 'bg-purple-600',
                amber: type === 'bg' ? 'bg-amber-500/20 border-amber-500 text-amber-400' : 'bg-amber-600',
                slate: type === 'bg' ? 'bg-slate-500/20 border-slate-500 text-slate-500' : 'bg-slate-600'
            };
            return colors[color] || colors.slate;
        }

        function debounce(func, wait) {
            return function executedFunction(...args) {
                clearTimeout(searchDebounceTimer);
                searchDebounceTimer = setTimeout(() => func(...args), wait);
            };
        }

        function isCacheValid(timestamp) {
            if (!timestamp) return false;
            return (Date.now() - timestamp) < cache.CACHE_DURATION;
        }

        // ============================================
        // TOAST NOTIFICATIONS
        // ============================================
        function showToast(message, type = 'info', duration = 3000) {
            const container = document.getElementById('toast-container');
            const toast = document.createElement('div');
            toast.className = `toast toast-${type}`;
            toast.innerHTML = `
        <i class="ph-fill ph-${type === 'success' ? 'check-circle' : type === 'error' ? 'x-circle' : 'info'}" style="font-size:18px;flex-shrink:0;"></i>
        <span>${message}</span>
    `;
            container.appendChild(toast);
            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transform = 'translateX(120%)';
                toast.style.transition = 'all 0.3s ease';
                setTimeout(() => { if (toast.parentNode) container.removeChild(toast); }, 300);
            }, duration);
        }

        // ============================================
        // NAVEGAÇÃO E HISTÓRICO
        // ============================================
        function navigateTo(view) {
            if (state.view !== view) {
                navigationHistory.push(state.view);
                state.previousView = state.view;
                state.view = view;
                render();
            }
        }

        function goBack() {
            if (navigationHistory.length > 0) {
                const previousView = navigationHistory.pop();
                state.view = previousView;
                render();
                return true;
            }
            return false;
        }

        // Intercepta o botão voltar do navegador/dispositivo
        document.addEventListener('keydown', (e) => {
            // ESC para voltar
            if (e.key === 'Escape' && state.view !== 'login') {
                e.preventDefault();
                if (state.view === 'dashboard') {
                    if (confirm('Deseja sair do sistema?')) {
                        handleLogout();
                    }
                } else {
                    if (!goBack()) {
                        navigateTo('stock');
                    }
                }
            }
        });

        // Logout automático ao fechar a aba/navegador
        window.addEventListener('beforeunload', (e) => {
            // Salva estado antes de sair
            if (state.user) {
                // Mantém a sessão salva para próxima vez
                // Se quiser deslogar, descomente a linha abaixo:
                // clearSession();
            }
        });

        // Logout automático ao sair da página (navegar para outro site)
        window.addEventListener('pagehide', (e) => {
            // Desloga ao sair da página
            clearSession();
        });

        // ============================================
        // PERSISTÊNCIA DE LOGIN (7 DIAS)
        // ============================================
        // Sessão gerenciada pelo próprio Supabase (persistSession: true por padrão)
        function saveSession() { } // mantido para compatibilidade — Supabase salva automaticamente
        function loadSession() { return null; } // não usado — ver DOMContentLoaded
        function clearSession() { localStorage.removeItem('epi_session'); }

        // ============================================
        // SERVIÇOS / API COM OPTIMISTIC UI
        // ============================================
        async function login(email, password) {
            try {
                const { data, error } = await sbClient.auth.signInWithPassword({
                    email: email,
                    password: password
                });

                if (error) throw error;

                // Busca o perfil para obter o nome
                const { data: profile, error: profileError } = await sbClient
                    .from('profiles')
                    .select('nome')
                    .eq('id', data.user.id)
                    .single();

                return {
                    success: true,
                    user: {
                        id: data.user.id,
                        nome: profile?.nome || data.user.email,
                        email: data.user.email
                    }
                };
            } catch (error) {
                console.error('Erro no login:', error);
                return { success: false, error: error.message };
            }
        }

        async function getItems(forceRefresh = false) {
            if (!forceRefresh && cache.items && isCacheValid(cache.itemsTimestamp)) {
                return { success: true, items: cache.items };
            }

            try {
                const { data, error } = await sbClient
                    .from('items')
                    .select('*')
                    .order('nome');

                if (error) throw error;

                // Normaliza tamanhos: pode vir como string JSON se a coluna for text
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
            // Normaliza tamanhos antes de salvar/usar
            if (item.tamanhos !== null && typeof item.tamanhos === 'string') {
                try { item.tamanhos = JSON.parse(item.tamanhos); } catch (e) { item.tamanhos = null; }
            }
            // Optimistic UI
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
                const { error } = await sbClient
                    .from('items')
                    .upsert(item);

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
            // Optimistic UI
            const itemBackup = state.items.find(i => i.id === itemId);
            state.items = state.items.filter(i => i.id !== itemId);
            render();
            showToast('Item excluído!', 'success', 2000);

            try {
                const { error } = await sbClient
                    .from('items')
                    .delete()
                    .eq('id', itemId);

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
            // Optimistic UI
            const item = state.items.find(i => i.id === movement.item_id);
            if (item) {
                const oldQuantity = item.quantidade;
                const oldTamanhos = item.tamanhos ? JSON.parse(JSON.stringify(item.tamanhos)) : null;

                // Atualiza quantidade baseado no tipo
                if (movement.size) {
                    // Inicializa tamanhos se o item ainda não tinha (ex: criado sem checkbox de tamanhos)
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
                    // 1. Registrar a movimentação
                    const { error: movError } = await sbClient
                        .from('movements')
                        .insert([movement]);

                    if (movError) throw movError;

                    // 2. Atualizar o estoque do item
                    const { error: itemError } = await sbClient
                        .from('items')
                        .update({
                            quantidade: item.quantidade,
                            tamanhos: item.tamanhos
                        })
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
                    // Reverte em caso de erro
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
                let query = sbClient
                    .from('movements')
                    .select('*')
                    .order('date', { ascending: false });

                if (filters.startDate) query = query.gte('date', filters.startDate);
                if (filters.endDate) query = query.lte('date', filters.endDate);
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
                // Busca resumo rápido
                const { count: totalItems } = await sbClient
                    .from('items')
                    .select('*', { count: 'exact', head: true });

                const { data: stockData } = await sbClient
                    .from('items')
                    .select('quantidade');

                const totalStock = stockData.reduce((acc, curr) => acc + (curr.quantidade || 0), 0);

                const { count: lowStock } = await sbClient
                    .from('items')
                    .select('*', { count: 'exact', head: true })
                    .lt('quantidade', 10); // Exemplo de estoque baixo

                const statistics = {
                    totalItems,
                    totalStock,
                    lowStock,
                    lastUpdate: new Date().toISOString()
                };

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
                const { data, error } = await sbClient
                    .from('warehouses')
                    .select('*')
                    .order('id');
                if (error) throw error;
                cache.warehouses = data;
                cache.warehousesTimestamp = Date.now();
                return { success: true, warehouses: data };
            } catch (error) {
                // Fallback se a tabela ainda não existir
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
                const { error } = await sbClient
                    .from('warehouses')
                    .upsert(warehouse);
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

        async function transferItems() {
            const op = state.transferOperation;
            if (!op.selectedItem || op.quantity <= 0) {
                showToast('Preencha todos os campos', 'error');
                return;
            }

            const sourceItem = state.items.find(i => i.id === op.selectedItem);
            if (!sourceItem) {
                showToast('Item não encontrado', 'error');
                return;
            }

            // Verifica estoque
            if (op.size && sourceItem.tamanhos) {
                if ((sourceItem.tamanhos[op.size] || 0) < op.quantity) {
                    showToast(`Estoque insuficiente para tamanho ${op.size}`, 'error');
                    return;
                }
            } else if (!op.size && sourceItem.quantidade < op.quantity) {
                showToast('Quantidade insuficiente no estoque', 'error');
                return;
            }

            const fromWarehouse = state.warehouses.find(w => w.id === op.fromWarehouse);
            const toWarehouse = state.warehouses.find(w => w.id === op.toWarehouse);

            // Optimistic: atualiza origem
            const newSourceTamanhos = sourceItem.tamanhos ? JSON.parse(JSON.stringify(sourceItem.tamanhos)) : null;
            if (op.size && newSourceTamanhos) {
                newSourceTamanhos[op.size] = (newSourceTamanhos[op.size] || 0) - op.quantity;
                sourceItem.tamanhos = newSourceTamanhos;
                sourceItem.quantidade = Object.values(newSourceTamanhos).reduce((a, b) => a + b, 0);
            } else {
                sourceItem.quantidade -= op.quantity;
            }

            // Procura item equivalente no destino
            let destItem = state.items.find(i =>
                i.warehouse_id === op.toWarehouse &&
                i.nome === sourceItem.nome &&
                i.categoria === sourceItem.categoria
            );

            let newDestItem = null;
            if (destItem) {
                if (op.size && destItem.tamanhos) {
                    destItem.tamanhos[op.size] = (destItem.tamanhos[op.size] || 0) + op.quantity;
                    destItem.quantidade = Object.values(destItem.tamanhos).reduce((a, b) => a + b, 0);
                } else {
                    destItem.quantidade += op.quantity;
                }
            } else {
                newDestItem = {
                    ...sourceItem,
                    id: 'ITEM-TRF-' + Date.now(),
                    warehouse_id: op.toWarehouse,
                    quantidade: op.quantity,
                    tamanhos: op.size && sourceItem.tamanhos
                        ? Object.fromEntries(Object.keys(sourceItem.tamanhos).map(s => [s, s === op.size ? op.quantity : 0]))
                        : null
                };
                state.items.push(newDestItem);
            }

            render();
            showToast(`Transferindo para ${toWarehouse?.nome || 'destino'}...`, 'info', 2000);

            try {
                // 1. Registra movimentação (com fallback se coluna não existir no banco)
                const movementPayload = {
                    date: getCurrentDate(),
                    type: 'TRANSFERENCIA',
                    item_id: sourceItem.id,
                    item_name: op.size ? `${sourceItem.nome} (Tam: ${op.size})` : sourceItem.nome,
                    size: op.size,
                    quantity: op.quantity,
                    user_name: state.user.nome,
                    observations: op.observations || `Transferido de ${fromWarehouse?.nome} para ${toWarehouse?.nome}`,
                    destination_warehouse_id: op.toWarehouse
                };

                let movResult = await sbClient.from('movements').insert([movementPayload]);
                if (movResult.error) {
                    // Pode ser que a coluna destination_warehouse_id não exista,
                    // ou que exista uma constraint no banco rejeitando o type 'TRANSFERENCIA'.
                    console.warn('Retentando sem destination_warehouse_id ou ajustando type:', movResult.error.message);
                    const { destination_warehouse_id, ...movFallback } = movementPayload;

                    // Fallback para tipo existente caso a constraint do banco rejeite TRANSFERENCIA
                    movFallback.type = 'SAIDA';
                    movFallback.observations = '[TRANSFERÊNCIA] ' + (movFallback.observations || '');

                    movResult = await sbClient.from('movements').insert([movFallback]);
                    if (movResult.error) throw movResult.error;
                }

                // 2. Atualiza item de origem
                const { error: srcErr } = await sbClient.from('items')
                    .update({ quantidade: sourceItem.quantidade, tamanhos: sourceItem.tamanhos })
                    .eq('id', sourceItem.id);
                if (srcErr) throw srcErr;

                // 3. Cria ou atualiza item no destino
                if (destItem) {
                    const { error: dstErr } = await sbClient.from('items')
                        .update({ quantidade: destItem.quantidade, tamanhos: destItem.tamanhos })
                        .eq('id', destItem.id);
                    if (dstErr) throw dstErr;
                } else if (newDestItem) {
                    let insResult = await sbClient.from('items').insert([newDestItem]);
                    if (insResult.error) {
                        // warehouse_id ou id duplicado pode causar erro
                        console.warn('Retentando insert de destino sem warehouse_id:', insResult.error.message);
                        const { warehouse_id, id: _id, ...itemFallback } = newDestItem;
                        insResult = await sbClient.from('items').insert([itemFallback]);
                        if (insResult.error) throw insResult.error;
                    }
                }

                cache.items = null;
                cache.itemsTimestamp = null;
                cache.movements = null;
                cache.movementsTimestamp = null;
                await loadItems(true);

                showToast('Transferência concluída!', 'success');

                state.transferOperation = {
                    active: false, fromWarehouse: 'alm-1', toWarehouse: 'alm-2',
                    selectedItem: null, size: null, quantity: 1, observations: ''
                };
                goBack();

            } catch (error) {
                console.error('Erro na transferência:', error);
                showToast('Erro na transferência: ' + error.message, 'error');
                await loadItems(true);
            }
        }

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
        async function handleLogin(e) {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;

            if (!email || !password) {
                showToast('Preencha todos os campos', 'error');
                return;
            }

            state.isLoading = true;
            state.loadingMessage = 'Autenticando...';
            render();

            const result = await login(email, password);

            if (result.success) {
                state.user = result.user;
                state.loadingMessage = 'Carregando dados...';
                render();

                await loadItems();
                navigateTo('stock');
                showToast(`Bem-vindo, ${result.user.nome}!`, 'success');
            } else {
                state.loginError = result.error || 'Erro ao entrar. Verifique suas credenciais.';
                showToast('Login falhou: ' + (result.error || 'Credenciais inválidas'), 'error');
            }

            state.isLoading = false;
            state.loadingMessage = '';
            render();
        }

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
        // EXPORTAÇÃO PARA EXCEL (SHEETJS)
        // ============================================
        function exportStockToXLSX() {
            try {
                if (!state.items || state.items.length === 0) {
                    showToast('Não há dados para exportar', 'error');
                    return;
                }

                const workbook = XLSX.utils.book_new();
                const dateStr = getCurrentDate();

                // Colunas fixas base
                const BASE_COLS = ['#', 'Nome do Item', 'Categoria', 'Unidade', 'Qtd Total', 'Observações'];

                // Descobre todos os tamanhos usados em qualquer item
                const allSizes = [...new Set(
                    state.items.flatMap(i => i.tamanhos ? Object.keys(i.tamanhos) : [])
                )].sort();

                const buildSheet = (items, warehouseName) => {
                    if (items.length === 0) return null;

                    // ---- Cabeçalho informativo ----
                    const titleRows = [
                        [`RELATÓRIO DE ESTOQUE — ${warehouseName.toUpperCase()}`],
                        [`Gerado em: ${new Date().toLocaleString('pt-BR')}`],
                        [`Total de itens: ${items.length}   |   Total em estoque: ${items.reduce((s, i) => s + (i.quantidade || 0), 0)}`],
                        [] // linha vazia
                    ];

                    const headers = [...BASE_COLS, ...allSizes.map(s => `Tam: ${s}`)];

                    let rowIndex = 1;
                    const ws = {};
                    const range = { s: { c: 0, r: 0 }, e: { c: headers.length - 1, r: 0 } };

                    // Escreve linhas do cabeçalho informativo
                    titleRows.forEach((row) => {
                        row.forEach((val, c) => {
                            ws[XLSX.utils.encode_cell({ r: rowIndex - 1, c })] = { v: val, t: 's' };
                        });
                        rowIndex++;
                    });

                    // Escreve linha de headers das colunas
                    headers.forEach((h, c) => {
                        const cell = { v: h, t: 's' };
                        ws[XLSX.utils.encode_cell({ r: rowIndex - 1, c })] = cell;
                    });
                    rowIndex++;

                    // Escreve os dados
                    items.forEach((item, idx) => {
                        const row = [
                            idx + 1,
                            item.nome || '',
                            item.categoria || '',
                            item.unidade || '',
                            item.quantidade || 0,
                            item.observacoes || '',
                            ...allSizes.map(s => item.tamanhos ? (item.tamanhos[s] ?? '') : '')
                        ];
                        row.forEach((val, c) => {
                            const t = typeof val === 'number' ? 'n' : 's';
                            ws[XLSX.utils.encode_cell({ r: rowIndex - 1, c })] = { v: val, t };
                        });
                        rowIndex++;
                    });

                    range.e.r = rowIndex - 1;
                    ws['!ref'] = XLSX.utils.encode_range(range);

                    // Larguras das colunas
                    ws['!cols'] = [
                        { wch: 4 },  // #
                        { wch: 32 }, // Nome
                        { wch: 20 }, // Categoria
                        { wch: 8 },  // Unidade
                        { wch: 10 }, // Qtd
                        { wch: 30 }, // Observações
                        ...allSizes.map(() => ({ wch: 10 }))
                    ];

                    return ws;
                };

                // Aba: Resumo geral (todos os almoxarifados)
                const resumoData = state.warehouses.map(wh => {
                    const whItems = state.items.filter(i => (i.warehouse_id || 'alm-1') === wh.id);
                    return {
                        'Almoxarifado': wh.nome,
                        'Total de Itens': whItems.length,
                        'Quantidade em Estoque': whItems.reduce((s, i) => s + (i.quantidade || 0), 0),
                        'Itens com Estoque Zerado': whItems.filter(i => i.quantidade === 0).length,
                        'Itens com Estoque Baixo (< 10)': whItems.filter(i => i.quantidade > 0 && i.quantidade < 10).length
                    };
                });
                const wsResumo = XLSX.utils.json_to_sheet(resumoData);
                wsResumo['!cols'] = [{ wch: 28 }, { wch: 16 }, { wch: 22 }, { wch: 22 }, { wch: 26 }];
                XLSX.utils.book_append_sheet(workbook, wsResumo, 'Resumo');

                // Uma aba por almoxarifado
                state.warehouses.forEach(wh => {
                    const whItems = state.items
                        .filter(i => (i.warehouse_id || 'alm-1') === wh.id)
                        .sort((a, b) => (a.categoria || '').localeCompare(b.categoria || '') || a.nome.localeCompare(b.nome));

                    const ws = buildSheet(whItems, wh.nome);
                    if (ws) {
                        // Nome da aba: máx 31 chars (limite do Excel)
                        const sheetName = wh.nome.substring(0, 31);
                        XLSX.utils.book_append_sheet(workbook, ws, sheetName);
                    }
                });

                XLSX.writeFile(workbook, `Estoque_Almoxarifados_${dateStr}.xlsx`);
                showToast('Relatório completo exportado!', 'success');
            } catch (error) {
                console.error('Erro ao exportar estoque:', error);
                showToast('Erro ao exportar para Excel', 'error');
            }
        }

        function exportMovementsToXLSX() {
            try {
                const movements = getFilteredMovements();
                if (!movements || movements.length === 0) {
                    showToast('Não há dados para exportar', 'error');
                    return;
                }

                const data = movements.map(m => ({
                    'Data': formatDate(m.date),
                    'Tipo': MOVEMENT_TYPES[m.type]?.label || m.type,
                    'Item': m.item_name,
                    'Quantidade': m.quantity,
                    'Colaborador': m.employeeName || m.employee || '-',
                    'Fornecedor': m.supplier || '-',
                    'Usuário': m.user || '-',
                    'Observações': m.observations || '',
                    'Data/Hora Registro': formatDateTime(m.timestamp || m.created_at)
                }));

                const worksheet = XLSX.utils.json_to_sheet(data);
                const workbook = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(workbook, worksheet, "Movimentações");

                XLSX.writeFile(workbook, `Movimentacoes_Almoxarifado_${getCurrentDate()}.xlsx`);
                showToast('Histórico exportado!', 'success');
            } catch (error) {
                console.error('Erro ao exportar histórico:', error);
                showToast('Erro ao exportar para Excel', 'error');
            }
        }

        async function handleLogout() {
            await sbClient.auth.signOut();
            clearSession();
            state.user = null;
            state.items = [];
            state.movements = [];
            cache.items = null;
            cache.movements = null;
            cache.itemsTimestamp = null;
            cache.movementsTimestamp = null;
            cache.statistics = null;
            cache.statisticsTimestamp = null;
            navigationHistory = [];
            navigateTo('login');
            showToast('Sessão encerrada', 'info');
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

        function toggleSizesSection(show) {
            const sizesArea = document.getElementById('sizesConfigArea');
            const singleQtyArea = document.getElementById('singleQuantityArea');
            const itemQuantityInput = document.getElementById('itemQuantity');

            if (show) {
                sizesArea.classList.remove('hidden');
                sizesArea.classList.add('block');
                singleQtyArea.classList.add('hidden');
                singleQtyArea.classList.remove('block');
                itemQuantityInput.required = false;
            } else {
                sizesArea.classList.add('hidden');
                sizesArea.classList.remove('block');
                singleQtyArea.classList.remove('hidden');
                singleQtyArea.classList.add('block');
                itemQuantityInput.required = true;
            }
        }

        function addSizeRow() {
            const list = document.getElementById('sizesList');
            const row = document.createElement('div');
            row.className = 'size-row';
            row.style.cssText = 'display:flex;gap:10px;align-items:center;';
            row.innerHTML = `
                <input type="text" class="size-name field-input" style="width:120px;" placeholder="Ex: 40 ou M" required>
                <input type="number" class="size-qty field-input" style="width:100px;" placeholder="Qtd" value="0" required min="0">
                <button type="button" onclick="this.parentElement.remove()" class="btn-icon" style="color:var(--red)"><i class="ph-bold ph-trash"></i></button>
            `;
            list.appendChild(row);
        }

        async function handleSaveItem(e) {
            e.preventDefault();

            const hasSizes = document.getElementById('hasSizes')?.checked;
            let tamanhos = null;
            let quantidade = 0;

            if (hasSizes) {
                tamanhos = {};
                const rows = document.querySelectorAll('.size-row');
                rows.forEach(row => {
                    const name = row.querySelector('.size-name').value.trim();
                    const qty = parseInt(row.querySelector('.size-qty').value) || 0;
                    if (name) {
                        tamanhos[name] = qty;
                        quantidade += qty;
                    }
                });
            } else {
                quantidade = parseInt(document.getElementById('itemQuantity').value);
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
                warehouse_id: selectedWarehouse?.value || state.activeWarehouse
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

        function startTransfer(fromWarehouseId) {
            const from = fromWarehouseId || state.activeWarehouse;
            // Destino padrão: próximo na lista, excluindo a origem
            const others = state.warehouses.filter(w => w.id !== from);
            const defaultTo = others[0]?.id || 'alm-2';
            state.transferOperation = {
                active: true,
                fromWarehouse: from,
                toWarehouse: defaultTo,
                selectedItem: null,
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

        // ---- Gera ID único de sessão: CTG-YYYYMMDD-NNN ----
        function generateSessionId(date) {
            const d = date || getCurrentDate();
            const base = 'CTG-' + d.replace(/-/g, '');
            // Conta sessões já salvas no histórico para o mesmo dia
            const sameDay = state.contagem.history.filter(s => s.date === d).length;
            const seq = String(sameDay + 1).padStart(3, '0');
            return `${base}-${seq}`;
        }

        // ---- Salva sessão no Supabase e carrega contagem vinculada ----
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
                showToast('Selecione o Turno Noite (C1)', 'error'); return;
            }
            if (!sess.turno_dia) {
                showToast('Selecione o Turno Dia (C3)', 'error'); return;
            }

            const sessionPayload = {
                id:          sessionId,
                date:        state.contagem.date,
                turno_noite: sess.turno_noite,
                turno_dia:   sess.turno_dia,
                c1_horario:  sess.c1_horario  || '00:00',
                c2_horario:  sess.c2_horario  || '07:00',
                c3_horario:  sess.c3_horario  || '08:00',
            };

            const saved = await createCountSession(sessionPayload);
            if (!saved) return; // erro já exibido por createCountSession

            state.contagem.currentSession = saved;
            state.contagem.turno = sessionId;         // daily_counts.turno = session_id
            state.contagem.horario = saved.c1_horario;
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
            const alm2Items = state.items.filter(i => (i.warehouse_id || 'alm-1') === 'alm-2');
            const itemIds = alm2Items.map(i => i.id);
            if (itemIds.length === 0) { state.contagem.loading = false; render(); return; }
            try {
                let q = sbClient.from('daily_counts').select('*').in('item_id', itemIds).eq('date', date);
                if (turno) {
                    q = q.eq('turno', turno);
                } else {
                    q = q.is('turno', null);
                }
                const { data } = await q;
                const c1Map = {}, c2Map = {}, c3Map = {};
                (data || []).forEach(r => {
                    if (r.contagem_num === 1) c1Map[r.item_id] = r;
                    if (r.contagem_num === 2) c2Map[r.item_id] = r;
                    if (r.contagem_num === 3) c3Map[r.item_id] = r;
                });
                
                const allItemIdsWithCounts = new Set([...Object.keys(c1Map), ...Object.keys(c2Map), ...Object.keys(c3Map)]);
                const result = Array.from(allItemIdsWithCounts).map(itemId => {
                    const c1 = c1Map[itemId];
                    const c2 = c2Map[itemId];
                    const c3 = c3Map[itemId];
                    
                    const saida = (c1 != null && c2 != null) ? c1.quantidade - c2.quantidade : null;
                    const saida_adm = (c2 != null && c3 != null) ? c2.quantidade - c3.quantidade : null;
                    
                    return { 
                        item_id: itemId, 
                        item_name: (c1 || c2 || c3).item_name, 
                        saida, 
                        saida_adm,
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
            const alm2Items = state.items.filter(i => (i.warehouse_id || 'alm-1') === 'alm-2');
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
                if (allC1) allC1.forEach(row => { if (!lastC1[row.item_id]) lastC1[row.item_id] = row; });
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
                if (allC2) allC2.forEach(row => { if (!lastC2[row.item_id]) lastC2[row.item_id] = row; });
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
                        if (!todayCounts[row.item_id]) todayCounts[row.item_id] = {};
                        if (row.contagem_num === 1) todayCounts[row.item_id].c1 = row;
                        if (row.contagem_num === 2) todayCounts[row.item_id].c2 = row;
                        if (row.contagem_num === 3) todayCounts[row.item_id].c3 = row;
                    });
                }
                state.contagem.todayCounts = todayCounts;

                const entries1 = {}, entries2 = {}, entries3 = {};
                Object.entries(todayCounts).forEach(([id, counts]) => {
                    if (counts.c1) entries1[id] = String(counts.c1.quantidade);
                    if (counts.c2) entries2[id] = String(counts.c2.quantidade);
                    if (counts.c3) entries3[id] = String(counts.c3.quantidade);
                });
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
            const rows = validEntries.map(([item_id, qty]) => ({
                date: state.contagem.date,
                item_id,
                item_name: state.items.find(i => i.id === item_id)?.nome || item_id,
                quantidade: Math.max(0, parseInt(qty) || 0),
                user_name: state.user.nome,
                contagem_num: num,
                turno: state.contagem.turno || null,
                horario: state.contagem.horario || null
            }));
            try {
                // Remove registros anteriores do mesmo dia e mesmo num para esses itens
                const itemIds = rows.map(r => r.item_id);
                let delQuery = sbClient.from('daily_counts')
                    .delete()
                    .eq('date', state.contagem.date)
                    .eq('contagem_num', num)
                    .in('item_id', itemIds);
                if (state.contagem.turno) {
                    delQuery = delQuery.eq('turno', state.contagem.turno);
                }
                await delQuery;

                const { error } = await sbClient.from('daily_counts').insert(rows);
                if (error) throw error;

                // Atualiza estado local
                rows.forEach(row => {
                    if (!state.contagem.todayCounts[row.item_id]) state.contagem.todayCounts[row.item_id] = {};
                    const key = num === 1 ? 'c1' : num === 2 ? 'c2' : 'c3';
                    state.contagem.todayCounts[row.item_id][key] = row;
                });

                if (num === 3) {
                    // Saída ADM = C2 (início do turno) - C3 (pós-distribuição)
                    const result = rows.map(row => {
                        const c2 = state.contagem.todayCounts[row.item_id]?.c2
                               ?? state.contagem.lastC2[row.item_id];
                        const c1 = state.contagem.lastC1[row.item_id];
                        const saidaADM = c2 != null ? c2.quantidade - row.quantidade : null;
                        const saidaTurno = c1 != null && c2 != null ? c1.quantidade - c2.quantidade : null;
                        return {
                            item_id: row.item_id,
                            item_name: row.item_name,
                            c1_qtd: c1?.quantidade ?? null,
                            c1_date: c1?.date ?? null,
                            c2_qtd: c2?.quantidade ?? null,
                            c3_qtd: row.quantidade,
                            saida: saidaTurno,      // usado pela aplicarBaixaContagem (consumo do turno)
                            saida_adm: saidaADM,    // distribuição ao ADM
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
                        state.contagem.lastC2[row.item_id] = { item_id: row.item_id, date: row.date, quantidade: row.quantidade };
                    });
                    state.contagem.contagemStep = 3;
                    showToast('Conferência de chegada salva! Agora faça a contagem pós-ADM.', 'success');
                } else {
                    // C1 salvo — atualiza lastC1 e avança para C2
                    rows.forEach(row => {
                        state.contagem.lastC1[row.item_id] = { item_id: row.item_id, date: row.date, quantidade: row.quantidade };
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

            const itensBaixa = result.filter(r => r.saida != null && r.saida > 0);
            if (itensBaixa.length === 0) {
                showToast('Nenhuma saída registrada para dar baixa', 'error');
                return;
            }

            const lista = itensBaixa.map(r => `• ${r.item_name}: -${r.saida} unid.`).join('\n');
            if (!confirm(`Deseja dar baixa no Almoxarifado 2 — Distribuição?\n\n${lista}\n\nEssa ação atualizará o estoque e registrará os movimentos.`)) return;

            state.contagem.saving = true;
            render();
            try {
                for (const r of itensBaixa) {
                    const item = state.items.find(i => i.id === r.item_id);
                    if (!item) continue;

                    const novaQtd = Math.max(0, item.quantidade - r.saida);

                    const { error: updErr } = await sbClient
                        .from('items')
                        .update({ quantidade: novaQtd })
                        .eq('id', r.item_id);
                    if (updErr) throw updErr;

                    const turnoLabel = state.contagem.turno ? ` — Turno ${state.contagem.turno}` : '';
                    await sbClient.from('movements').insert({
                        date: state.contagem.date,
                        type: 'SAIDA',
                        item_id: r.item_id,
                        item_name: r.item_name,
                        quantity: r.saida,
                        warehouse_id: item.warehouse_id || 'alm-2',
                        user_name: state.user.nome,
                        observations: `Baixa Contagem Diária ${formatDate(state.contagem.date)}${turnoLabel}`
                    });

                    item.quantidade = novaQtd;
                }
                state.contagem.baixaAplicada = true;
                const baixaKey = state.contagem.turno
                    ? `${state.contagem.date}_${state.contagem.turno}`
                    : state.contagem.date;
                state.contagem.baixaDates[baixaKey] = true;
                // Remove o ticket fechado de openTickets
                state.contagem.openTickets = state.contagem.openTickets.filter(
                    t => !(t.date === state.contagem.date && t.turno === state.contagem.turno)
                );
                cache.items = null;
                cache.movements = null;
                showToast(`Baixa aplicada para ${itensBaixa.length} item(ns)!`, 'success');
            } catch (e) {
                showToast('Erro ao aplicar baixa: ' + e.message, 'error');
                console.error(e);
            }
            state.contagem.saving = false;
            render();
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
                showToast('Selecione o tamanho primeiro', 'error');
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
            const tipo = num === 2 ? 'Contagem de Saída' : 'Contagem de Entrega';
            const turnoLabel = turno ? ` (Turno ${turno})` : '';
            if (!confirm(`Excluir ${tipo} de ${formatDate(date)}${turnoLabel}? Esta ação não pode ser desfeita.`)) return;
            try {
                let q = sbClient.from('daily_counts').delete()
                    .eq('date', date)
                    .eq('contagem_num', num);
                if (turno) q = q.eq('turno', turno);
                const { error } = await q;
                if (error) throw error;
                state.contagem.history = state.contagem.history.filter(
                    r => !(r.date === date && r.contagem_num === num && (r.turno || null) === (turno || null))
                );
                if (num === 1) {
                    state.contagem.openTickets = state.contagem.openTickets.filter(
                        t => !(t.date === date && t.turno === (turno || null))
                    );
                }
                showToast(`${tipo} excluída!`, 'success');
                render();
            } catch (e) {
                showToast('Erro ao excluir contagem', 'error');
                console.error(e);
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
                const [countsRes, baixaRes] = await Promise.all([
                    sbClient.from('daily_counts')
                        .select('*')
                        .order('date', { ascending: false })
                        .order('contagem_num', { ascending: true })
                        .limit(600),
                    sbClient.from('movements')
                        .select('date, observations')
                        .ilike('observations', 'Baixa Contagem Diária%')
                        .limit(200)
                ]);

                if (!countsRes.error && countsRes.data) {
                    state.contagem.history = countsRes.data;
                }

                // Popula baixaDates com chave 'YYYY-MM-DD' (legado) ou 'YYYY-MM-DD_A' (novo)
                const baixaDates = {};
                if (!baixaRes.error && baixaRes.data) {
                    baixaRes.data.forEach(m => {
                        const sessMatch  = m.observations?.match(/(CTG-\d{8}-\d{3})/);
                        const turnoMatch = m.observations?.match(/Turno ([ABCD])\b/);
                        const t = sessMatch ? sessMatch[1] : (turnoMatch ? turnoMatch[1] : null);

                        const key = t ? `${m.date}_${t}` : m.date;
                        baixaDates[key] = true;
                    });
                }
                state.contagem.baixaDates = baixaDates;

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
                                            ${Object.entries(selectedItem.tamanhos).map(([s, q]) => `<option value="${s}" ${op.size === s ? 'selected' : ''}>${s} (Estoque: ${q})</option>`).join('')}
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
                                        ${Object.entries(item.tamanhos).map(([s, q]) => `
                                            <div class="size-chip"><strong>${s}:</strong> <span class="qty ${q > 0 ? 'ok' : 'low'}">${q}</span></div>
                                        `).join('')}
                                    </div>
                                ` : ''}
                                ${item.unidades_por_caixa && item.unidades_por_caixa > 1 ? `
                                    <div style="font-size:11px;color:var(--text-2);margin-top:6px;"><i class="ph ph-package"></i> ${item.unidades_por_caixa} un/caixa</div>
                                ` : ''}
                                <div class="item-actions">
                                    <button onclick='openEditItem(${JSON.stringify(item).replace(/'/g, "&#39;")})' class="btn-secondary" style="flex:1;font-size:12px;padding:8px;"><i class="ph ph-pencil-simple"></i> Editar</button>
                                    <button onclick="state.transferOperation.selectedItem='${item.id}';startTransfer('${item.warehouse_id || 'alm-1'}')" class="btn-cyan" style="padding:8px 12px;font-size:12px;" title="Transferir / Dar Baixa"><i class="ph ph-arrows-left-right"></i> Transferir</button>
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
                                ${sizeKeys.map(s => `<option value="${s}" ${m.size === s ? 'selected' : ''}>${s} — disponível: ${item.tamanhos[s]}</option>`).join('')}
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
                    ? `[${wh}] ${i.nome} — ${Object.entries(i.tamanhos).filter(([, q]) => q > 0).map(([s, q]) => `Tam ${s}:${q}`).join(', ')}`
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
                `<option value="${s}" ${em.formSize === s ? 'selected' : ''}>${s} — ${q} disponível${q !== 1 ? 'is' : ''}</option>`
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
                                        ${Object.entries(item.tamanhos).map(([s, q]) => `
                                            <div class="size-chip"><strong>${s}:</strong> <span class="qty ${q > 0 ? 'ok' : 'low'}">${q}</span></div>
                                        `).join('')}
                                    </div>` : ''}
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
                    ? `${i.nome} — ${Object.entries(i.tamanhos).filter(([, q]) => q > 0).map(([s, q]) => `Tam ${s}: ${q}`).join(', ')}`
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
                                    <div style="font-size:11px;color:var(--text-3);">${op.size ? `Tam ${op.size}` : 'Disponível'}</div>
                                    <div style="font-size:22px;font-weight:700;color:${availableQty > 0 ? 'var(--green)' : 'var(--red)'};">${availableQty}</div>
                                </div>
                            </div>
                            ${hasSizes ? `
                                <div class="field-group">
                                    <label class="field-label">Tamanho / Numeração *</label>
                                    <select class="field-input field-select" onchange="state.transferOperation.size=this.value;state.transferOperation.quantity=1;render()" required>
                                        <option value="">-- Selecione --</option>
                                        ${Object.entries(selectedItem.tamanhos).filter(([, q]) => q > 0).map(([s, q]) => `<option value="${s}" ${op.size === s ? 'selected' : ''}>${s} — ${q} disponível${q !== 1 ? 'is' : ''}</option>`).join('')}
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
            return `
        <div class="page-wrap">
            ${renderHeader()}
            <div class="page-content-sm">
                <div class="card-lg">
                    <div class="row-between" style="margin-bottom:24px;">
                        <h1 class="page-title">${item.id ? 'Editar Item' : 'Novo Item'}</h1>
                        <button onclick="goBack()" class="btn-icon"><i class="ph ph-x"></i></button>
                    </div>
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
                                    ${item.tamanhos && Object.keys(item.tamanhos).length > 0 ? 'checked' : ''}
                                    onchange="toggleSizesSection(this.checked)">
                                Este item tem tamanhos / numerações diferentes
                            </label>
                        </div>

                        <div id="singleQuantityArea" class="${item.tamanhos && Object.keys(item.tamanhos).length > 0 ? 'hidden' : 'block'}" style="grid-column:1/-1;">
                            <div class="field-group">
                                <label class="field-label">Quantidade</label>
                                <input class="field-input" type="number" id="itemQuantity" value="${item.quantidade || 0}" min="0">
                            </div>
                        </div>

                        <div id="sizesConfigArea" class="${item.tamanhos && Object.keys(item.tamanhos).length > 0 ? 'block' : 'hidden'}" style="grid-column:1/-1;">
                            <div class="field-group">
                                <label class="field-label">Tamanhos e Quantidades</label>
                                <div id="sizesList" class="stack-sm">
                                    ${item.tamanhos && Object.keys(item.tamanhos).length > 0
                    ? Object.entries(item.tamanhos).map(([s, q]) => `
                                            <div class="flex gap-3 items-center size-row mb-2" style="display:flex;gap:10px;align-items:center;">
                                                <input type="text" class="size-name field-input" style="width:120px;" placeholder="Ex: 40 ou M" value="${s}" required>
                                                <input type="number" class="size-qty field-input" style="width:100px;" placeholder="Qtd" value="${q}" min="0" required>
                                                <button type="button" onclick="this.parentElement.remove()" class="btn-icon" style="color:var(--red)"><i class="ph-bold ph-trash"></i></button>
                                            </div>`).join('')
                    : ''}
                                </div>
                                <button type="button" onclick="addSizeRow()" class="btn-secondary" style="margin-top:10px;">
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
            const alm2Items = state.items
                .filter(i => (i.warehouse_id || 'alm-1') === 'alm-2')
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
                // Tabela Excel — todas as contagens visíveis ao mesmo tempo

                if (alm2Items.length === 0) {
                    return `<div class="card"><div class="empty-state">
                        <i class="ph ph-package"></i>
                        <p>Nenhum item cadastrado no Almoxarifado Distribuição</p>
                        <div style="margin-top:16px;"><button onclick="navigateTo('stock')" class="btn-secondary">Ver Estoque</button></div>
                    </div></div>`;
                }

                const hasC1done = Object.values(state.contagem.todayCounts).some(c => c.c1);
                const hasC2done = Object.values(state.contagem.todayCounts).some(c => c.c2);
                const hasC3done = Object.values(state.contagem.todayCounts).some(c => c.c3);

                const sess = state.contagem.currentSession;
                const sessionId = state.contagem.turno || '';
                const isSession = sessionId.startsWith('CTG-');

                // Banner de contexto da sessão
                const turnoInfo = sessionId
                    ? `<div style="display:flex;align-items:center;gap:10px;padding:10px 16px;
                                  background:var(--bg-2);border-bottom:1px solid var(--border);flex-wrap:wrap;">
                           <span style="font-size:11px;font-weight:700;color:var(--text-3);letter-spacing:0.04em;">${sessionId}</span>
                           <span style="font-size:11px;color:var(--text-3);">|</span>
                           <span style="font-size:12px;color:var(--text-2);">${formatDate(state.contagem.date)}</span>
                           ${isSession && sess ? `
                             <span style="font-size:11px;color:var(--text-3);">|</span>
                             ${turnoBadge(sess.turno_noite)} <span style="font-size:11px;color:var(--text-3);">noite</span>
                             <span style="font-size:11px;color:var(--text-3);">·</span>
                             ${turnoBadge(sess.turno_dia)} <span style="font-size:11px;color:var(--text-3);">dia</span>
                           ` : ''}
                       </div>` : '';

                // Sublabels dinâmicos das colunas baseados na sessão
                const c1Sub = sess
                    ? `${sess.c1_horario || '00:00'} · Turno ${sess.turno_noite || '—'}`
                    : 'Abastecimento';
                const c2Sub = sess
                    ? `${sess.c2_horario || '07:00'} · Conferência`
                    : 'Chegada';
                const c3Sub = sess
                    ? `${sess.c3_horario || '08:00'} · Turno ${sess.turno_dia || '—'} + ADM`
                    : 'Pós-ADM';

                function colHeader(n, label, sublabel, done) {
                    const clr = done ? 'var(--green)' : n === num ? 'var(--accent)' : 'var(--text-2)';
                    const bg  = done ? '#e8f5ee'      : n === num ? '#eef2ff'       : 'var(--bg-2)';
                    const bdr = done ? 'var(--green)'  : n === num ? 'var(--accent)'  : 'var(--border)';
                    return `<th style="padding:10px 6px;text-align:center;background:${bg};border-left:1px solid var(--border);border-bottom:2px solid ${bdr};min-width:110px;cursor:pointer;"
                                onclick="state.contagem.contagemStep=${n};render()">
                        <div style="display:flex;flex-direction:column;align-items:center;gap:2px;">
                            <span style="font-weight:800;font-size:14px;color:${clr};">${label}</span>
                            <span style="font-size:10px;color:${clr};opacity:0.85;white-space:nowrap;">${sublabel}</span>
                            ${done ? `<span style="font-size:9px;font-weight:700;color:var(--green);">SALVO</span>` : ''}
                        </div>
                    </th>`;
                }

                const tableRows = alm2Items.map((item, idx) => {
                    const saved1 = state.contagem.todayCounts[item.id]?.c1;
                    const saved2 = state.contagem.todayCounts[item.id]?.c2;
                    const saved3 = state.contagem.todayCounts[item.id]?.c3;
                    const val1 = state.contagem.entries1[item.id] ?? '';
                    const val2 = state.contagem.entries2[item.id] ?? '';
                    const val3 = state.contagem.entries3[item.id] ?? '';
                    const rowBg = idx % 2 === 0 ? 'var(--bg-1)' : 'var(--bg-2)';
                    const cell1Bg = saved1 ? '#e8f5ee' : val1 !== '' ? '#f0f4ff' : rowBg;
                    const cell2Bg = saved2 ? '#e8f5ee' : val2 !== '' ? '#f0f4ff' : rowBg;
                    const cell3Bg = saved3 ? '#e8f5ee' : val3 !== '' ? '#f0f4ff' : rowBg;
                    function cellInput(stKey, val, cellBg) {
                        return `<td style="padding:3px 4px;background:${cellBg};border-left:1px solid var(--border);text-align:center;">
                            <input type="number" min="0" placeholder="—" value="${val}"
                                style="width:72px;height:32px;border:1px solid var(--border);border-radius:6px;text-align:center;
                                       font-size:13px;font-weight:600;background:transparent;color:var(--text-1);
                                       outline:none;padding:0 4px;"
                                onfocus="this.style.borderColor='var(--accent)';this.style.boxShadow='0 0 0 2px var(--accent-glow)'"
                                onblur="this.style.borderColor='var(--border)';this.style.boxShadow=''"
                                oninput="state.contagem.${stKey}['${item.id}']=this.value">
                        </td>`;
                    }
                    return `<tr style="border-bottom:1px solid var(--border);">
                        <td style="padding:9px 12px;font-weight:500;font-size:13px;background:${rowBg};white-space:nowrap;">
                            ${item.nome}
                            <span style="font-size:10px;color:var(--text-3);font-weight:400;margin-left:4px;">${item.unidade}</span>
                        </td>
                        ${cellInput('entries1',val1,cell1Bg)}
                        ${cellInput('entries2',val2,cell2Bg)}
                        ${cellInput('entries3',val3,cell3Bg)}
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
                    <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;">
                        <table style="width:100%;border-collapse:collapse;font-size:13px;">
                            <thead>
                                <tr style="border-bottom:2px solid var(--border);">
                                    <th style="padding:10px 12px;text-align:left;background:var(--bg-2);font-size:12px;font-weight:700;color:var(--text-2);white-space:nowrap;">
                                        EPI's
                                        <span style="font-size:10px;font-weight:400;color:var(--text-3);margin-left:4px;">(${alm2Items.length} itens)</span>
                                    </th>
                                     ${colHeader(1,'C1',c1Sub,hasC1done)}
                                     ${colHeader(2,'C2',c2Sub,hasC2done)}
                                     ${colHeader(3,'C3',c3Sub,hasC3done)}
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
                                    ${saveBtn(1,hasC1done)}
                                    ${saveBtn(2,hasC2done)}
                                    ${saveBtn(3,hasC3done)}
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
                    // Gera ID sugerido se ainda não tiver
                    const suggestedId = sess.id || generateSessionId(state.contagem.date);

                    function turnoOpts(selected, onChangeFn) {
                        return ['A','B','C','D'].map(t => {
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
                    const dia   = sess.turno_dia   || '';

                    return `<div class="card-lg">
                        <div style="margin-bottom:20px;">
                            <div style="font-weight:700;font-size:15px;color:var(--text-1);margin-bottom:4px;">Nova Contagem</div>
                            <p style="font-size:12px;color:var(--text-3);">Configure os dados da sessão antes de iniciar.</p>
                        </div>
                        <div class="stack-sm">

                            <!-- ID e Data -->
                            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                                <div class="field-group">
                                    <label class="field-label">ID da Sessão</label>
                                    <input class="field-input" type="text" value="${suggestedId}"
                                        oninput="state.contagem.currentSession={...(state.contagem.currentSession||{}),id:this.value}"
                                        placeholder="CTG-YYYYMMDD-001">
                                </div>
                                <div class="field-group">
                                    <label class="field-label">Data</label>
                                    <input class="field-input" type="date" value="${state.contagem.date}"
                                        onchange="state.contagem.date=this.value;state.contagem.entries1={};state.contagem.entries2={};state.contagem.entries3={};state.contagem.todayCounts={};render();">
                                </div>
                            </div>

                            <!-- C1: Abastecimento Turno Noite -->
                            <div style="border:1px solid var(--border);border-radius:10px;padding:14px;background:var(--bg-2);">
                                <div style="font-weight:700;font-size:13px;color:var(--text-1);margin-bottom:4px;">C1 — Abastecimento (Turno Noite)</div>
                                <p style="font-size:11px;color:var(--text-3);margin-bottom:10px;">Qual turno vai pegar de 19h às 07h?</p>
                                <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
                                    ${turnoOpts(noite, 'setTurnoNoite')}
                                </div>
                                <div class="field-group" style="margin:0;">
                                    <label class="field-label">Horário de C1</label>
                                    <input class="field-input" type="time" value="${sess.c1_horario || '00:00'}"
                                        oninput="state.contagem.currentSession={...(state.contagem.currentSession||{}),c1_horario:this.value}">
                                </div>
                            </div>

                            <!-- C2: Conferência de chegada -->
                            <div style="border:1px solid var(--border);border-radius:10px;padding:14px;background:var(--bg-2);">
                                <div style="font-weight:700;font-size:13px;color:var(--text-1);margin-bottom:4px;">C2 — Conferência de Chegada</div>
                                <p style="font-size:11px;color:var(--text-3);margin-bottom:10px;">O que encontramos no almoxarifado às 07h.</p>
                                <div class="field-group" style="margin:0;">
                                    <label class="field-label">Horário de C2</label>
                                    <input class="field-input" type="time" value="${sess.c2_horario || '07:00'}"
                                        oninput="state.contagem.currentSession={...(state.contagem.currentSession||{}),c2_horario:this.value}">
                                </div>
                            </div>

                            <!-- C3: Pós-distribuição ADM + Turno Dia -->
                            <div style="border:1px solid var(--border);border-radius:10px;padding:14px;background:var(--bg-2);">
                                <div style="font-weight:700;font-size:13px;color:var(--text-1);margin-bottom:4px;">C3 — Pós-distribuição ADM</div>
                                <p style="font-size:11px;color:var(--text-3);margin-bottom:10px;">Qual turno divide com o ADM de 07h às 19h?</p>
                                <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
                                    ${turnoOpts(dia, 'setTurnoDia')}
                                </div>
                                <div class="field-group" style="margin:0;">
                                    <label class="field-label">Horário de C3</label>
                                    <input class="field-input" type="time" value="${sess.c3_horario || '08:00'}"
                                        oninput="state.contagem.currentSession={...(state.contagem.currentSession||{}),c3_horario:this.value}">
                                </div>
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
                            <td style="padding:8px 6px;text-align:right;font-size:13px;color:var(--text-2);">${v1 ?? 'â€”'}</td>
                            <td style="padding:8px 6px;text-align:right;font-size:13px;color:var(--text-2);">${v2 ?? 'â€”'}</td>
                            <td style="padding:8px 10px;text-align:right;font-weight:700;font-size:13px;color:${diffColor};">
                                ${diff !== null ? (diff > 0 ? 'âˆ’' + diff : diff === 0 ? '0' : '+' + Math.abs(diff)) : 'â€”'}
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
                                    ${totalDiff > 0 ? 'âˆ’' + totalDiff : totalDiff}
                                </td>
                            </tr></tfoot>
                        </table>
                    </div>`;
                }

                const turnoNoite  = rSess ? `Turno ${rSess.turno_noite} (19hâ€“07h)` : 'Turno Noite';
                const turnoDiaAdm = rSess ? `ADM + Turno ${rSess.turno_dia} (07hâ€“19h)` : 'ADM + Turno Dia';
                const c1h = rSess?.c1_horario || '00:00';
                const c2h = rSess?.c2_horario || '07:00';
                const c3h = rSess?.c3_horario || '08:00';
                const sessionId = state.contagem.turno || '';

                const totalC1C2 = result.reduce((a,r) => a + ((r.c1_qtd != null && r.c2_qtd != null) ? Math.max(0, r.c1_qtd - r.c2_qtd) : 0), 0);
                const totalC2C3 = result.reduce((a,r) => a + ((r.c2_qtd != null && r.c3_qtd != null) ? Math.max(0, r.c2_qtd - r.c3_qtd) : 0), 0);

                resultContent = `<div style="display:flex;flex-direction:column;gap:14px;">

                    <!-- Cabecalho da sessao -->
                    <div class="card" style="padding:14px 16px;">
                        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:6px;">
                            <span style="font-weight:800;font-size:15px;color:var(--text-1);">Relatorio da Sessao</span>
                            <span style="font-size:12px;font-weight:700;color:var(--text-3);letter-spacing:0.04em;">${sessionId}</span>
                            <span style="font-size:12px;color:var(--text-3);">${formatDate(state.contagem.date)}</span>
                        </div>
                        <div style="display:flex;gap:16px;flex-wrap:wrap;">
                            <span style="font-size:12px;color:var(--text-2);">
                                <span style="font-weight:600;">C1</span> ${c1h} &nbsp;
                                <span style="font-weight:600;">C2</span> ${c2h} &nbsp;
                                <span style="font-weight:600;">C3</span> ${c3h}
                            </span>
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
                            <span style="font-size:20px;font-weight:800;color:var(--red);">âˆ’${totalC1C2} unid</span>
                        </div>
                        ${sectionTable(result, 'c1_qtd', 'c2_qtd', 'Consumido', (a,b) => Math.max(0,a-b))}
                    </div>

                    <!-- Secao ADM + Turno Dia -->
                    <div class="card" style="padding:0;overflow:hidden;">
                        <div style="padding:12px 16px;border-bottom:2px solid var(--border);background:var(--bg-2);
                                    display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
                            <div>
                                <div style="font-weight:700;font-size:13px;color:var(--text-1);">${turnoDiaAdm}</div>
                                <div style="font-size:11px;color:var(--text-3);">Distribuido = C2 - C3</div>
                            </div>
                            <span style="font-size:20px;font-weight:800;color:var(--orange);">âˆ’${totalC2C3} unid</span>
                        </div>
                        ${sectionTable(result, 'c2_qtd', 'c3_qtd', 'Distribuido', (a,b) => Math.max(0,a-b))}
                    </div>

                    <!-- Acoes -->
                    <div class="card" style="padding:14px 16px;">
                        ${baixaJaFeita
                            ? `<div style="display:flex;align-items:center;gap:8px;background:#e8f5ee;color:var(--green);padding:10px 14px;border-radius:8px;font-size:13px;font-weight:600;border:1px solid var(--green);margin-bottom:12px;">
                                   <i class="ph-fill ph-check-circle" style="font-size:16px;"></i>
                                   Baixa ja aplicada no estoque do Almoxarifado 2
                               </div>`
                            : `<div style="background:#fff8e1;border:1px solid #ffc107;border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:12px;color:#7a5800;">
                                   Baixa pendente â€” clique em "Dar Baixa" para atualizar o estoque.
                               </div>`
                        }
                        <div style="display:flex;gap:10px;flex-wrap:wrap;">
                            <button onclick="switchContagemTab('history')" class="btn-secondary">
                                <i class="ph ph-clock-counter-clockwise"></i> Ver Historico
                            </button>
                            <button onclick="state.contagem.savedResult=null;state.contagem.newStep=3;render()" class="btn-secondary">
                                <i class="ph ph-pencil"></i> Corrigir Contagem
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
                        .filter(g => state.contagem.historyTurnoFilter === 'TODOS' || (!g.turno?.startsWith('CTG-') && g.turno === state.contagem.historyTurnoFilter))
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
                            
                            histCards.push(`<div class="card">
                                <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px;gap:8px;flex-wrap:wrap;">
                                    <div>
                                        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap;">
                                            <span style="font-weight:700;font-size:14px;">${formatDate(date)}</span>
                                            ${turno && turno.startsWith('CTG-')
                                                ? `<span style="font-size:11px;font-weight:700;color:var(--accent);background:#eef2ff;padding:2px 8px;border-radius:4px;letter-spacing:0.03em;">${turno}</span>`
                                                : turnoBadge(turno)}
                                            ${horario ? `<span style="font-size:11px;color:var(--text-3);">${horario}</span>` : ''}
                                            ${resumoBadge}
                                        </div>
                                        <div style="font-size:11px;color:var(--text-3);">${statusLabel} &nbsp;${baixaBadge}</div>
                                    </div>
                                    <div style="display:flex;gap:6px;flex-shrink:0;flex-wrap:wrap;">
                                        <button onclick="editContagemDate('${date}',1,'${turno || ''}','${horario || ''}')" class="btn-secondary" style="font-size:11px;padding:4px 10px;">
                                            <i class="ph ph-pencil"></i> C1
                                        </button>
                                        <button onclick="editContagemDate('${date}',2,'${turno || ''}','${horario || ''}')" class="btn-secondary" style="font-size:11px;padding:4px 10px;">
                                            <i class="ph ph-pencil"></i> C2
                                        </button>
                                        <button onclick="editContagemDate('${date}',3,'${turno || ''}','${horario || ''}')" class="btn-secondary" style="font-size:11px;padding:4px 10px;">
                                            <i class="ph ph-pencil"></i> C3
                                        </button>
                                        <button onclick="deleteContagemDate('${date}',0,'${turno || ''}')" class="btn-secondary" style="font-size:11px;padding:4px 10px;color:var(--red);border-color:var(--red);">
                                            <i class="ph ph-trash"></i> Excluir
                                        </button>
                                    </div>
                                </div>
                                ${buildRelatorioTable(itens)}
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
                                            ${turno && turno.startsWith('CTG-')
                                                ? `<span style="font-size:11px;font-weight:700;color:var(--accent);background:#eef2ff;padding:2px 8px;border-radius:4px;letter-spacing:0.03em;">${turno}</span>`
                                                : turnoBadge(turno)}
                                            ${horario ? `<span style="font-size:11px;color:var(--text-3);">${horario}</span>` : ''}
                                        </div>
                                        <div style="font-size:11px;color:var(--text-3);">Contagem 1 registrada &nbsp;<span class="badge badge-gray" style="font-size:10px;">C2 pendente</span></div>
                                    </div>
                                    <div style="display:flex;gap:6px;flex-shrink:0;">
                                        <button onclick="editContagemDate('${date}',1,'${turno || ''}','${horario || ''}')" class="btn-secondary" style="font-size:11px;padding:4px 10px;">
                                            <i class="ph ph-pencil"></i> Editar
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
                         const isSess = t.turno?.startsWith('CTG-');
                         const cor = isSess ? 'var(--accent)' : turnoColor(t.turno);
                         const bg  = isSess ? '#eef2ff'       : turnoBg(t.turno);
                         const statusLabel = t.hasC3
                             ? `<span style="font-size:11px;color:var(--green);font-weight:600;"><i class="ph-fill ph-check-circle"></i> C3 feita — aguardando baixa</span>`
                             : t.hasC2
                             ? `<span style="font-size:11px;color:var(--blue,#3b82f6);font-weight:600;"><i class="ph ph-hourglass"></i> C2 feita — aguardando C3 (ADM)</span>`
                             : `<span style="font-size:11px;color:var(--orange);font-weight:600;"><i class="ph ph-clock"></i> C1 registrada — aguardando C2</span>`;
                         const actionBtn = t.hasC3
                             ? `<button onclick="openTicketForBaixa('${t.date}','${t.turno || ''}','${t.horario || ''}')"
                                          class="btn-primary" style="flex:1;font-size:12px;padding:8px 12px;background:var(--green);border-color:var(--green);">
                                          <i class="ph-fill ph-arrow-fat-lines-down"></i> Dar Baixa
                                       </button>`
                             : t.hasC2
                             ? `<button onclick="openTicketForC2('${t.date}','${t.turno || ''}','${t.horario || ''}')"
                                          class="btn-primary" style="flex:1;font-size:12px;padding:8px 12px;">
                                          <i class="ph-fill ph-clipboard-check"></i> Fazer C3 (ADM)
                                       </button>`
                             : `<button onclick="openTicketForC2('${t.date}','${t.turno || ''}','${t.horario || ''}')"
                                          class="btn-secondary" style="flex:1;font-size:12px;padding:8px 12px;">
                                          <i class="ph-fill ph-clipboard-check"></i> Fazer C2
                                       </button>`;
                         const headerLabel = isSess
                             ? `<span style="font-size:12px;font-weight:800;color:${cor};letter-spacing:0.03em;">${t.turno}</span>`
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
                            <p style="font-size:12px;color:var(--text-3);margin-top:2px;">Almoxarifado 2 — Distribuição</p>
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
                                    onclick="closeSidebar(); ${v.id === 'contagem' ? 'navigateToContagem()' : `navigateTo('${v.id}')`}"
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
        // INICIALIZAÇÃO
        // ============================================
        document.addEventListener('DOMContentLoaded', async () => {
            // Mostra loading screen enquanto verifica sessão (view já é 'checking')
            state.loadingMessage = 'Verificando sessão...';
            render();

            try {
                const { data: { session }, error: sessionError } = await sbClient.auth.getSession();

                if (sessionError) {
                    await sbClient.auth.signOut();
                    navigateTo('login');
                } else if (session?.user) {
                    const { data: profile } = await sbClient
                        .from('profiles')
                        .select('nome')
                        .eq('id', session.user.id)
                        .single();

                    state.user = {
                        id: session.user.id,
                        nome: profile?.nome || session.user.email,
                        email: session.user.email
                    };

                    state.loadingMessage = 'Carregando dados...';
                    render();

                    await Promise.all([loadItems(), loadWarehouses()]);
                    navigateTo('stock');
                } else {
                    navigateTo('login');
                }
            } catch (err) {
                console.warn('Sessão inválida, redirecionando para login:', err.message);
                try { await sbClient.auth.signOut(); } catch (_) { }
                navigateTo('login');
            }
        });

        // Redireciona para login se a sessão Supabase expirar enquanto o app está aberto
        sbClient.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_OUT' && state.user) {
                state.user = null;
                state.items = [];
                state.movements = [];
                cache.items = null;
                cache.movements = null;
                navigationHistory = [];
                navigateTo('login');
                showToast('Sessão expirada. Faça login novamente.', 'info');
            }
            // Token renovado com sucesso — não precisa de ação adicional
        });
    