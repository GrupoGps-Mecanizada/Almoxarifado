/**
 * Almoxarifado EPI — Auth Module (SSO via Central SGE)
 * Usa SgeAuthSDK para autenticação centralizada com RBAC
 */

const ssoClient = new window.SgeAuthSDK(APP_SLUG);

window.ALM_AUTH = {
    currentUser: null,

    async init() {
        state.view = 'checking';
        state.loadingMessage = 'Verificando sessão...';
        render();

        const userData = await ssoClient.checkAuth();

        if (userData) {
            console.log('[ALM AUTH] Autenticado via SSO:', userData.nome);

            this.currentUser = {
                id: userData.id,
                nome: userData.nome || userData.email.split('@')[0],
                email: userData.email,
                perfil: userData.perfil || 'VISAO'
            };
            state.user = this.currentUser;

            state.loadingMessage = 'Carregando dados...';
            render();

            await Promise.all([loadItems(), loadWarehouses()]);

            // Inicia presença no Radar (lê chaves do localStorage definidas pelo SSO)
            if (window.SGE_SESSION_PING) window.SGE_SESSION_PING.start();

            navigateTo('stock');
            return true;
        }

        // Sem token válido — ssoClient já redirecionou para sso_login.html
        return false;
    },

    async logout() {
        // Para o rastreamento de presença
        if (window.SGE_SESSION_PING) window.SGE_SESSION_PING.stop();

        // Limpa dados da sessão local
        ['sge_session_id', 'sge_session_user_id', 'sge_session_token',
         'sge_session_user_name', 'sge_session_user_email',
         'sge_session_app_slug', 'sge_session_app_name'].forEach(k => {
            try { localStorage.removeItem(k); } catch (_) {}
        });

        // Limpa estado da aplicação
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

        // Redireciona via SSO (volta para sso_login.html)
        ssoClient.logout();
    }
};
