# PS Port Safe — Risk Intelligence Platform

**Brasil Terminal Portuário · Santos/SP**

Plataforma web de coleta e análise de percepção de risco operacional do terminal portuário.

---

## 🚀 Deploy Rápido

### Vercel (recomendado — 2 minutos)
```bash
npm i -g vercel
vercel --prod
```

### Netlify
```bash
# Arraste o arquivo ps-port-safe.html para app.netlify.com
# ou:
npm i -g netlify-cli
netlify deploy --prod --dir .
```

### GitHub Pages
```bash
git init
git add .
git commit -m "PS Port Safe v1.0"
git branch -M main
git remote add origin https://github.com/SEU-USER/ps-port-safe.git
git push -u origin main
# Ative GitHub Pages em Settings > Pages > Branch: main
```

### Intranet local (Nginx)
```nginx
server {
    listen 80;
    server_name portsafe.btp.local;
    root /var/www/ps-port-safe;
    index ps-port-safe.html;
    add_header Cache-Control "no-cache";
}
```

### Python (teste rápido)
```bash
python3 -m http.server 8080
# Acesse: http://localhost:8080/ps-port-safe.html
```

---

## 🔐 Acesso

| Perfil | Senha | Acesso |
|--------|-------|--------|
| 🚛 Motorista Externo | — (livre) | Formulário externo (8 módulos) |
| 👷 Colaborador BTP | — (livre) | Formulário interno (8 módulos) |
| 📊 Gestor | `btp2025` | Dashboard completo |

---

## 📂 Estrutura

```
ps-port-safe/
├── ps-port-safe.html    # Aplicação completa (arquivo único)
├── README.md            # Este arquivo
├── netlify.toml         # Config Netlify
├── vercel.json          # Config Vercel
└── .gitignore           # Git ignore
```

---

## 🗄️ Dados

- Armazenados em `localStorage` do browser (MVP)
- Chave motoristas: `ps_respostas`
- Chave colaboradores: `ps_colaboradores`
- Exportação: CSV · JSON · PDF via interface do gestor

---

## 🔧 Upgrade para Backend (v2.0)

Ver `RELATORIO-TECNICO.md` para guia completo de migração para PostgreSQL + Node.js API.

**Stack recomendada:**
- Backend: Node.js 20 + Express + Prisma
- Banco: PostgreSQL 16
- Auth: JWT + bcrypt
- Deploy: Railway, Render, AWS ou servidor próprio

---

## 📋 Funcionalidades

### Formulário Externo (Motoristas)
- 8 módulos: Perfil, Frequência, Navegação, Risco, Ocorrências, Comportamento, Feedback, App
- Acesso por QR Code na portaria

### Formulário Interno (Colaboradores)
- 8 módulos: Identificação + Matrícula, Turno/Área, Risco, Condições, Ocorrências, Clima, Zonas, App
- 16 cargos mapeados (Op. I–V, Conferente, Capatazia, Estivador, etc.)
- Áreas: Pátio, Cais, Reefer, Gate, Armazém, CCOS, ADM/Gestão

### Dashboard (Gestores)
- KPIs motoristas + colaboradores
- 8 gráficos interativos (Chart.js)
- Filtros por cargo, turno, área, nível de risco
- Mapa SVG do pátio com heatmap combinado
- Ranking de riscos combinado (🚛 + 👷)
- Central de sugestões unificada
- Exportação: CSV · JSON · PDF

---

## 🛡️ Segurança

- 3 perfis de acesso com separação total
- `data-locked` previne acesso cruzado entre seções
- Dados de colaboradores em chave separada do localStorage
- HTTPS obrigatório em produção

---

**Versão:** 1.0 MVP · **Data:** Março 2026 · **Licença:** Uso Interno BTP
