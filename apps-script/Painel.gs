/**
 * PAINEL — API somente leitura para o site Workspace Crisalix (GitHub Pages).
 * Arquivo separado do Código.gs: não altera nenhuma rotina da Lia.
 *
 * Instalação (uma vez):
 *  1. Propriedades do script: PAINEL_SENHA = senha do painel.
 *  2. Implantar > Nova implantação > App da Web
 *     Executar como: Eu | Quem pode acessar: Qualquer pessoa.
 *  3. Copiar a URL /exec para config.js do site.
 *
 * O site envia POST (text/plain) com {"senha": "...", "acao": "dados" | "ping"}.
 * Sem a senha certa não sai nenhum dado. 10 erros seguidos bloqueiam por 1 hora.
 */

function doGet() {
  return painelJson_({ ok: false, erro: 'metodo', msg: 'API do painel da Lia. Use o site Workspace Crisalix.' });
}

function doPost(e) {
  var req = {};
  try { req = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { req = {}; }

  const cache = CacheService.getScriptCache();
  const falhas = Number(cache.get('PAINEL_FALHAS') || 0);
  if (falhas >= 10) return painelJson_({ ok: false, erro: 'bloqueado', msg: 'Muitas tentativas erradas. Tente de novo em 1 hora.' });

  const senha = PROPS.getProperty('PAINEL_SENHA');
  if (!senha || String(req.senha || '') !== senha) {
    cache.put('PAINEL_FALHAS', String(falhas + 1), 3600);
    return painelJson_({ ok: false, erro: 'senha', msg: 'Senha incorreta.' });
  }
  cache.remove('PAINEL_FALHAS');

  if (req.acao === 'ping') return painelJson_({ ok: true, robo: PROPS.getProperty('NOME_ASSISTENTE') || 'Lia' });
  if (req.acao === 'pendencia' || req.acao === 'crm') {
    try { return painelJson_(painelAcao_(req)); }
    catch (err) { return painelJson_({ ok: false, erro: 'interno', msg: String(err && err.message || err) }); }
  }
  try {
    return painelJson_(painelDados_());
  } catch (err) {
    return painelJson_({ ok: false, erro: 'interno', msg: String(err && err.message || err) });
  }
}

function painelJson_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Lê uma aba como lista de objetos {cabeçalho: valor}. */
function painelAba_(ss, nome) {
  const sh = ss.getSheetByName(nome);
  if (!sh || sh.getLastRow() < 2) return [];
  const vals = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  const cab = vals[0].map(String);
  return vals.slice(1).map(function (l) {
    const o = {};
    cab.forEach(function (c, i) { if (c) o[c] = l[i]; });
    return o;
  });
}

/** Converte Date ou "dd/MM/yyyy HH:mm" / "yyyy-MM-dd" para "yyyy-MM-ddTHH:mm" (ou "yyyy-MM-dd"). */
function painelData_(v) {
  if (!v) return '';
  if (v instanceof Date) return Utilities.formatDate(v, TZ, "yyyy-MM-dd'T'HH:mm");
  const s = String(v).trim();
  var m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ ,]+(?:às\s*)?(\d{1,2})[:h](\d{2})?)?/);
  if (m) return m[3] + '-' + m[2] + '-' + m[1] + (m[4] ? 'T' + ('0' + m[4]).slice(-2) + ':' + (m[5] || '00') : '');
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3] + (m[4] ? 'T' + m[4] + ':' + m[5] : '');
  return '';
}

function painelTexto_(v) { return v === null || v === undefined ? '' : String(v); }

