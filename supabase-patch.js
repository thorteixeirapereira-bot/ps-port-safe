(function () {
  const SUPABASE_URL = 'https://qyiqqzkrpafjcytchixz.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF5aXFxemtycGFmamN5dGNoaXh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyMDA4NjUsImV4cCI6MjA4OTc3Njg2NX0.62j9HgS9a3CQLjFHFAXpLfLtkxUnoZzzYf_T1OYJsTk';

  let db = null;

  // ─── INIT ────────────────────────────────────────────────────────────────────
  function init() {
    try {
      db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      console.log('[PS] Supabase OK');
    } catch (e) {
      console.warn('[PS] Supabase falhou:', e.message);
    }
  }

  // ─── LÊ DO SUPABASE E ATUALIZA LOCALSTORAGE ──────────────────────────────────
  async function pull(table, localKey) {
    if (!db) return;
    try {
      const { data, error } = await db
        .from(table)
        .select('payload')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const records = (data || []).map(r => r.payload).filter(Boolean);
      localStorage.setItem(localKey, JSON.stringify(records));
      console.log('[PS] Pull', table, ':', records.length, 'registros');
    } catch (e) {
      console.warn('[PS] Pull falhou:', e.message);
    }
  }

  // ─── INSERE NO SUPABASE ───────────────────────────────────────────────────────
  async function push(table, record) {
    if (!db) return;
    try {
      const { error } = await db
        .from(table)
        .insert([{ id: record.id, payload: record }]);
      if (error) throw error;
      console.log('[PS] Push OK:', record.id);
    } catch (e) {
      console.warn('[PS] Push falhou:', e.message);
    }
  }

  // ─── DELETA TUDO ─────────────────────────────────────────────────────────────
  async function wipe(table) {
    if (!db) return;
    try {
      const { error } = await db.from(table).delete().not('id', 'is', null);
      if (error) throw error;
    } catch (e) {
      console.warn('[PS] Wipe falhou:', e.message);
    }
  }

  // ─── ATUALIZA O DASHBOARD COMPLETO ───────────────────────────────────────────
  async function refreshDashboard() {
    await pull('respostas',     'ps_respostas');
    await pull('colaboradores', 'ps_colaboradores');
    if (typeof updateBadge       === 'function') updateBadge();
    if (typeof updateColabBadge  === 'function') updateColabBadge();
    if (typeof applyFilters      === 'function') applyFilters();
    if (typeof updateColabDash   === 'function') updateColabDash();
  }

  // ─── REALTIME ────────────────────────────────────────────────────────────────
  function startRealtime() {
    if (!db) return;
    db.channel('ps-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'respostas' },
        async (payload) => {
          console.log('[PS] Realtime: nova resposta');
          // Adiciona direto no cache local sem precisar fazer pull completo
          const local = JSON.parse(localStorage.getItem('ps_respostas') || '[]');
          const novo = payload.new?.payload;
          if (novo && !local.find(r => r.id === novo.id)) {
            local.unshift(novo);
            localStorage.setItem('ps_respostas', JSON.stringify(local));
          }
          if (typeof updateBadge  === 'function') updateBadge();
          const dash = document.getElementById('dash-section');
          if (dash && dash.classList.contains('active')) {
            if (typeof applyFilters === 'function') applyFilters();
          }
        }
      )
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'colaboradores' },
        async (payload) => {
          console.log('[PS] Realtime: novo colaborador');
          const local = JSON.parse(localStorage.getItem('ps_colaboradores') || '[]');
          const novo = payload.new?.payload;
          if (novo && !local.find(r => r.id === novo.id)) {
            local.unshift(novo);
            localStorage.setItem('ps_colaboradores', JSON.stringify(local));
          }
          if (typeof updateColabBadge  === 'function') updateColabBadge();
          const dash = document.getElementById('dash-section');
          if (dash && dash.classList.contains('active')) {
            if (typeof updateColabDash === 'function') updateColabDash();
          }
        }
      )
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'respostas' },
        async () => { await refreshDashboard(); }
      )
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'colaboradores' },
        async () => { await refreshDashboard(); }
      )
      .subscribe(s => {
        console.log('[PS] Realtime:', s);
        const dot = document.querySelector('.status-dot');
        if (!dot) return;
        if (s === 'SUBSCRIBED') {
          dot.style.background = '#00c86e';
          dot.title = 'Online · Realtime ativo';
        } else {
          dot.style.background = '#ffb800';
          dot.title = 'Reconectando...';
        }
      });
  }

  // ─── MAIN ────────────────────────────────────────────────────────────────────
  window.addEventListener('DOMContentLoaded', async function () {
    init();

    // Carrega dados do banco no localStorage antes de qualquer coisa
    await pull('respostas',     'ps_respostas');
    await pull('colaboradores', 'ps_colaboradores');

    // Realtime desde o início
    startRealtime();

    // ── Patch submitForm (motoristas) ─────────────────────────────────────────
    const _origSubmit = window.submitForm;
    window.submitForm = async function () {
      // Guarda IDs existentes
      const existentes = new Set(
        JSON.parse(localStorage.getItem('ps_respostas') || '[]').map(r => r.id)
      );
      // Executa original (salva no localStorage)
      await _origSubmit();
      // Descobre o novo registro
      const depois = JSON.parse(localStorage.getItem('ps_respostas') || '[]');
      const novo = depois.find(r => !existentes.has(r.id));
      if (novo) await push('respostas', novo);
    };

    // ── Patch cSubmit (colaboradores) ─────────────────────────────────────────
    const _origCSubmit = window.cSubmit;
    window.cSubmit = async function () {
      const existentes = new Set(
        JSON.parse(localStorage.getItem('ps_colaboradores') || '[]').map(r => r.id)
      );
      await _origCSubmit();
      const depois = JSON.parse(localStorage.getItem('ps_colaboradores') || '[]');
      const novo = depois.find(r => !existentes.has(r.id));
      if (novo) await push('colaboradores', novo);
    };

    // ── Patch dashLogin (abre dashboard como gestor) ───────────────────────────
    const _origDashLogin = window.dashLogin;
    window.dashLogin = async function (btn) {
      if (typeof showToast === 'function') showToast('⟳ Carregando dados...');
      // Busca dados frescos do banco
      await pull('respostas',     'ps_respostas');
      await pull('colaboradores', 'ps_colaboradores');
      // Abre o dashboard normalmente
      _origDashLogin(btn);
      // Aguarda gráficos iniciarem e força atualização
      setTimeout(() => {
        if (typeof applyFilters    === 'function') applyFilters();
        if (typeof updateColabDash === 'function') updateColabDash();
        if (typeof updateBadge     === 'function') updateBadge();
        if (typeof updateColabBadge=== 'function') updateColabBadge();
        if (typeof showToast       === 'function') showToast('✅ Dados sincronizados!');
      }, 600);
    };

    // ── Patch clearAllData ────────────────────────────────────────────────────
    window.clearAllData = async function () {
      if (!confirm('⚠️ Apagar TODOS os dados? Esta ação não pode ser desfeita.')) return;
      await wipe('respostas');
      localStorage.removeItem('ps_respostas');
      if (typeof updateBadge  === 'function') updateBadge();
      if (typeof applyFilters === 'function') applyFilters();
      if (typeof showToast    === 'function') showToast('🗑 Dados apagados!');
    };

    // ── Patch clearColabData ──────────────────────────────────────────────────
    window.clearColabData = async function () {
      if (!confirm('Apagar TODOS os dados de colaboradores?')) return;
      await wipe('colaboradores');
      localStorage.removeItem('ps_colaboradores');
      if (typeof updateColabBadge  === 'function') updateColabBadge();
      if (typeof updateColabDash   === 'function') updateColabDash();
      if (typeof showToast         === 'function') showToast('🗑 Colaboradores apagados!');
    };

    // ── Patch generateDemoData ────────────────────────────────────────────────
    const _origDemo = window.generateDemoData;
    window.generateDemoData = async function () {
      const existentes = new Set(
        JSON.parse(localStorage.getItem('ps_respostas') || '[]').map(r => r.id)
      );
      await _origDemo();
      const novos = JSON.parse(localStorage.getItem('ps_respostas') || '[]')
        .filter(r => !existentes.has(r.id));
      for (const r of novos) await push('respostas', r);
    };

    // ── Patch genColabDemo ────────────────────────────────────────────────────
    const _origColabDemo = window.genColabDemo;
    window.genColabDemo = async function () {
      const existentes = new Set(
        JSON.parse(localStorage.getItem('ps_colaboradores') || '[]').map(r => r.id)
      );
      await _origColabDemo();
      const novos = JSON.parse(localStorage.getItem('ps_colaboradores') || '[]')
        .filter(r => !existentes.has(r.id));
      for (const r of novos) await push('colaboradores', r);
    };

    console.log('[PS] ✅ Patch completo aplicado!');
  });

  // ─── PWA Service Worker ───────────────────────────────────────────────────────
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then(r => console.log('[PS] SW:', r.scope))
        .catch(e => console.warn('[PS] SW falhou:', e));
    });
  }

  // ─── PWA Banner de instalação ─────────────────────────────────────────────────
  let _prompt = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    _prompt = e;
    showBanner();
  });

  function showBanner() {
    if (document.getElementById('pwa-banner')) return;
    const b = document.createElement('div');
    b.id = 'pwa-banner';
    b.style.cssText = `
      position:fixed;bottom:20px;left:50%;transform:translateX(-50%);
      background:#0b1e35;border:1px solid #00c86e;border-radius:12px;
      padding:14px 20px;display:flex;align-items:center;gap:14px;
      z-index:9998;box-shadow:0 8px 32px rgba(0,0,0,.6);
      font-family:'Exo 2',sans-serif;max-width:360px;width:calc(100% - 40px);
    `;
    b.innerHTML = `
      <span style="font-size:28px">📱</span>
      <div style="flex:1">
        <div style="font-family:Rajdhani,sans-serif;font-weight:700;font-size:15px;color:#d6eeff;letter-spacing:1px">Instalar PS Port Safe</div>
        <div style="font-size:11px;color:#3d6b8f;margin-top:2px">Acesso rápido direto no celular</div>
      </div>
      <button id="pwa-install-btn" style="background:linear-gradient(135deg,#0099cc,#00d4ff);color:#000;border:none;border-radius:8px;padding:10px 16px;font-family:Rajdhani,sans-serif;font-weight:800;font-size:13px;cursor:pointer;letter-spacing:1px">INSTALAR</button>
      <button onclick="document.getElementById('pwa-banner').remove()" style="background:none;border:none;color:#3d6b8f;cursor:pointer;font-size:18px;padding:4px">✕</button>
    `;
    document.body.appendChild(b);
    document.getElementById('pwa-install-btn').addEventListener('click', async () => {
      if (!_prompt) return;
      _prompt.prompt();
      const { outcome } = await _prompt.userChoice;
      if (outcome === 'accepted') b.remove();
      _prompt = null;
    });
    setTimeout(() => b?.remove(), 15000);
  }

  window.addEventListener('appinstalled', () => {
    document.getElementById('pwa-banner')?.remove();
  });

})();
