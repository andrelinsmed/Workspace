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
  if (req.acao === 'pendencia' || req.acao === 'crm' || req.acao === 'comando') {
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

  // ---- Pendência: concluir ou editar texto/data (ou comando livre interpretado pela IA) ----
  var fups = painelFollowups_(get('Follow-ups JSON'), get('Follow-up'));
  if (req.acao === 'comando') return painelComando_(req, sh, linha, get, set, fups, titulo, agoraTxt);
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

/* =========================================================
   COMANDO LIVRE NUMA PENDÊNCIA ("o doutor não respondeu…")
   1) planejar: a IA lê o comando e devolve o que vai fazer (nada é gravado)
   2) executar: aplica o plano aprovado — follow-up no CRM, nova data/texto, concluir
   ========================================================= */
function painelComando_(req, sh, linha, get, set, fups, titulo, agoraTxt) {
  var i = Number(req.indice);
  if (!(i >= 0 && i < fups.length) || (req.atual && String(req.atual) !== String(fups[i].acao))) {
    return { ok: false, erro: 'mudou', msg: 'Essa pendência mudou desde que o painel carregou. Atualize e tente de novo.' };
  }
  var f = fups[i];
  var hoje = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  var diaSem = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][Number(Utilities.formatDate(new Date(), TZ, 'u')) % 7];

  if (req.op === 'planejar') {
    var comando = String(req.comando || '').trim();
    if (!comando) return { ok: false, erro: 'texto', msg: 'Escreva o que aconteceu ou o que a Lia deve fazer.' };
    var prompt =
      'Você ajuda Leticia Soares (Account Executive da Crisalix) a resolver uma pendência comercial.\n' +
      'Hoje é ' + diaSem + ', ' + hoje + '.\n' +
      'Reunião de origem: "' + titulo + '" com ' + (get('Profissional') || 'o cliente') + '.\n' +
      'Pendência: "' + f.acao + '"' + (f.data ? ' (prevista para ' + f.data + ')' : ' (sem data)') + '.\n' +
      'Comando da Leticia: "' + comando + '"\n\n' +
      'Decida o que fazer e responda SOMENTE em JSON com as chaves:\n' +
      '{"concluir": boolean, "novaAcao": string, "novaData": "AAAA-MM-DD" ou "", "followupCrm": null ou {"feedback": string, "proximoPasso": string}, "resumo": string}\n' +
      'Regras: concluir=true só se a pendência foi resolvida. Se o cliente não respondeu ou pediu para falar depois, mantenha a pendência com nova data ' +
      '(se a Leticia não disser a data, use 2 dias úteis a partir de hoje) e, se fizer sentido registrar a tentativa, preencha followupCrm. ' +
      'novaAcao: o texto atualizado da pendência (curto, verbo no infinitivo) ou "" para manter. ' +
      'followupCrm.feedback em primeira pessoa da Leticia (ex.: "Enviei mensagem para o Dr. X e ainda não tive retorno."), sem mencionar IA; proximoPasso curto. ' +
      'Não invente fatos. resumo: uma frase para a Leticia dizendo o que será feito.';
    var bruto = gemini_(prompt, true);
    var plano;
    try { plano = typeof bruto === 'string' ? JSON.parse(String(bruto).replace(/^```(?:json)?\s*|\s*```$/g, '')) : bruto; }
    catch (e) { return { ok: false, erro: 'ia', msg: 'Não entendi o comando. Tente escrever de outro jeito.' }; }
    return { ok: true, plano: painelPlanoLimpo_(plano, f) };
  }

  if (req.op === 'executar') {
    var p = painelPlanoLimpo_(req.plano || {}, f);
    var feito = [];
    // 1) follow-up no CRM (nota fixada, como o no-show)
    if (p.followupCrm) {
      var idCad = (String(req.linkCrm || get('Link CRM') || '').match(/surgeons\/(\d+)/) || [])[1];
      if (!idCad) return { ok: false, erro: 'crm', msg: 'Não sei qual é o cadastro desse doutor no CRM. Corrija o CRM primeiro (cole o link do cadastro).' };
      var alertaDia = p.novaData || f.data || Utilities.formatDate(new Date(Date.now() + 864e5), TZ, 'yyyy-MM-dd');
      var r = painelFollowupCrm_(idCad, p.followupCrm.feedback, p.followupCrm.proximoPasso, alertaDia);
      registrar_('crm_followup', titulo, 'sucesso', 'pelo painel', r);
      feito.push('Follow-up registrado no CRM.');
    }
    // 2) texto/data da pendência + lembrete na agenda
    var agenda = '';
    if (p.concluir) {
      f.feito = true;
      f.feitoEm = Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm");
      agenda = painelApagarLembrete_(req.reuniaoId, i, f, fups);
      feito.push('Pendência concluída.');
    } else if (p.novaAcao || p.novaData) {
      if (p.novaAcao) f.acao = p.novaAcao;
      if (p.novaData) f.data = p.novaData;
      f.editadoEm = Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm");
      agenda = painelMoverLembrete_(sh, linha, req.reuniaoId, i, f, titulo, String(get('Tipo')), get('Data'));
      feito.push('Pendência atualizada' + (p.novaData ? ' para ' + p.novaData.split('-').reverse().slice(0, 2).join('/') : '') + '.');
    }
    set('Follow-ups JSON', JSON.stringify(fups));
    set('Follow-up', painelTextoFollowups_(fups));
    var datas = fups.filter(function (x) { return !x.feito && x.data; }).map(function (x) { return x.data; }).sort();
    set('Data Retorno', datas[0] || '');
    set('Atualizado em', agoraTxt);
    registrar_('painel_comando', titulo, 'sucesso', '', p.resumo || feito.join(' '));
    return { ok: true, msg: feito.join(' ') || 'Nada para fazer.', agenda: agenda };
  }
  return { ok: false, erro: 'op', msg: 'Ação desconhecida.' };
}

