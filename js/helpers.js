/**
 * Almoxarifado EPI — Helpers
 * Utilitários, formatação, navegação e notificações
 */

function getCurrentDate() {
    return new Date().toISOString().split('T')[0];
}

function getFirstDayOfMonth() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
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
        return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch (e) {
        return dateStr;
    }
}

function formatDateTime(dateStr) {
    if (!dateStr) return '';
    try {
        const date = new Date(dateStr);
        return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (e) {
        return dateStr;
    }
}

function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function getColorClass(color, type = 'bg') {
    const colors = {
        emerald: type === 'bg' ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'bg-emerald-600',
        red:     type === 'bg' ? 'bg-red-500/20 border-red-500 text-red-400'             : 'bg-red-600',
        blue:    type === 'bg' ? 'bg-blue-500/20 border-blue-500 text-blue-400'          : 'bg-blue-600',
        purple:  type === 'bg' ? 'bg-purple-500/20 border-purple-500 text-purple-400'    : 'bg-purple-600',
        amber:   type === 'bg' ? 'bg-amber-500/20 border-amber-500 text-amber-400'       : 'bg-amber-600',
        slate:   type === 'bg' ? 'bg-slate-500/20 border-slate-500 text-slate-500'       : 'bg-slate-600'
    };
    return colors[color] || colors.slate;
}

let searchDebounceTimer = null;
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

// ── Variation key helpers ──────────────────────────────────────────────────
function parseVariationKey(key) {
    if (!key) return { size: null, condicao: null };
    if (key.includes('|')) {
        const idx = key.indexOf('|');
        return { size: key.slice(0, idx), condicao: key.slice(idx + 1) };
    }
    if (CONDICOES.includes(key)) return { size: null, condicao: key };
    return { size: key, condicao: null };
}

function buildVariationKey(size, condicao) {
    if (size && condicao) return `${size}|${condicao}`;
    if (condicao) return condicao;
    return size || null;
}

function hasCondicoes(item) {
    if (!item || !item.tamanhos) return false;
    return Object.keys(item.tamanhos).some(k => CONDICOES.includes(k) || k.includes('|'));
}

function hasTamanhos(item) {
    if (!item || !item.tamanhos) return false;
    return Object.keys(item.tamanhos).some(k => !CONDICOES.includes(k));
}

function formatVariationLabel(key) {
    if (!key) return '';
    return key.replace('|', ' — ');
}

function renderVariationChips(item) {
    if (!item.tamanhos) return '';
    const hasTam  = hasTamanhos(item);
    const hasCond = hasCondicoes(item);

    if (hasTam && hasCond) {
        const sizeMap = {};
        Object.entries(item.tamanhos).forEach(([k, q]) => {
            const { size, condicao } = parseVariationKey(k);
            if (!size) return;
            if (!sizeMap[size]) sizeMap[size] = {};
            sizeMap[size][condicao] = q;
        });
        return Object.entries(sizeMap).map(([s, conds]) => {
            const novo = conds['NOVO'] ?? 0;
            const hig  = conds['HIGIENIZADO'] ?? 0;
            return `<div class="size-chip" style="flex-direction:column;align-items:flex-start;gap:2px;min-width:110px;">
                <strong style="font-size:11px;">${s}</strong>
                <span style="display:flex;gap:8px;font-size:11px;">
                    <span style="color:var(--green);font-weight:700;">N:${novo}</span>
                    <span style="color:var(--accent);font-weight:700;">H:${hig}</span>
                </span>
            </div>`;
        }).join('');
    }

    if (!hasTam && hasCond) {
        const novo = item.tamanhos['NOVO'] ?? 0;
        const hig  = item.tamanhos['HIGIENIZADO'] ?? 0;
        return `
            <div class="size-chip"><strong style="color:var(--green);">NOVO:</strong> <span class="qty ${novo > 0 ? 'ok' : 'low'}">${novo}</span></div>
            <div class="size-chip"><strong style="color:var(--accent);">HIGIENIZADO:</strong> <span class="qty ${hig > 0 ? 'ok' : 'low'}">${hig}</span></div>
        `;
    }

    return Object.entries(item.tamanhos).map(([s, q]) =>
        `<div class="size-chip"><strong>${s}:</strong> <span class="qty ${q > 0 ? 'ok' : 'low'}">${q}</span></div>`
    ).join('');
}

// ── Toast ─────────────────────────────────────────────────────────────────
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

// ── Navigation ────────────────────────────────────────────────────────────
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

// ── Session cleanup ───────────────────────────────────────────────────────
function clearSession() {
    localStorage.removeItem('epi_session');
}

// ── Global event listeners ────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.view !== 'login') {
        e.preventDefault();
        if (state.view === 'dashboard') {
            if (confirm('Deseja sair do sistema?')) {
                handleLogout();
            }
        } else {
            if (!goBack()) navigateTo('stock');
        }
    }
});

window.addEventListener('pagehide', () => {
    clearSession();
});
