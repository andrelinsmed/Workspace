/* Workspace Crisalix — painel dos robôs. Sem dependências, sem build. */
(function () {
  'use strict';

  const CFG = window.WORKSPACE || { titulo: 'Workspace', robos: [] };
  const CHAVE_SENHA = 'wc.senha';
  const ATUALIZA_MS = 5 * 60 * 1000;
  const app = document.getElementById('app');

  const estado = {
    senha: lerSenha(),
    dados: {},       // por robô: resposta da API
    erros: {},       // por robô: mensagem
    carregando: false,
    ultimaCarga: null,
    msgLogin: '',
    filtro: { tipo: 'todos', busca: '', ordem: 'recente' }
  };

  /* ---------------- utilidades ---------------- */
  function lerSenha() { try { return localStorage.getItem(CHAVE_SENHA) || ''; } catch (e) { return ''; } }
  function salvarSenha(s) { try { s ? localStorage.setItem(CHAVE_SENHA, s) : localStorage.removeItem(CHAVE_SENHA); } catch (e) {} }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function semAcento(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  function hojeISO() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function paraData(iso) {
    if (!iso) return null;
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
  }
  function diasEntre(isoA, isoB) {
    const a = paraData(String(isoA).slice(0, 10)), b = paraData(String(isoB).slice(0, 10));
    if (!a || !b) return null;
    return Math.round((b - a) / 86400000);
  }
  function fmtData(iso, comHora) {
    const d = paraData(iso);
    if (!d) return '—';
    const ano = d.getFullYear() !== new Date().getFullYear();
    let s = String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + (ano ? '/' + d.getFullYear() : '');
    if (comHora && /T\d/.test(iso)) s += ' · ' + iso.slice(11, 16);
    return s;
  }
  function relativo(iso) {
    const n = diasEntre(hojeISO(), iso);
    if (n === null) return '';
    if (n === 0) return 'hoje';
    if (n === -1) return 'ontem';
    if (n === 1) return 'amanhã';
    if (n < 0) return 'há ' + (-n) + ' dias';
    return 'em ' + n + ' dias';
  }
  function diaSemana(iso) {
    const d = paraData(iso);
    return d ? ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][d.getDay()] : '';
  }
  function iniciais(nome) {
    const t = String(nome || '').replace(/^dra?\.?\s+/i, '').split(/\s+/).filter(Boolean);
    if (!t.length) return '?';
    return (t[0][0] + (t.length > 1 ? t[t.length - 1][0] : '')).toUpperCase();
  }
  function plural(n, um, varios) { return n + ' ' + (n === 1 ? um : varios); }

  /* ---------------- API ---------------- */
  async function chamar(robo, acao) {
    const r = await fetch(robo.api, {
      method: 'POST',
      body: JSON.stringify({ senha: estado.senha, acao: acao }), // text/plain: sem preflight de CORS
      redirect: 'follow'
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }

  function robosAtivos() { return CFG.robos.filter(function (r) { return r.api && !/COLE_AQUI/.test(r.api); }); }

  async function carregarTudo() {
    if (estado.carregando) return;
    estado.carregando = true;
    desenhar();
    await Promise.all(robosAtivos().map(async function (robo) {
      try {
        const d = await chamar(robo, 'dados');
        if (!d.ok) {
          if (d.erro === 'senha') { sair('A senha mudou. Entre de novo.'); return; }
          estado.erros[robo.id] = d.msg || d.erro || 'Erro desconhecido';
          return;
        }
        estado.dados[robo.id] = processar(d);
        delete estado.erros[robo.id];
      } catch (e) {
        estado.erros[robo.id] = 'Não consegui falar com ' + robo.nome + ' (' + e.message + ').';
      }
    }));
    estado.carregando = false;
    estado.ultimaCarga = new Date();
    desenhar();
  }

  function sair(msg) {
    estado.senha = '';
    estado.dados = {};
    salvarSenha('');
    estado.msgLogin = msg || '';
    telaLogin(estado.msgLogin);
  }

  /* ---------------- processamento dos dados da Lia ---------------- */
  const PALAVRAS_FORA = new Set(['dr', 'dra', 'doutor', 'doutora', 'onb', 'onboarding', 'prof', 'de', 'da', 'do', 'dos', 'das', 'e',
    'treinamento', 'secretaria', 'secretarias', 'appt', 'acompanhamento', 'appointment', 'with', 'reuniao', 'com', 'call', 'demo']);

  function tokensNome(nome) {
    return semAcento(nome).toLowerCase()
      .replace(/\(.*?\)/g, ' ')
      .split(/\s[-–—]\s/)[0]
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter(function (t) { return t.length > 1 && !PALAVRAS_FORA.has(t); });
  }
  function nomeDaReuniao(r) {
    return r.profissional || String(r.titulo || '').replace(/^appointment with\s*/i, '');
  }
  function idCadastro(link) {
    const m = String(link || '').match(/surgeons\/(\d+)/);
    return m ? m[1] : '';
  }
  function mesmoNome(a, b) {
    if (!a.length || !b.length || a[0] !== b[0]) return false;
    if (a.length === 1 || b.length === 1) return a.join(' ') === b.join(' ');
    const ja = a.join(''), jb = b.join('');
    const ua = a[a.length - 1], ub = b[b.length - 1];
    return (ua.length >= 4 && jb.indexOf(ua) >= 0) || (ub.length >= 4 && ja.indexOf(ub) >= 0);
  }
  function nomeExibicao(r) {
    return String(r.profissional || nomeDaReuniao(r))
      .replace(/^onb\.?\s+/i, '')
      .split(/\s[-–—]\s/)[0]
      .replace(/^dra\.?\s+/i, 'Dra. ').replace(/^dr\.?\s+/i, 'Dr. ')
      .trim();
  }
  function ehInterna(r) { return /intern/i.test(r.tipo || ''); }
  function ehAppt(r) { return /appt/i.test(r.tipo || ''); }

  const CRM_PROBLEMA = ['erro', 'verificar', 'aguardando você', 'atualizar'];
  const CRM_OK = ['ok', 'já existia', 'liberado', 'ignorado', 'dispensado', 'pausado'];

  function pendenciasDe(r) {
    let itens = (r.followups || []).map(function (f) {
      return { acao: f.acao || '', data: f.data || '', hora: f.hora || '', combinado: !!f.combinado };
    }).filter(function (f) { return f.acao; });
    if (!itens.length && r.followup) {
      itens = r.followup.split(/\n+/).map(function (l) { return l.replace(/^[•\-*]\s*/, '').trim(); })
        .filter(Boolean).map(function (l) {
          const m = l.match(/\((\d{4}-\d{2}-\d{2})/);
          return { acao: l.replace(/\s*\(\d{4}-\d{2}-\d{2}[^)]*\)\s*$/, ''), data: m ? m[1] : '', combinado: /combinado/.test(l) };
        });
    }
    // Sem data própria: usa a data de retorno da reunião
    itens.forEach(function (f) { if (!f.data && r.retorno) { f.data = r.retorno.slice(0, 10); f.estimada = true; } });
    return itens;
  }

  function processar(d) {
    const hoje = hojeISO();
    const reunioes = (d.reunioes || []).slice().sort(function (a, b) { return (b.data || '').localeCompare(a.data || ''); });
    reunioes.forEach(function (r, i) { r._i = i; });

    // Agrupa reuniões de clientes por doutor (cadastro do CRM ou nome parecido)
    const ext = reunioes.filter(function (r) { return !ehInterna(r); });
    const pai = ext.map(function (_, i) { return i; });
    function raiz(i) { while (pai[i] !== i) { pai[i] = pai[pai[i]]; i = pai[i]; } return i; }
    function unir(a, b) { pai[raiz(a)] = raiz(b); }
    const toks = ext.map(function (r) { return tokensNome(nomeDaReuniao(r)); });
    const ids = ext.map(function (r) { return idCadastro(r.linkCrm); });
    for (let i = 0; i < ext.length; i++) {
      for (let j = i + 1; j < ext.length; j++) {
        if ((ids[i] && ids[i] === ids[j]) || mesmoNome(toks[i], toks[j])) unir(i, j);
      }
    }
    const grupos = {};
    ext.forEach(function (r, i) { (grupos[raiz(i)] = grupos[raiz(i)] || []).push(r); });

    const doutores = Object.keys(grupos).map(function (k) {
      const rs = grupos[k]; // já em ordem decrescente de data
      const ultima = rs[0];
      const id = rs.map(function (r) { return idCadastro(r.linkCrm); }).find(Boolean) || '';
      const nomes = rs.map(nomeExibicao).filter(Boolean);
      const nome = nomes.find(function (n) { return /^dra?\./i.test(n); }) || nomes[0] || 'Sem nome';
      const t = tokensNome(nome);
      const chave = id ? 'c' + id : 'n-' + (t[0] || 'x') + '-' + (t[t.length - 1] || 'x');
      const cliente = rs.some(function (r) { return !ehAppt(r); });
      const pend = pendenciasDe(ultima);
      const comData = pend.filter(function (p) { return p.data; }).sort(function (a, b) { return a.data.localeCompare(b.data); });
      const proxima = comData.find(function (p) { return p.data >= hoje; }) || comData[comData.length - 1] || pend[0] || null;
      const crmProblema = rs.find(function (r) { return CRM_PROBLEMA.indexOf(r.stCrm) >= 0; });
      const semCrm = !ultima.stCrm;
      const linkCrm = (rs.find(function (r) { return idCadastro(r.linkCrm); }) || {}).linkCrm || '';
      rs.forEach(function (r) { r._dr = chave; });
      return {
        chave: chave, nome: nome, status: cliente ? 'cliente' : 'prospect',
        reunioes: rs, ultima: ultima, pendencias: pend, proxima: proxima,
        atrasada: !!(proxima && proxima.data && proxima.data < hoje),
        crmProblema: crmProblema ? crmProblema.stCrm : '', semCrm: semCrm, linkCrm: linkCrm
      };
    });

    // Agenda: pendências com data (doutores pela última reunião; internas dos últimos 30 dias) + Tarefas
    const agenda = [];
    doutores.forEach(function (dr) {
      dr.pendencias.forEach(function (p) {
        if (p.data) agenda.push({ data: p.data, hora: p.hora, acao: p.acao, quem: dr.nome, dr: dr.chave, status: dr.status, estimada: p.estimada });
      });
    });
    reunioes.filter(ehInterna).forEach(function (r) {
      if (diasEntre(r.data, hoje) > 30) return;
      pendenciasDe(r).forEach(function (p) {
        if (p.data) agenda.push({ data: p.data, hora: p.hora, acao: p.acao, quem: r.titulo, reuniao: r.id, status: 'interna', estimada: p.estimada });
      });
    });
    (d.tarefas || []).forEach(function (t) {
      if (/conclu|feit|ok|cancel/i.test(t.status)) return;
      agenda.push({ data: (t.prazo || '').slice(0, 10), acao: t.descricao, quem: t.origem || 'Tarefa', status: 'tarefa' });
    });
    agenda.sort(function (a, b) { return (a.data || '9').localeCompare(b.data || '9'); });

    return {
      bruto: d, reunioes: reunioes, doutores: doutores, agenda: agenda, hoje: hoje,
      porChave: doutores.reduce(function (m, dr) { m[dr.chave] = dr; return m; }, {})
    };
  }

  function metricas(L) {
    const hoje = L.hoje;
    const mes = hoje.slice(0, 7);
    const ult7 = L.reunioes.filter(function (r) { const n = diasEntre(r.data, hoje); return n !== null && n >= 0 && n < 7; });
    const prox7 = L.agenda.filter(function (a) { const n = diasEntre(hoje, a.data); return n !== null && n >= 0 && n <= 7; });
    const atras = L.agenda.filter(function (a) { const n = diasEntre(hoje, a.data); return n !== null && n < 0 && n >= -21; });
    const ext = L.reunioes.filter(function (r) { return !ehInterna(r); });
    const crmAberto = ext.filter(function (r) { return !r.stCrm || CRM_PROBLEMA.indexOf(r.stCrm) >= 0; });
    return {
      reunioes7: ult7.length,
      clientes7: ult7.filter(function (r) { return !ehInterna(r); }).length,
      apptsMes: L.reunioes.filter(function (r) { return ehAppt(r) && (r.data || '').slice(0, 7) === mes; }).length,
      reunioesMes: L.reunioes.filter(function (r) { return (r.data || '').slice(0, 7) === mes; }).length,
      doutores: L.doutores.length,
      prospects: L.doutores.filter(function (d) { return d.status === 'prospect'; }).length,
      clientes: L.doutores.filter(function (d) { return d.status === 'cliente'; }).length,
      prox7: prox7.length, atrasadas: atras.length,
      crmAberto: crmAberto.length
    };
  }

  function saudeLia(L) {
    const e = L.bruto.estado || {};
    const hoje = L.hoje;
    const falhasHoje = (L.bruto.historico || []).filter(function (h) { return (h.data || '').slice(0, 10) === hoje && h.resultado === 'falha'; }).length;
    const dias = e.ultimaExecucao ? diasEntre(e.ultimaExecucao, hoje) : null;
    if (dias === null || dias > 2) return { classe: 'erro', texto: 'Parada desde ' + (e.ultimaExecucao ? fmtData(e.ultimaExecucao) : '—') };
    if (falhasHoje) return { classe: 'alerta', texto: plural(falhasHoje, 'falha hoje', 'falhas hoje') };
    return { classe: 'ok', texto: 'Funcionando' };
  }

  /* ---------------- desenho ---------------- */
  function rota() {
    const h = (location.hash || '#/').slice(2).split('/').map(decodeURIComponent);
    return { robo: h[0] || '', tipo: h[1] || '', id: h[2] || '', extra: h[3] || '' };
  }

  function topo(migalhas) {
    const quando = estado.carregando ? 'Atualizando…' : (estado.ultimaCarga ? 'Atualizado às ' + estado.ultimaCarga.toTimeString().slice(0, 5) : '');
    return '<header class="topo"><div class="topo-in">' +
      '<a class="marca" href="#/"><span class="marca-logo">W</span><span class="marca-txt">' + esc(CFG.titulo) + '</span></a>' +
      (migalhas && migalhas.length ? '<nav class="migalha">' + migalhas.map(function (m) {
        return '<span>/</span>' + (m.href ? '<a href="' + m.href + '">' + esc(m.t) + '</a>' : '<span>' + esc(m.t) + '</span>');
      }).join('') + '</nav>' : '') +
      '<div class="topo-acoes"><span class="atualizado">' + esc(quando) + '</span>' +
      '<button class="btn btn-icone" data-acao="atualizar" title="Atualizar" ' + (estado.carregando ? 'disabled' : '') + '>↻</button>' +
      '<button class="btn" data-acao="sair">Sair</button></div>' +
      '</div></header>';
  }

  function desenhar() {
    if (!estado.senha) return telaLogin(estado.msgLogin);
    const r = rota();
    let html;
    if (!r.robo) html = telaHub();
    else if (r.robo === 'lia' && r.tipo === 'dr') html = telaDoutor(r.id, r.extra);
    else if (r.robo === 'lia' && r.tipo === 'r') html = telaReuniao(r.id);
    else if (r.robo === 'lia') html = telaLia();
    else html = topo([{ t: 'Não encontrado' }]) + '<main class="pagina"><div class="vazio">Página não encontrada. <a href="#/">Voltar</a></div></main>';
    const y = window.scrollY;
    app.innerHTML = html;
    if (desenhar._rota === location.hash) window.scrollTo(0, y); else window.scrollTo(0, 0);
    desenhar._rota = location.hash;
    ligarEventos();
  }

  function telaLogin(msg) {
    app.innerHTML = '<div class="login"><form class="cartao login-caixa" id="form-login">' +
      '<div class="marca-logo">W</div><h1>' + esc(CFG.titulo) + '</h1><p>Painel dos robôs · acesso restrito</p>' +
      '<input id="senha" type="password" inputmode="numeric" autocomplete="current-password" placeholder="••••••" aria-label="Senha" autofocus>' +
      '<button class="btn btn-primario" type="submit">Entrar</button>' +
      '<div class="login-erro" id="login-erro">' + esc(msg) + '</div></form></div>';
    document.getElementById('form-login').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      const campo = document.getElementById('senha');
      const erro = document.getElementById('login-erro');
      const botao = ev.target.querySelector('button');
      const s = campo.value.trim();
      if (!s) return;
      const robo = robosAtivos()[0];
      if (!robo) { erro.textContent = 'Nenhum robô configurado ainda (config.js).'; return; }
      botao.disabled = true; botao.textContent = 'Conferindo…'; erro.textContent = '';
      estado.senha = s;
      try {
        const d = await chamar(robo, 'ping');
        if (d.ok) { salvarSenha(s); desenhar(); carregarTudo(); return; }
        erro.textContent = d.msg || 'Senha incorreta.';
      } catch (e) {
        erro.textContent = 'Sem conexão com a Lia agora (' + e.message + ').';
      }
      estado.senha = '';
      botao.disabled = false; botao.textContent = 'Entrar';
      campo.select();
    });
  }

  function avisoErro(id) {
    return estado.erros[id] ? '<div class="aviso erro">' + esc(estado.erros[id]) + '</div>' : '';
  }
  function esperando(id) {
    if (estado.dados[id]) return '';
    if (estado.erros[id]) return avisoErro(id);
    return '<div class="cartao vazio">Buscando dados…</div>';
  }

  /* ----- Hub ----- */
  function telaHub() {
    const cards = CFG.robos.map(function (robo) {
      const ativo = robo.api && !/COLE_AQUI/.test(robo.api);
      const L = estado.dados[robo.id];
      let status = '<span class="status neutro">' + (ativo ? 'Carregando' : 'Em breve') + '</span>';
      let numeros = '';
      if (estado.erros[robo.id]) status = '<span class="status erro">Sem conexão</span>';
      if (L && robo.id === 'lia') {
        const s = saudeLia(L), m = metricas(L);
        status = '<span class="status ' + s.classe + '">' + esc(s.texto) + '</span>';
        numeros = '<div class="robo-numeros">' +
          '<div><b>' + m.reunioes7 + '</b><span>reuniões · 7 dias</span></div>' +
          '<div><b>' + m.doutores + '</b><span>doutores</span></div>' +
          '<div><b>' + m.prox7 + '</b><span>follow-ups · 7 dias</span></div></div>';
      }
      const corpo = '<div class="robo-topo"><div class="robo-avatar" style="background:' + esc(robo.cor || '#0f766e') + '">' + esc(robo.nome[0]) + '</div>' +
        '<div style="min-width:0"><div class="robo-nome">' + esc(robo.nome) + '</div><div class="robo-papel">' + esc(robo.papel || '') + '</div></div>' +
        '<div style="margin-left:auto">' + status + '</div></div>' + numeros;
      return ativo
        ? '<a class="cartao robo" href="#/' + esc(robo.id) + '">' + corpo + '</a>'
        : '<div class="cartao robo inativo">' + corpo + '</div>';
    }).join('');
    return topo() + '<main class="pagina">' +
      '<div class="cabeca"><div><h1>' + saudacao() + ', ' + esc((CFG.dono || '').split(' ')[0]) + '</h1>' +
      '<p>O que os robôs estão fazendo por você.</p></div></div>' +
      '<div class="robos">' + cards + '</div></main>';
  }
  function saudacao() {
    const h = new Date().getHours();
    return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  }

  /* ----- Lia ----- */
  function telaLia() {
    const L = estado.dados.lia;
    const mig = [{ t: 'Lia' }];
    if (!L) return topo(mig) + '<main class="pagina">' + esperando('lia') + '</main>';
    const m = metricas(L), s = saudeLia(L);
    const f = estado.filtro;

    let drs = L.doutores.filter(function (d) {
      if (f.tipo === 'prospect' && d.status !== 'prospect') return false;
      if (f.tipo === 'cliente' && d.status !== 'cliente') return false;
      if (f.tipo === 'pendente' && !(d.proxima || d.crmProblema)) return false;
      if (f.busca && semAcento(d.nome).toLowerCase().indexOf(semAcento(f.busca).toLowerCase()) < 0) return false;
      return true;
    });
    drs.sort(function (a, b) {
      if (f.ordem === 'pendencia') return ((a.proxima && a.proxima.data) || '9').localeCompare((b.proxima && b.proxima.data) || '9');
      if (f.ordem === 'nome') return semAcento(a.nome.replace(/^dra?\.\s*/i, '')).localeCompare(semAcento(b.nome.replace(/^dra?\.\s*/i, '')));
      return (b.ultima.data || '').localeCompare(a.ultima.data || '');
    });

    const kpis = '<div class="kpis">' +
      kpi('Reuniões · 7 dias', m.reunioes7, plural(m.clientes7, 'com cliente', 'com clientes')) +
      kpi('Appts no mês', m.apptsMes, plural(m.reunioesMes, 'reunião no total', 'reuniões no total')) +
      kpi('Doutores', m.doutores, m.prospects + ' prospects · ' + m.clientes + ' clientes') +
      kpi('Follow-ups · 7 dias', m.prox7, m.atrasadas ? plural(m.atrasadas, 'atrasado', 'atrasados') : 'nada atrasado', m.atrasadas > 0) +
      kpi('CRM a resolver', m.crmAberto, 'reuniões sem registro ok', m.crmAberto > 0) +
      '</div>';

    const filtros = '<div class="filtros">' +
      '<div class="seg" role="tablist">' + [['todos', 'Todos'], ['prospect', 'Prospects'], ['cliente', 'Clientes'], ['pendente', 'Com pendência']].map(function (o) {
        return '<button data-filtro="' + o[0] + '" class="' + (f.tipo === o[0] ? 'ativo' : '') + '">' + o[1] + '</button>';
      }).join('') + '</div>' +
      '<input class="busca" id="busca" type="search" placeholder="Buscar doutor…" value="' + esc(f.busca) + '">' +
      '<select class="busca" id="ordem">' + [['recente', 'Última reunião'], ['pendencia', 'Próxima pendência'], ['nome', 'Nome']].map(function (o) {
        return '<option value="' + o[0] + '"' + (f.ordem === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
      }).join('') + '</select></div>';

    const cards = drs.length ? '<div class="drs">' + drs.map(cardDoutor).join('') + '</div>'
      : '<div class="cartao vazio">Nenhum doutor com esse filtro.</div>';

    return topo(mig) + '<main class="pagina">' + avisoErro('lia') +
      '<div class="cabeca"><div><h1>Lia</h1><p>Assistente comercial da Leticia · reuniões, resumos, agenda e CRM</p></div>' +
      '<span class="status ' + s.classe + '">' + esc(s.texto) + '</span></div>' +
      kpis +
      '<section class="secao"><div class="secao-titulo"><h2>Doutores</h2><span class="sub">' + plural(drs.length, 'doutor', 'doutores') + '</span></div>' +
      '<div style="margin-bottom:12px">' + filtros + '</div>' + cards + '</section>' +
      '<section class="secao duas-col">' +
      '<div><div class="secao-titulo"><h2>Agenda e pendências</h2><span class="sub">atrasadas e próximos 14 dias</span></div>' + blocoAgenda(L) + '</div>' +
      '<div><div class="secao-titulo"><h2>Status no CRM</h2><span class="sub">reuniões com clientes</span></div>' + blocoCrm(L) +
      '<div class="secao-titulo" style="margin-top:20px"><h2>Atividade recente</h2></div>' + blocoAtividade(L) + '</div>' +
      '</section>' +
      '<section class="secao"><div class="secao-titulo"><h2>Reuniões</h2><span class="sub">últimas 30</span></div>' + tabelaReunioes(L) + '</section>' +
      '</main>';
  }

  function kpi(rotulo, valor, detalhe, destaque) {
    return '<div class="cartao kpi' + (destaque ? ' destaque' : '') + '"><div class="kpi-rotulo">' + esc(rotulo) + '</div>' +
      '<div class="kpi-valor">' + esc(valor) + '</div><div class="kpi-detalhe">' + esc(detalhe) + '</div></div>';
  }

  function cardDoutor(d) {
    const p = d.proxima;
    const pend = p
      ? '<span class="dr-pend' + (d.atrasada ? ' atrasada' : '') + '">' + esc(p.acao) + (p.data ? ' <span style="white-space:nowrap">· ' + esc(fmtData(p.data)) + (d.atrasada ? ' (atrasada)' : '') + '</span>' : '') + '</span>'
      : '<span class="r">Nenhuma</span>';
    const etqs = [];
    if (d.crmProblema) etqs.push('<span class="etq ' + (d.crmProblema === 'erro' ? 'erro' : 'alerta') + '">CRM: ' + esc(d.crmProblema) + '</span>');
    else if (d.semCrm) etqs.push('<span class="etq neutro">Sem registro no CRM</span>');
    if (d.ultima.stTranscricao && d.ultima.stTranscricao !== 'ok') etqs.push('<span class="etq neutro">Sem transcrição</span>');
    return '<a class="cartao dr" href="#/lia/dr/' + encodeURIComponent(d.chave) + '">' +
      '<div class="dr-topo"><div class="dr-ini ' + d.status + '">' + esc(iniciais(d.nome)) + '</div>' +
      '<div style="min-width:0;flex:1"><div class="dr-nome">' + esc(d.nome) + '</div>' +
      '<div class="dr-sub">' + plural(d.reunioes.length, 'reunião', 'reuniões') + '</div></div>' +
      '<span class="etq ' + d.status + '">' + (d.status === 'cliente' ? 'Cliente' : 'Prospect') + '</span></div>' +
      '<div class="dr-linhas">' +
      '<div class="dr-linha"><span class="r">Última reunião</span><span>' + esc(fmtData(d.ultima.data)) + ' <span class="r">· ' + esc(relativo(d.ultima.data)) + '</span></span></div>' +
      '<div class="dr-linha"><span class="r">Pendência</span>' + pend + '</div>' +
      '</div>' +
      (etqs.length ? '<div class="dr-rodape">' + etqs.join('') + '</div>' : '') +
      '</a>';
  }

  function blocoAgenda(L) {
    const hoje = L.hoje;
    const itens = L.agenda.filter(function (a) {
      if (!a.data) return a.status === 'tarefa';
      const n = diasEntre(hoje, a.data);
      return n !== null && n >= -21 && n <= 14;
    }).slice(0, 25);
    if (!itens.length) return '<div class="cartao vazio">Nada agendado para os próximos 14 dias.</div>';
    return '<div class="cartao lista">' + itens.map(function (a) {
      const atras = a.data && a.data < hoje;
      const link = a.dr ? '#/lia/dr/' + encodeURIComponent(a.dr) : a.reuniao ? '#/lia/r/' + encodeURIComponent(a.reuniao) : '';
      const quem = link ? '<a class="quem" href="' + link + '">' + esc(a.quem) + '</a>' : '<span class="quem">' + esc(a.quem) + '</span>';
      const etq = a.status === 'interna' ? '<span class="etq neutro">Interna</span>'
        : a.status === 'tarefa' ? '<span class="etq neutro">Tarefa</span>'
        : '<span class="etq ' + a.status + '">' + (a.status === 'cliente' ? 'Cliente' : 'Prospect') + '</span>';
      return '<div class="item"><div class="quando' + (atras ? ' atrasada' : '') + '">' +
        (a.data ? esc(diaSemana(a.data)) + ' ' + esc(fmtData(a.data)) + (a.hora ? '<br>' + esc(a.hora) : '') : 'sem prazo') + '</div>' +
        '<div>' + quem + '<div class="oque">' + esc(a.acao) + (a.estimada ? ' <span title="Sem data combinada: usei a data de retorno">*</span>' : '') + '</div></div>' +
        '<div>' + etq + '</div></div>';
    }).join('') + '</div>';
  }

  function blocoCrm(L) {
    const ext = L.reunioes.filter(function (r) { return !ehInterna(r); });
    const cont = {};
    ext.forEach(function (r) { const k = r.stCrm || 'sem registro'; cont[k] = (cont[k] || 0) + 1; });
    const chaves = Object.keys(cont).sort(function (a, b) { return cont[b] - cont[a]; });
    if (!chaves.length) return '<div class="cartao vazio">Sem dados.</div>';
    const max = Math.max.apply(null, chaves.map(function (k) { return cont[k]; }));
    return '<div class="cartao barras">' + chaves.map(function (k) {
      const cor = CRM_OK.indexOf(k) >= 0 ? 'var(--accent)' : k === 'erro' ? 'var(--danger)' : k === 'sem registro' ? 'var(--faint)' : 'var(--warn)';
      return '<div class="barra"><span>' + esc(k) + '</span><div class="trilho"><div class="cheio" style="width:' + Math.max(4, cont[k] / max * 100) + '%;background:' + cor + '"></div></div><span class="n">' + cont[k] + '</span></div>';
    }).join('') + '</div>';
  }

  function blocoAtividade(L) {
    const e = L.bruto.estado || {};
    const h = (L.bruto.historico || []).slice(-8).reverse();
    const retro = e.retro && e.retro.cursor
      ? '<div class="item"><div class="quando">Retroativo</div><div><span class="quem">' + (e.retro.pausado ? 'Pausado' : 'Em andamento') + '</span><div class="oque">Processado até ' + esc(fmtData(e.retro.cursor)) + (e.retro.fim ? ' de ' + esc(fmtData(e.retro.fim)) : '') + '</div></div><div></div></div>'
      : '';
    if (!h.length && !retro) return '<div class="cartao vazio">Sem atividade registrada.</div>';
    return '<div class="cartao lista">' + retro + h.map(function (x) {
      const cls = x.resultado === 'falha' ? 'erro' : x.resultado === 'sucesso' ? 'ok' : 'neutro';
      return '<div class="item"><div class="quando">' + esc(fmtData(x.data, true)) + '</div>' +
        '<div><span class="quem">' + esc(x.registro || x.operacao) + '</span><div class="oque">' + esc(x.operacao.replace(/_/g, ' ')) + (x.erro ? ' — ' + esc(x.erro) : '') + '</div></div>' +
        '<div><span class="status ' + cls + '">' + esc(x.resultado || '—') + '</span></div></div>';
    }).join('') + '</div>';
  }

  function tabelaReunioes(L) {
    const linhas = L.reunioes.slice(0, 30).map(function (r) {
      const href = r._dr ? '#/lia/dr/' + encodeURIComponent(r._dr) + '/' + encodeURIComponent(r.id) : '#/lia/r/' + encodeURIComponent(r.id);
      const crm = ehInterna(r) ? '<span class="r">—</span>' : etqCrm(r.stCrm);
      return '<tr class="clicavel" data-href="' + href + '"><td class="num">' + esc(fmtData(r.data, true)) + '</td>' +
        '<td>' + esc(r.titulo) + (r.profissional ? '<div class="r" style="color:var(--muted);font-size:12.5px">' + esc(r.profissional) + '</div>' : '') + '</td>' +
        '<td>' + etqTipo(r) + '</td>' +
        '<td>' + (r.stTranscricao === 'ok' ? '<span class="etq cliente">ok</span>' : '<span class="etq neutro">' + esc(r.stTranscricao || '—') + '</span>') + '</td>' +
        '<td>' + crm + '</td></tr>';
    }).join('');
    return '<div class="cartao tabela-wrap"><table><thead><tr><th>Data</th><th>Reunião</th><th>Tipo</th><th>Transcrição</th><th>CRM</th></tr></thead><tbody>' + linhas + '</tbody></table></div>';
  }
  function etqTipo(r) {
    if (ehInterna(r)) return '<span class="etq neutro">Interna</span>';
    if (ehAppt(r)) return '<span class="etq prospect">Appt</span>';
    return '<span class="etq cliente">Cliente</span>';
  }
  function etqCrm(st) {
    if (!st) return '<span class="etq neutro">sem registro</span>';
    if (CRM_OK.indexOf(st) >= 0) return '<span class="etq cliente">' + esc(st) + '</span>';
    return '<span class="etq ' + (st === 'erro' ? 'erro' : 'alerta') + '">' + esc(st) + '</span>';
  }

  /* ----- Detalhe do doutor ----- */
  function telaDoutor(chave, reuniaoId) {
    const L = estado.dados.lia;
    if (!L) return topo([{ t: 'Lia', href: '#/lia' }, { t: '…' }]) + '<main class="pagina">' + esperando('lia') + '</main>';
    const d = L.porChave[chave];
    if (!d) return topo([{ t: 'Lia', href: '#/lia' }]) + '<main class="pagina"><div class="cartao vazio">Doutor não encontrado. <a href="#/lia">Voltar</a></div></main>';
    const sel = d.reunioes.find(function (r) { return r.id === reuniaoId; }) || d.ultima;
    const hoje = L.hoje;

    const acoes = [];
    if (d.linkCrm) acoes.push('<a class="btn" href="' + esc(d.linkCrm) + '" target="_blank" rel="noopener">Abrir no CRM ↗</a>');
    if (sel.doc) acoes.push('<a class="btn" href="' + esc(sel.doc) + '" target="_blank" rel="noopener">Transcrição ↗</a>');

    const pend = d.pendencias.length ? '<div class="pend-lista">' + d.pendencias.map(function (p) {
      const atras = p.data && p.data < hoje;
      return '<div class="pend' + (atras ? ' atrasada' : '') + '"><span class="bola"></span><div>' + esc(p.acao) +
        (p.data ? '<div class="d">' + esc(diaSemana(p.data)) + ' ' + esc(fmtData(p.data)) + (p.hora ? ' às ' + esc(p.hora) : '') + ' · ' + esc(relativo(p.data)) +
          (p.estimada ? ' · data de retorno' : p.combinado ? ' · combinado' : '') + '</div>' : '') + '</div></div>';
    }).join('') + '</div>' : '<div style="color:var(--muted);font-size:13.5px">Nenhuma pendência na última reunião.</div>';

    const linha = '<div class="linha-tempo">' + d.reunioes.map(function (r) {
      return '<a class="lt-item' + (r === sel ? ' atual' : '') + '" href="#/lia/dr/' + encodeURIComponent(d.chave) + '/' + encodeURIComponent(r.id) + '" style="color:inherit;text-decoration:none">' +
        '<span class="ponto"></span><div><div class="t">' + esc(fmtData(r.data, true)) + ' · ' + (ehAppt(r) ? 'Appt' : 'Cliente') + '</div><div class="s">' + esc(r.titulo) + '</div></div></a>';
    }).join('') + '</div>';

    const dados = '<div class="dados-chave">' +
      '<div><span>Status CRM</span><span>' + etqCrm(sel.stCrm) + '</span></div>' +
      '<div><span>Transcrição</span><span>' + esc(sel.stTranscricao || '—') + '</span></div>' +
      '<div><span>Agenda</span><span>' + esc(sel.stAgenda || '—') + '</span></div>' +
      (sel.eventos ? '<div><span>Eventos criados</span><span>' + esc(sel.eventos) + '</span></div>' : '') +
      (sel.linkFollowupCrm ? '<div><span>Follow-up no CRM</span><span><a href="' + esc(sel.linkFollowupCrm) + '" target="_blank" rel="noopener">abrir ↗</a></span></div>' : '') +
      '</div>';

    return topo([{ t: 'Lia', href: '#/lia' }, { t: d.nome }]) + '<main class="pagina">' +
      '<div class="cartao dr-cabeca"><div class="dr-ini ' + d.status + '">' + esc(iniciais(d.nome)) + '</div>' +
      '<div style="min-width:0"><h1>' + esc(d.nome) + '</h1>' +
      '<div class="meta"><span class="etq ' + d.status + '">' + (d.status === 'cliente' ? 'Cliente' : 'Prospect') + '</span>' +
      '<span>Última reunião ' + esc(fmtData(d.ultima.data)) + ' · ' + esc(relativo(d.ultima.data)) + '</span>' +
      '<span>' + plural(d.reunioes.length, 'reunião', 'reuniões') + '</span></div></div>' +
      '<div class="acoes">' + acoes.join('') + '</div></div>' +
      '<div class="grade-dr">' +
      '<div class="cartao bloco"><h3>' + (sel === d.ultima ? 'Resumo da última reunião' : 'Resumo · ' + esc(fmtData(sel.data))) + '</h3>' +
      '<div class="resumo">' + renderResumo(sel.resumo) + '</div></div>' +
      '<div class="painel-lateral">' +
      '<div class="cartao bloco"><h3>Pendências</h3>' + pend + '</div>' +
      '<div class="cartao bloco"><h3>Reuniões</h3>' + linha + '</div>' +
      '<div class="cartao bloco"><h3>Registro</h3>' + dados + '</div>' +
      '</div></div></main>';
  }

  /* ----- Reunião interna ----- */
  function telaReuniao(id) {
    const L = estado.dados.lia;
    if (!L) return topo([{ t: 'Lia', href: '#/lia' }, { t: '…' }]) + '<main class="pagina">' + esperando('lia') + '</main>';
    const r = L.reunioes.find(function (x) { return x.id === id; });
    if (!r) return topo([{ t: 'Lia', href: '#/lia' }]) + '<main class="pagina"><div class="cartao vazio">Reunião não encontrada.</div></main>';
    const pend = pendenciasDe(r);
    return topo([{ t: 'Lia', href: '#/lia' }, { t: r.titulo }]) + '<main class="pagina">' +
      '<div class="cartao dr-cabeca"><div style="min-width:0"><h1>' + esc(r.titulo) + '</h1>' +
      '<div class="meta">' + etqTipo(r) + '<span>' + esc(fmtData(r.data, true)) + ' · ' + esc(relativo(r.data)) + '</span></div></div>' +
      '<div class="acoes">' + (r.doc ? '<a class="btn" href="' + esc(r.doc) + '" target="_blank" rel="noopener">Transcrição ↗</a>' : '') + '</div></div>' +
      '<div class="grade-dr"><div class="cartao bloco"><h3>Resumo</h3><div class="resumo">' + renderResumo(r.resumo) + '</div></div>' +
      '<div class="painel-lateral"><div class="cartao bloco"><h3>Follow-ups</h3>' +
      (pend.length ? '<div class="pend-lista">' + pend.map(function (p) {
        return '<div class="pend"><span class="bola"></span><div>' + esc(p.acao) + (p.data ? '<div class="d">' + esc(fmtData(p.data)) + '</div>' : '') + '</div></div>';
      }).join('') + '</div>' : '<div style="color:var(--muted);font-size:13.5px">Nenhum.</div>') +
      '</div></div></div></main>';
  }

  /* Transforma o texto do resumo em HTML legível (títulos, listas, campos). */
  function renderResumo(txt) {
    if (!txt) return '<p style="color:var(--muted)">Ainda sem resumo para esta reunião.</p>';
    const linhas = String(txt).replace(/\r/g, '').split('\n');
    let html = '', lista = false, primeira = true;
    function fecha() { if (lista) { html += '</ul>'; lista = false; } }
    linhas.forEach(function (bruta) {
      const l = bruta.trim();
      if (!l) { fecha(); return; }
      if (primeira) { primeira = false; html += '<div class="titulo-resumo">' + esc(l) + '</div>'; return; }
      const item = l.match(/^[-•*–]\s+(.*)$/) || l.match(/^\d+[.)]\s+(.*)$/);
      if (item) { if (!lista) { html += '<ul>'; lista = true; } html += '<li>' + campo(item[1]) + '</li>'; return; }
      fecha();
      const letras = l.replace(/[^A-Za-zÀ-ÿ]/g, '');
      const maiusc = l.replace(/[^A-ZÀ-Þ]/g, '').length;
      if ((letras.length >= 4 && maiusc / letras.length > 0.8 && l.length < 90) || (/:$/.test(l) && l.length < 70)) {
        html += '<h4>' + esc(l.replace(/:$/, '')) + '</h4>'; return;
      }
      html += '<p>' + campo(l) + '</p>';
    });
    fecha();
    return html;
  }
  function campo(l) {
    const m = l.match(/^([^:]{2,32}):\s+(.+)$/);
    return m ? '<span class="campo"><b>' + esc(m[1]) + ':</b> ' + esc(m[2]) + '</span>' : esc(l);
  }

  /* ---------------- eventos ---------------- */
  function ligarEventos() {
    app.querySelectorAll('[data-acao="atualizar"]').forEach(function (b) { b.onclick = carregarTudo; });
    app.querySelectorAll('[data-acao="sair"]').forEach(function (b) { b.onclick = function () { sair(''); }; });
    app.querySelectorAll('[data-filtro]').forEach(function (b) {
      b.onclick = function () { estado.filtro.tipo = b.getAttribute('data-filtro'); desenhar(); };
    });
    const busca = document.getElementById('busca');
    if (busca) {
      busca.oninput = function () {
        estado.filtro.busca = busca.value;
        const pos = busca.selectionStart;
        desenhar();
        const nb = document.getElementById('busca');
        nb.focus(); try { nb.setSelectionRange(pos, pos); } catch (e) {}
      };
    }
    const ordem = document.getElementById('ordem');
    if (ordem) ordem.onchange = function () { estado.filtro.ordem = ordem.value; desenhar(); };
    app.querySelectorAll('tr[data-href]').forEach(function (tr) {
      tr.onclick = function () { location.hash = tr.getAttribute('data-href'); };
    });
  }

  window.addEventListener('hashchange', desenhar);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && estado.senha && estado.ultimaCarga && Date.now() - estado.ultimaCarga > ATUALIZA_MS) carregarTudo();
  });
  setInterval(function () { if (!document.hidden && estado.senha) carregarTudo(); }, ATUALIZA_MS);

  desenhar();
  if (estado.senha) carregarTudo();
})();
