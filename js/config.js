/**
 * Almoxarifado EPI — Config
 * Constantes globais e cliente Supabase
 */

const SUPABASE_URL = 'https://mgcjidryrjqiceielmzp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1nY2ppZHJ5cmpxaWNlaWVsbXpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMjEwNzEsImV4cCI6MjA4NzY5NzA3MX0.UAKkzy5fMIkrlmnqz9E9KknUw9xhoYpa3f1ptRpOuAA';
const APP_SLUG = 'almoxarifado_mec';
const APP_NAME = 'Almoxarifado EPI';

const sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        flowType: 'implicit',
        detectSessionInUrl: false
    }
});

const MOVEMENT_TYPES = {
    'COMPRA':       { label: 'Compra de Estoque',   color: 'emerald', icon: 'shopping-cart',    sign: '+' },
    'REPOSICAO':    { label: 'Reposição',            color: 'blue',    icon: 'arrow-clockwise',  sign: '-' },
    'DISTRIBUICAO': { label: 'Distribuição EPI',     color: 'purple',  icon: 'hand-coins',       sign: '-' },
    'SAIDA':        { label: 'Saída',                color: 'red',     icon: 'arrow-up-right',   sign: '-' },
    'AJUSTE':       { label: 'Ajuste',               color: 'amber',   icon: 'wrench',           sign: '±' },
    'TRANSFERENCIA':{ label: 'Transferência',        color: 'cyan',    icon: 'arrows-left-right', sign: '→' }
};

const CONDICOES = Object.freeze(['NOVO', 'HIGIENIZADO']);

const PULL_THRESHOLD = 80;
