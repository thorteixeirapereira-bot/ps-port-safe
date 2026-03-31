(function () {
  const SUPABASE_URL = 'https://qyiqqzkrpafjcytchixz.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF5aXFxemtycGFmamN5dGNoaXh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyMDA4NjUsImV4cCI6MjA4OTc3Njg2NX0.62j9HgS9a3CQLjFHFAXpLfLtkxUnoZzzYf_T1OYJsTk';

  const LOCAL_KEYS = {
    respostas:     'ps_respostas',
    colaboradores: 'ps_colaboradores',
  };

  let db = null;
  let _ok = false;

  // ─── 1. INIT ────────────────────────────────────────────────────────────────
  function initSupabase() {
    try {
      if (!window.supabase) throw new Error('SDK nao carregado');
      db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      _ok = true;
      console.log('[PS] Supabase conectado ✅');
    } catch (e) {
      console.warn('[PS] Supabase offline:', e.message);
    }
  }

  // ─── 2. CRUD ────────────────────────────────────────────────────────────────
  async function dbGet(table) {
    if (!_ok) return _local(table);
    try {
      const { data, error } = await db
        .from(table)
        .select('payload')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const records = (data || []).map(r => r.payload).filter(Boolean);
      localStorage.setItem(LOCAL_KEYS[table], JSON.stringify(records));
      return records;
    } catch (e) {
      console.warn('[PS] dbGet falhou, usando cache:', e.message);
      return _local(table);
    }
  }

  async function dbInsert(table, record) {
    if (!_ok) return false;
    try {
      const { error } = await db
        .from(table)
        .insert([{ id: record.id, payload: record }]);
      if (error) throw error;
      console.log('[PS] ✅ Inserido:', record.id);
      return true;
    } catch (e) {
      console.warn('[PS] dbInsert falhou:', e.message);
      return false;
    }
  }

  async function dbUpsert(table, records) {
    if (!_ok || !records.length) return;
    try {
      const rows = records.map(r => ({ id: r.id, payload: r }));
      const { error } = await db
        .from(table)
        .upsert(rows, { onConflict: 'id' });
      if (error) throw error;
      console.log('[PS] ✅ Upsert:', records.length, 'registros em', table);
    } catch (e) {
      console.warn('[PS] dbUpsert falhou:', e.message);
    }
  }

  async function dbDeleteAll(table) {
    if (!_ok) return false;
    try {
      const { error } = await db
        .from(table)
        .delete()
        .not('id', 'is', null);
      if (error) throw error;
      return true;
    } catch (e) {
      console.warn('[PS] dbDeleteAll falhou:', e.message);
      return false;
    }
  }

  function _local(table) {
    return JSON.parse(localStorage.getItem(LOCAL_KEYS[table]) || '[]');
  }

  // ─── 3. SYNC COMPLETO ───────────────────────────────────────────────────────
  async function syncAll() {
    const [r, c] = await Promise.all([
      dbGet('respostas'),
      dbGet('colaboradores'),
    ]);
    console.log('[PS] Sync:', r.length, 'respostas,', c.length, 'colaboradores');
    return { respostas: r, colaboradores: c };
  }

  // ─── 4. REALTIME ────────────────────────────────────────────────────────────
  function setupRealtime() {
    if (!_ok) return;

    db.channel('ps-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'respostas' },
        async () => {
          console.log('[PS] Realtime: nova resposta motorista');
          await dbGet('respostas');
          if (typeof updateBadge === 'function') updateBadge();
          const dash = document.getElementById('dash-section');
          if (dash && dash.classList.contains('active')) {
            if (typeof applyFilters === 'function') await applyFilters();
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'colaboradores' },
        async () => {
          console.log('[PS] Realtime: nova resposta colaborador');
          await dbGet('colaboradores');
          if (typeof updateColabBadge === 'function') updateColabBadge();
          const dash = document.getElementById('dash-section');
          if (dash && dash.classList.contains('active')) {
            if (typeof applyColabFilters === 'function') await applyColabFilters();
          }
        }
      )
      .subscribe(status => {
        console.log('[PS] Realtime status:', status);
        const dot = document.querySelector('.status-dot');
        if (!dot) return;
        if (status === 'SUBSCRIBED') {
          dot.style.background = '#00c86e';
          dot.title = 'Conectado · Realtime ativo';
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          dot.style.background = '#ff3b30';
          dot.title = 'Realtime desconectado';
        } else {
          dot.style.background = '#ffb800';
          dot.title = 'Reconectando...';
        }
      });
  }

  // ─── 5. PATCHES DAS FUNÇÕES PRINCIPAIS ─────────────────────────────────────
  window.addEventListener('DOMContentLoaded', async function () {

    initSupabase();

    // Sincroniza ao abrir o app
    await syncAll();

    // Realtime ativo desde o início
    setupRealtime();

    // ── submitForm (motoristas) ────────────────────────────────────────────────
    const _origSubmitForm = window.submitForm;
    window.submitForm = async function () {
      // Captura snapshot antes
      const antes = _local('respostas').length;

      await _origSubmitForm();

      // Pega o novo dado (foi inserido no início do array via unshift no original)
      const depois = _local('respostas');
      const novo = depois[0]; // primeiro = mais recente

      if (novo) {
        const ok = await dbInsert('respostas', novo);
        if (!ok) {
          // Se falhou, tenta upsert
          await dbUpsert('respostas', [novo]);
        }
      }
    };

    // ── cSubmit (colaboradores) ────────────────────────────────────────────────
    const _origCSubmit = window.cSubmit;
    window.cSubmit = async function () {
      await _origCSubmit();

      const depois = _local('colaboradores');
      const novo = depois[0];

      if (novo) {
        const ok = await dbInsert('colaboradores', novo);
        if (!ok) {
          await dbUpsert('colaboradores', [novo]);
        }
      }
    };

    // ── dashLogin: sincroniza ao abrir dashboard ───────────────────────────────
    const _origDashLogin = window.dashLogin;
    window.dashLogin = async function (btn) {
  if (btn) btn.style.opacity = '0.5';
  if (typeof showToast === 'function') showToast('⟳ Sincronizando dados...');
  await syncAll();
  await _origDashLogin(btn);
  if (btn) btn.style.opacity = '';
  // Aguarda os gráficos iniciarem e re-renderiza com dados do banco
  setTimeout(async () => {
    await dbGet('respostas');
    await dbGet('colaboradores');
    if (typeof applyFilters      === 'function') await applyFilters();
    if (typeof updateColabDash   === 'function') await updateColabDash();
    if (typeof updateBadge       === 'function') updateBadge();
    if (typeof updateColabBadge  === 'function') updateColabBadge();
    if (typeof showToast         === 'function') showToast('✅ Dashboard atualizado!');
  }, 800);
};

    // ── applyFilters: sempre busca do Supabase ─────────────────────────────────
    const _origApplyFilters = window.applyFilters;
    window.applyFilters = async function () {
      await dbGet('respostas');
      if (typeof _origApplyFilters === 'function') await _origApplyFilters();
    };

    // ── applyColabFilters: sempre busca do Supabase ────────────────────────────
    const _origApplyColabFilters = window.applyColabFilters;
    window.applyColabFilters = async function () {
      await dbGet('colaboradores');
      if (typeof _origApplyColabFilters === 'function') await _origApplyColabFilters();
    };

    // ── clearAllData ───────────────────────────────────────────────────────────
    window.clearAllData = async function () {
      if (!confirm('⚠️ Apagar TODOS os dados do banco? Esta ação não pode ser desfeita.')) return;
      await dbDeleteAll('respostas');
      localStorage.removeItem('ps_respostas');
      if (typeof updateBadge   === 'function') updateBadge();
      if (typeof applyFilters  === 'function') await applyFilters();
      if (typeof showToast     === 'function') showToast('🗑 Dados apagados!');
    };

    // ── clearColabData ─────────────────────────────────────────────────────────
    window.clearColabData = async function () {
      if (!confirm('Apagar TODOS os dados de colaboradores?')) return;
      await dbDeleteAll('colaboradores');
      localStorage.removeItem('ps_colaboradores');
      if (typeof updateColabBadge  === 'function') updateColabBadge();
      if (typeof applyColabFilters === 'function') await applyColabFilters();
      if (typeof showToast         === 'function') showToast('🗑 Colaboradores apagados!');
    };

    // ── generateDemoData ───────────────────────────────────────────────────────
    const _origGenDemo = window.generateDemoData;
    window.generateDemoData = async function () {
      const antes = _local('respostas').length;
      await _origGenDemo();
      const depois = _local('respostas');
      const novos = depois.slice(0, depois.length - antes);
      if (novos.length) await dbUpsert('respostas', novos);
    };

    // ── genColabDemo ───────────────────────────────────────────────────────────
    const _origGenColabDemo = window.genColabDemo;
    window.genColabDemo = async function () {
      const antes = _local('colaboradores').length;
      await _origGenColabDemo();
      const depois = _local('colaboradores');
      const novos = depois.slice(0, depois.length - antes);
      if (novos.length) await dbUpsert('colaboradores', novos);
    };

    // ── Status visual ──────────────────────────────────────────────────────────
    const dot = document.querySelector('.status-dot');
    if (dot) {
      dot.style.background = _ok ? '#00c86e' : '#ffb800';
      dot.title = _ok ? 'Conectado ao Supabase' : 'Modo offline (cache local)';
    }

    console.log('[PS] ✅ Todos os patches aplicados! Realtime ativo.');
  });

  // ─── 6. PWA – Service Worker ────────────────────────────────────────────────
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then(reg => console.log('[PS] SW registrado:', reg.scope))
        .catch(err => console.warn('[PS] SW falhou:', err));
    });
  }

  // ─── 7. PWA – Banner de instalação ─────────────────────────────────────────
  let _installPrompt = null;

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    _installPrompt = e;
    showInstallBanner();
  });

  function showInstallBanner() {
    if (document.getElementById('pwa-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'pwa-banner';
    banner.style.cssText = `
      position:fixed;bottom:20px;left:50%;transform:translateX(-50%);
      background:#0b1e35;border:1px solid #00c86e;border-radius:12px;
      padding:14px 20px;display:flex;align-items:center;gap:14px;
      z-index:9998;box-shadow:0 8px 32px rgba(0,0,0,.6);
      font-family:'Exo 2',sans-serif;max-width:360px;width:calc(100% - 40px);
    `;
    banner.innerHTML = `
      <span style="font-size:28px">📱</span>
      <div style="flex:1">
        <div style="font-family:Rajdhani,sans-serif;font-weight:700;font-size:15px;color:#d6eeff;letter-spacing:1px">Instalar PS Port Safe</div>
        <div style="font-size:11px;color:#3d6b8f;margin-top:2px">Acesso rápido direto no celular</div>
      </div>
      <button id="pwa-install-btn" style="
        background:linear-gradient(135deg,#0099cc,#00d4ff);color:#000;
        border:none;border-radius:8px;padding:10px 16px;
        font-family:Rajdhani,sans-serif;font-weight:800;font-size:13px;
        cursor:pointer;letter-spacing:1px
      ">INSTALAR</button>
      <button onclick="this.closest('#pwa-banner').remove()" style="
        background:none;border:none;color:#3d6b8f;cursor:pointer;font-size:18px;padding:4px
      ">✕</button>
    `;
    document.body.appendChild(banner);

    document.getElementById('pwa-install-btn').addEventListener('click', async () => {
      if (!_installPrompt) return;
      _installPrompt.prompt();
      const { outcome } = await _installPrompt.userChoice;
      if (outcome === 'accepted') banner.remove();
      _installPrompt = null;
    });

    setTimeout(() => banner?.remove(), 15000);
  }

  window.addEventListener('appinstalled', () => {
    console.log('[PS] App instalado com sucesso!');
    document.getElementById('pwa-banner')?.remove();
  });

})();
