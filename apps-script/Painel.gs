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
  let req = {};
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
  let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ ,]+(?:às\s*)?(\d{1,2})[:h](\d{2})?)?/);
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
    let fups = [];
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

  const p = PROPS.getProperties();
  let gatilhos = [];
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
    reunioes: reunioes,
    tarefas: tarefas,
    historico: historico
  };
}
