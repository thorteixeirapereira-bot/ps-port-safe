(function () {
  const SUPABASE_URL = 'https://qyiqqzkrpafjcytchixz.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF5aXFxemtycGFmamN5dGNoaXh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyMDA4NjUsImV4cCI6MjA4OTc3Njg2NX0.62j9HgS9a3CQLjFHFAXpLfLtkxUnoZzzYf_T1OYJsTk';

  const LOCAL_KEYS = {
    respostas:     'ps_respostas',
    colaboradores: 'ps_colaboradores',
  };

  let db = null;
  let _supabaseOk = false;

  function initSupabase() {
    try {
      if (!window.supabase) throw new Error('SDK nao carregado');
      db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      _supabaseOk = true;
      console.log('[PS] Supabase conectado!');
    } catch (e) {
      console.warn('[PS] Supabase offline:', e.message);
    }
  }

  async function dbGet(table) {
    if (!_supabaseOk) return _local(table);
    try {
      const { data, error } = await db
        .from(table).select('payload').order('created_at', { ascending: false });
      if (error) throw error;
      const records = data.map(r => r.payload);
      localStorage.setItem(LOCAL_KEYS[table], JSON.stringify(records));
      return records;
    } catch (e) {
      console.warn('[PS] dbGet falhou:', e.message);
      return _local(table);
    }
  }

  async function dbInsert(table, record) {
    if (!_supabaseOk) return;
    try {
      const { error } = await db.from(table).insert([{ id: record.id, payload: record }]);
      if (error) throw error;
      console.log('[PS] Salvo no Supabase:', record.id);
    } catch (e) {
      console.warn('[PS] dbInsert falhou:', e.message);
    }
  }

  async function dbUpsert(table, records) {
    if (!_supabaseOk || !records.length) return;
    try {
      const rows = records.map(r => ({ id: r.id, payload: r }));
      const { error } = await db.from(table).upsert(rows, { onConflict: 'id' });
      if (error) throw error;
    } catch (e) {
      console.warn('[PS] dbUpsert falhou:', e.message);
    }
  }

  async function dbDeleteAll(table) {
    if (!_supabaseOk) return;
    try {
      const { error } = await db.from(table).delete().not('id', 'is', null);
      if (error) throw error;
    } catch (e) {
      console.warn('[PS] dbDeleteAll falhou:', e.message);
    }
  }

  function _local(table) {
    return JSON.parse(localStorage.getItem(LOCAL_KEYS[table]) || '[]');
  }

  async function syncFromSupabase() {
    try {
      const [respostas, colaboradores] = await Promise.all([
        dbGet('respostas'),
        dbGet('colaboradores'),
      ]);
      localStorage.setItem('ps_respostas',     JSON.stringify(respostas));
      localStorage.setItem('ps_colaboradores', JSON.stringify(colaboradores));
      console.log('[PS] Sync OK:', respostas.length, 'respostas,', colaboradores.length, 'colaboradores');
    } catch (e) {
      console.warn('[PS] Sync falhou:', e.message);
    }
  }

  window.addEventListener('DOMContentLoaded', function () {
    initSupabase();

    const _origSubmitForm = window.submitForm;
    window.submitForm = async function () {
      _origSubmitForm();
      const data = JSON.parse(localStorage.getItem('ps_respostas') || '[]');
      const latest = data[data.length - 1];
      if (latest) await dbInsert('respostas', latest);
    };

    const _origCSubmit = window.cSubmit;
    window.cSubmit = async function () {
      _origCSubmit();
      const data = JSON.parse(localStorage.getItem('ps_colaboradores') || '[]');
      const latest = data[data.length - 1];
      if (latest) await dbInsert('colaboradores', latest);
    };

    const _origDashLogin = window.dashLogin;
    window.dashLogin = async function (btn) {
      if (btn) btn.style.opacity = '0.5';
      showToast('Sincronizando dados...');
      await syncFromSupabase();
      _origDashLogin(btn);
      if (btn) btn.style.opacity = '';
    };

    window.clearAllData = async function () {
      if (!confirm('Apagar TODOS os dados? Esta ação não pode ser desfeita.')) return;
      await dbDeleteAll('respostas');
      localStorage.removeItem('ps_respostas');
      updateBadge(); applyFilters();
      showToast('Dados apagados.');
    };

    window.clearColabData = async function () {
      if (!confirm('Apagar TODOS os dados de colaboradores?')) return;
      await dbDeleteAll('colaboradores');
      localStorage.removeItem('ps_colaboradores');
      updateColabBadge(); applyColabFilters();
      showToast('Dados de colaboradores apagados.');
    };

    const _origGenDemo = window.generateDemoData;
    window.generateDemoData = async function () {
      const antes = JSON.parse(localStorage.getItem('ps_respostas') || '[]').length;
      _origGenDemo();
      const depois = JSON.parse(localStorage.getItem('ps_respostas') || '[]');
      await dbUpsert('respostas', depois.slice(antes));
    };

    const _origGenColabDemo = window.genColabDemo;
    window.genColabDemo = async function () {
      const antes = JSON.parse(localStorage.getItem('ps_colaboradores') || '[]').length;
      _origGenColabDemo();
      const depois = JSON.parse(localStorage.getItem('ps_colaboradores') || '[]');
      await dbUpsert('colaboradores', depois.slice(antes));
    };

    const dot = document.querySelector('.status-dot');
    if (dot) {
      dot.style.background = _supabaseOk ? '#00c86e' : '#ffb800';
      dot.title = _supabaseOk ? 'Conectado ao Supabase' : 'Modo offline';
    }

    console.log('[PS] Patches aplicados!');
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then(reg => console.log('[PS] SW registrado:', reg.scope))
        .catch(err => console.warn('[PS] SW falhou:', err));
    });
  }

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
        background:none;border:none;color:#3d6b8f;cursor:pointer;font-size:18px
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
    console.log('[PS] App instalado!');
    document.getElementById('pwa-banner')?.remove();
  });

})();