function painelPlanoLimpo_(p, f) {
  var data = String(p.novaData || '');
  var fu = p.followupCrm && p.followupCrm.feedback ? { feedback: String(p.followupCrm.feedback).slice(0, 1500), proximoPasso: String(p.followupCrm.proximoPasso || '').slice(0, 300) } : null;
  return {
    concluir: p.concluir === true,
    novaAcao: String(p.novaAcao || '').trim() === String(f.acao) ? '' : String(p.novaAcao || '').trim().slice(0, 300),
    novaData: /^\d{4}-\d{2}-\d{2}$/.test(data) ? data : '',
    followupCrm: fu,
    resumo: String(p.resumo || '').slice(0, 300)
  };
}

/** Cria follow-up no CRM como nota fixada (mesmo formulário do no-show), com alerta às 9h do dia indicado. */
function painelFollowupCrm_(idCad, feedback, proximo, diaAlerta) {
  var jar = crmLogin_();
  var form = crmGet_(jar, '/followups/new?surgeon_id=' + idCad).getContentText();
  var op = crmOpcoes_(form);
  var alerta = alertaData_(diaAlerta);
  var res = crmPost_(jar, '/followups', {
    'authenticity_token': tokenDoForm_(form, '/followups'),
    'followup[surgeon_id]': idCad,
    'followup[purpose]': 'Appendix',
    'followup[treatment_type]': 'invasive',
    'followup[sub_purpose]': (op.subs['Appendix'] || []).filter(function (s) { return /Pinned/.test(s); })[0] || '',
    'followup[sub_purpose_text]': '',
    'followup[true_followup]': 'false',
    'followup[way]': '8',
    'followup[feedback]': feedback,
    'followup[issue_question]': '0',
    'followup[next_step]': '8',
    'followup[comments]': proximo || '',
    'followup[recipient_id]': op.leticia,
    'followup[send_alert]': 'true',
    'followup[alert(1i)]': Utilities.formatDate(alerta, TZ, 'yyyy'),
    'followup[alert(2i)]': String(Number(Utilities.formatDate(alerta, TZ, 'M'))),
    'followup[alert(3i)]': String(Number(Utilities.formatDate(alerta, TZ, 'd'))),
    'followup[alert(4i)]': '09',
    'followup[alert(5i)]': '00',
    'commit': 'Create'
  });
  if (res.getResponseCode() !== 302) throw new Error('o CRM não aceitou o follow-up (código ' + res.getResponseCode() + ')');
  return CRM + '/surgeons/' + idCad;
}