function painelDados_() {
  const ss = SpreadsheetApp.openById(prop_('SHEET_ID'));
  const t = painelTexto_;

  const reunioes = painelAba_(ss, 'Reuniões').map(function (r) {
    var fups = [];
    try { fups = JSON.parse(t(r['Follow-ups JSON']) || '[]'); } catch (err) { fups = []; }
    const doc = t(r['ID Doc Gemini']);
    return {
      id: t(r['ID Reunião']),
      data: painelData_(r['Data']),
      titulo: t(r['Título']),
      tipo: t(r['Tipo']),
      profissional: t(r['Profissional']),
      resumo: t(r['Resumo']),
      followup: t(r['Follow-up']),
      retorno: painelData_(r['Data Retorno']),
      followups: Array.isArray(fups) ? fups : [],
      stTranscricao: t(r['Status Transcrição']),
      stResumo: t(r['Status Resumo']),
      stAgenda: t(r['Status Agenda']),
      stCrm: t(r['Status CRM']),
      linkCrm: t(r['Link CRM']),
      linkFollowupCrm: t(r['Link Follow-up CRM']),
      eventos: t(r['Eventos Criados']),
      doc: doc ? 'https://docs.google.com/document/d/' + doc + '/edit' : '',
      atualizado: painelData_(r['Atualizado em'])
    };
  }).filter(function (r) { return r.id; });

  const tarefas = painelAba_(ss, 'Tarefas').map(function (r) {
    return {
      id: t(r['ID']), descricao: t(r['Descrição']), criada: painelData_(r['Criada em']),
      prazo: painelData_(r['Prazo']), status: t(r['Status']), origem: t(r['Origem']), resultado: t(r['Resultado'])
    };
  }).filter(function (r) { return r.descricao; });

  const historico = painelAba_(ss, 'Histórico').slice(-300).map(function (r) {
    return {
      data: painelData_(r['Data/Hora']), operacao: t(r['Operação']), registro: t(r['Registro']),
      resultado: t(r['Resultado']), erro: t(r['Erro']).slice(0, 300), confirmacao: t(r['Confirmação'])
    };
  });

  // Agenda do Google: hoje + 7 dias (mesmos filtros da Lia: sem recusadas, sem foco/ausência)
  var agenda = [], agendaErro = '';
  try {
    var ini = new Date(); ini.setHours(0, 0, 0, 0);
    var fim = new Date(ini.getTime() + 8 * 864e5);
    var res = Calendar.Events.list('primary', { timeMin: ini.toISOString(), timeMax: fim.toISOString(), singleEvents: true, orderBy: 'startTime', maxResults: 250 });
    (res.items || []).forEach(function (ev) {
      if (ev.status === 'cancelled' || (ev.eventType && ev.eventType !== 'default')) return;
      var eu = (ev.attendees || []).filter(function (a) { return a.self; })[0];
      if (eu && eu.responseStatus === 'declined') return;
      var lia = !!(ev.extendedProperties && ev.extendedProperties.private && ev.extendedProperties.private.crisId);
      var tipo = '';
      try { tipo = lia ? 'Lembrete' : classificar_(ev, ''); } catch (e2) { tipo = ''; }
      var diaInteiro = !(ev.start && ev.start.dateTime);
      agenda.push({
        titulo: ev.summary || '(sem título)',
        inicio: diaInteiro ? ((ev.start && ev.start.date) || '') : painelData_(new Date(ev.start.dateTime)),
        fim: diaInteiro ? '' : painelData_(new Date(ev.end.dateTime)),
        id: ev.id || '', diaInteiro: diaInteiro, tipo: tipo, lia: lia,
        meet: !!(ev.hangoutLink || ev.conferenceData), link: ev.htmlLink || ''
      });
    });
  } catch (err) { agendaErro = String(err && err.message || err); }

  const p = PROPS.getProperties();
  var gatilhos = [];
  try { gatilhos = ScriptApp.getProjectTriggers().map(function (g) { return g.getHandlerFunction(); }); } catch (err) {}

  return {
    ok: true,
    robo: p.NOME_ASSISTENTE || 'Lia',
    geradoEm: Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm"),
    estado: {
      ultimaExecucao: p.ULTIMA_EXECUCAO || '',
      whatsappAtivo: p.WHATSAPP_ATIVO !== 'nao',
      retro: { cursor: painelData_(p.RETRO_CURSOR), fim: painelData_(p.RETRO_FIM), pausado: p.RETRO_PAUSADO === 'sim' },
      gatilhos: gatilhos
    },
    agenda: agenda,
    agendaErro: agendaErro,
    reunioes: reunioes,
    tarefas: tarefas,
    historico: historico
  };
}

/* =========================================================
   AÇÕES DO PAINEL (escrita): resolver pendências e corrigir CRM.
   Grava célula a célula (não reescreve a linha inteira) para não
   atrapalhar a rotina da Lia que possa estar rodando ao mesmo tempo.
   ========================================================= */
