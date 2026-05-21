/**
 * Almoxarifado EPI — State
 * Estado global da aplicação e cache
 */

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
    CACHE_DURATION: 300000
};

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

    currentPage: 1,
    itemsPerPage: 50,

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

    batchOperation: {
        active: false,
        targetWarehouse: 'alm-1',
        form: {
            createNewItem: false,
            selectedItem: null,
            newItemName: '',
            newItemCategory: '',
            newItemUnit: 'UN',
            size: '',
            quantity: 1
        },
        lines: []
    },

    editingItem: null,

    statistics: null,
    analytics: {
        weeklyExpenses: [],
        monthlyExpenses: [],
        topReplenishedItems: [],
        categoryDistribution: []
    },

    warehouses: [
        { id: 'alm-1', nome: 'Almoxarifado Central', descricao: 'Estoque principal de EPIs' },
        { id: 'alm-2', nome: 'Almoxarifado Distribuição', descricao: 'Itens prontos para distribuição' },
        { id: 'alm-emergencial', nome: 'Emergencial', descricao: 'Saídas emergenciais e distribuição imediata' }
    ],
    activeWarehouse: 'alm-1',

    emergency: {
        cart: [],
        saving: false,
        showForm: false,
        formItemId: '',
        formSize: '',
        formQty: 1
    },

    transferOperation: {
        active: false,
        fromWarehouse: 'alm-1',
        toWarehouse: 'alm-2',
        selectedItem: null,
        size: null,
        quantity: 1,
        observations: ''
    },

    editingWarehouse: null,

    baixaModal: {
        open: false,
        item: null,
        size: '',
        quantidade: 1,
        motivo: '',
        saving: false
    },

    contagem: {
        loading: false,
        date: getCurrentDate(),
        entries1: {},
        entries2: {},
        entries3: {},
        todayCounts: {},
        lastC1: {},
        lastC2: {},
        saving: false,
        savedResult: null,
        baixaAplicada: false,
        baixaDates: {},
        tab: 'chamados',
        history: [],
        historyLoading: false,
        turno: null,
        horario: '',
        newStep: 1,
        contagemStep: 1,
        openTickets: [],
        historyTurnoFilter: 'TODOS',
        sessionMap: {},
        currentSession: null
    }
};

let navigationHistory = [];
let touchStartY = 0;
let pullDistance = 0;