/* =========================================================
   AGENDA DO DIA — seg a sex, por volta das 11h, no Telegram (e cópia no WhatsApp).
   Mais de um compromisso: uma mensagem curta por compromisso.
   Instalar uma vez: executar instalarAvisoAgenda no editor.
   ========================================================= */
function avisoAgendaDia() {
  var dia = Number(Utilities.formatDate(new Date(), TZ, 'u'));   // 1 = segunda ... 7 = domingo
  if (dia > 5) return;
  var ini = Utilities.parseDate(Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd') + ' 00:00', TZ, 'yyyy-MM-dd HH:mm');
  var fim = new Date(ini.getTime() + 864e5);
  var res = Calendar.Events.list('primary', { timeMin: ini.toISOString(), timeMax: fim.toISOString(), singleEvents: true, orderBy: 'startTime', maxResults: 50 });
  var itens = (res.items || []).filter(function (ev) {
    if (ev.status === 'cancelled' || (ev.eventType && ev.eventType !== 'default')) return false;
    var eu = (ev.attendees || []).filter(function (a) { return a.self; })[0];
    return !(eu && eu.responseStatus === 'declined');
  });
  if (!itens.length) { enviarTelegram_('☀️ Bom dia, Leticia! Hoje sua agenda está livre.'); return; }

  var linhas = itens.map(function (ev) {
    var lia = !!(ev.extendedProperties && ev.extendedProperties.private && ev.extendedProperties.private.crisId);
    var tipo = '';
    try { tipo = lia ? 'Lembrete da Lia' : classificar_(ev, ''); } catch (e) { tipo = ''; }
    var rotulo = /appt/i.test(tipo) ? 'Reunião com prospect' : tipo === 'Cliente' ? 'Reunião com cliente' : tipo === 'Interna' ? 'Reunião interna' : tipo;
    var hora = ev.start && ev.start.dateTime ? quando_(new Date(ev.start.dateTime)).split(' às ')[1] : 'Dia todo';
    return '🕐 <b>' + hora + '</b> — ' + escHtml_(ev.summary || '(sem título)') +
      (rotulo ? '\n' + rotulo : '') + (ev.hangoutLink ? ' · Meet' : '');
  });

  if (linhas.length === 1) {
    enviarTelegram_('☀️ Bom dia, Leticia! Hoje você tem 1 compromisso:\n\n' + linhas[0]);
    return;
  }
  enviarTelegram_('☀️ Bom dia, Leticia! Hoje você tem ' + linhas.length + ' compromissos. Vou mandar um por um:');
  linhas.forEach(function (l) { enviarTelegram_(l); });
  registrar_('aviso_agenda', linhas.length + ' compromissos', 'sucesso', '', '');
}

function instalarAvisoAgenda() {
  ScriptApp.getProjectTriggers().forEach(function (g) { if (g.getHandlerFunction() === 'avisoAgendaDia') ScriptApp.deleteTrigger(g); });
  ScriptApp.newTrigger('avisoAgendaDia').timeBased().everyDays(1).atHour(11).nearMinute(0).inTimezone(TZ).create();
  Logger.log('Aviso da agenda instalado: seg a sex, por volta das 11h.');
}