function painelAcao_(req) {
  var sh = SpreadsheetApp.openById(prop_('SHEET_ID')).getSheetByName('Reuniões');
  var cab = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  var col = function (n) { return cab.indexOf(n) + 1; };
  var ids = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 1).getValues();
  var linha = 0;
  for (var k = 0; k < ids.length; k++) { if (String(ids[k][0]) === String(req.reuniaoId)) { linha = k + 2; break; } }
  if (!linha) return { ok: false, erro: 'nao_encontrada', msg: 'Não achei essa reunião na planilha.' };
  var get = function (n) { return col(n) > 0 ? sh.getRange(linha, col(n)).getValue() : ''; };
  var set = function (n, v) { if (col(n) > 0) sh.getRange(linha, col(n)).setValue(v); };
  var titulo = String(get('Título'));
  var agoraTxt = Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy HH:mm');

  // ---- Corrigir CRM: libera para a Lia registrar de novo (com link do cadastro, se vier) ----
  if (req.acao === 'crm') {
    var link = String(req.link || '').trim();
    var m = link.match(/^https:\/\/manager\.crisalix\.com\/surgeons\/\d+/);
    if (link && !m) return { ok: false, erro: 'link', msg: 'O link precisa ser de um cadastro do CRM (manager.crisalix.com/surgeons/…).' };
    if (m) set('Link CRM', m[0]);
    set('Status CRM', 'liberado');
    set('Atualizado em', agoraTxt);
    registrar_('painel_crm', titulo, 'sucesso', '', m ? m[0] : 'liberado pelo painel');
    return { ok: true, msg: 'Combinado. A Lia registra no CRM na próxima rotina (12h, 16h ou 20h).' };
  }

  // ---- Pendência: concluir ou editar texto/data ----
  var fups = painelFollowups_(get('Follow-ups JSON'), get('Follow-up'));
  var i = Number(req.indice);
  if (!(i >= 0 && i < fups.length) || (req.atual && String(req.atual) !== String(fups[i].acao))) {
    return { ok: false, erro: 'mudou', msg: 'Essa pendência mudou desde que o painel carregou. Atualize e tente de novo.' };
  }
  var f = fups[i], agenda = '';
  if (req.op === 'concluir') {
    f.feito = true;
    f.feitoEm = Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm");
    agenda = painelApagarLembrete_(req.reuniaoId, i, f, fups);
    registrar_('painel_pendencia', titulo, 'sucesso', '', 'concluída: ' + f.acao);
  } else if (req.op === 'editar') {
    var novaAcao = String(req.novaAcao || '').trim();
    var novaData = String(req.novaData || '').trim();
    if (!novaAcao) return { ok: false, erro: 'texto', msg: 'Escreva o que precisa ser feito.' };
    if (novaData && !/^\d{4}-\d{2}-\d{2}$/.test(novaData)) return { ok: false, erro: 'data', msg: 'Data inválida.' };
    var mudou = novaAcao !== String(f.acao) || novaData !== String(f.data || '');
    f.acao = novaAcao;
    f.data = novaData;
    f.editadoEm = Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm");
    if (mudou) agenda = painelMoverLembrete_(sh, linha, req.reuniaoId, i, f, titulo, String(get('Tipo')), get('Data'));
    registrar_('painel_pendencia', titulo, 'sucesso', '', 'corrigida: ' + f.acao + (f.data ? ' (' + f.data + ')' : ''));
  } else {
    return { ok: false, erro: 'op', msg: 'Ação desconhecida.' };
  }

  set('Follow-ups JSON', JSON.stringify(fups));
  set('Follow-up', painelTextoFollowups_(fups));
  var datas = fups.filter(function (x) { return !x.feito && x.data; }).map(function (x) { return x.data; }).sort();
  set('Data Retorno', datas[0] || '');
  set('Atualizado em', agoraTxt);
  return { ok: true, msg: req.op === 'concluir' ? 'Pendência concluída.' : 'Pendência corrigida.', agenda: agenda };
}

/** Lista de follow-ups da linha: JSON; se vazio, monta a partir do texto (mesma leitura do painel). */
function painelFollowups_(json, texto) {
  var arr = [];
  try { arr = JSON.parse(String(json || '') || '[]'); } catch (e) { arr = []; }
  if (Array.isArray(arr) && arr.length) return arr;
  return String(texto || '').split(/\n+/).map(function (l) { return l.replace(/^[•\-*]\s*/, '').trim(); })
    .filter(function (l) { return l; }).map(function (l) {
      var m = l.match(/\((\d{4}-\d{2}-\d{2})/);
      return { acao: l.replace(/\s*\(\d{4}-\d{2}-\d{2}[^)]*\)\s*$/, ''), data: m ? m[1] : '', hora: '', combinado: /combinado/.test(l) };
    });
}

function painelTextoFollowups_(fups) {
  return fups.filter(function (f) { return f && f.acao && !f.feito; }).map(function (f) {
    return '• ' + f.acao + (f.data ? ' (' + f.data + (f.combinado ? ', combinado' : '') + ')' : '');
  }).join('\n');
}

function painelLembrete_(chave) {
  var r = Calendar.Events.list('primary', { privateExtendedProperty: 'crisId=' + chave, maxResults: 1 });
  return (r.items && r.items[0]) || null;
}

function painelCauda_(desc) {
  desc = String(desc || '');
  var p = desc.indexOf('\n\nOrigem:');
  return p >= 0 ? desc.slice(p) : '';
}

/** Concluiu: apaga o lembrete (o "sem data" só sai quando todas as sem data estiverem concluídas). */
function painelApagarLembrete_(rid, i, f, fups) {
  try {
    if (f.data) {
      var ev = painelLembrete_(rid + '#' + i);
      if (ev) { Calendar.Events.remove('primary', ev.id); return 'Lembrete apagado da agenda.'; }
      return '';
    }
    var ev2 = painelLembrete_(rid + '#semdata');
    if (!ev2) return '';
    var abertas = fups.filter(function (x) { return x && x.acao && !x.data && !x.feito; });
    if (!abertas.length) { Calendar.Events.remove('primary', ev2.id); return 'Lembrete apagado da agenda.'; }
    Calendar.Events.patch({ description: abertas.map(function (x) { return '• ' + x.acao; }).join('\n') + painelCauda_(ev2.description) }, 'primary', ev2.id);
    return 'Lembrete da agenda atualizado.';
  } catch (e) { return 'Não consegui mexer na agenda: ' + e.message; }
}

/** Corrigiu texto/data: move ou ajusta o lembrete; cria um se ainda não existir e a data for futura. */
function painelMoverLembrete_(sh, linha, rid, i, f, titulo, tipo, dataReuniao) {
  try {
    var ev = painelLembrete_(rid + '#' + i);
    var icone = tipo === 'Interna' ? '📝 ' : '📞 ';
    if (!f.data) {
      if (ev) { Calendar.Events.remove('primary', ev.id); return 'Lembrete removido (a pendência ficou sem data).'; }
      return '';
    }
    var hora = f.hora || (ev && ev.start && ev.start.dateTime ? Utilities.formatDate(new Date(ev.start.dateTime), TZ, 'HH:mm') : '10:00');
    var ini = Utilities.parseDate(f.data + ' ' + hora, TZ, 'yyyy-MM-dd HH:mm');
    var fim = new Date(ini.getTime() + 30 * 60000);
    if (ev) {
      var ic = (String(ev.summary || '').match(/^\S+\s/) || [icone])[0];
      Calendar.Events.patch({
        summary: ic + encurtar_(f.acao, 80),
        description: '• ' + f.acao + painelCauda_(ev.description),
        start: { dateTime: ini.toISOString(), timeZone: TZ },
        end: { dateTime: fim.toISOString(), timeZone: TZ }
      }, 'primary', ev.id);
      return 'Lembrete movido para ' + quando_(ini) + '.';
    }
    if (ini > new Date()) {
      var r = criarEvento_(rid + '#' + i, icone + encurtar_(f.acao, 80), ini, '• ' + f.acao,
        { reuniao: titulo, data: fmt_(dataReuniao), link: linkLinha_(sh, linha), busca: '' });
      return r.criado ? 'Lembrete criado na agenda: ' + r.texto + '.' : '';
    }
    return '';
  } catch (e) { return 'Não consegui mexer na agenda: ' + e.message; }
}
