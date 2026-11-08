/* Escritório da Lia — cena animada (SVG + CSS).
   Estados: trabalhando · raiva (erro) · feliz (relatório enviado) · dormindo (terminou). */
(function () {
  'use strict';

  const OPERACOES = {
    crm_followup: 'registrando follow-up no CRM',
    crm_atualizado: 'atualizando o CRM',
    crm_noshow: 'registrando no-show no CRM',
    crm_duplicidade: 'conferindo duplicidade no CRM',
    evento_criado: 'criando evento na agenda',
    evento_reagendado: 'reagendando evento',
    retroativo: 'processando reuniões antigas',
    rotina: 'rodando a rotina do dia',
    revisao_semanal: 'fazendo a revisão da semana',
    planejamento_semanal: 'planejando a semana'
  };
  const RELATORIOS = { rotina: 'Relatório do dia', revisao_semanal: 'Revisão semanal', planejamento_semanal: 'Planejamento da semana', retroativo: 'Relatório do retroativo' };

  function paraData(iso) {
    const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
    return m ? new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)) : null;
  }
  function minutosDesde(iso) {
    const d = paraData(iso);
    return d ? (Date.now() - d.getTime()) / 60000 : Infinity;
  }
  function hora(iso) { return String(iso || '').slice(11, 16); }

  /* Próxima rotina: seg–sáb às 12h, 16h e 20h */
  function proximaRotina() {
    const agora = new Date();
    for (let i = 0; i < 8; i++) {
      const d = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + i);
      if (d.getDay() === 0) continue;
      for (const h of [12, 16, 20]) {
        const t = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h);
        if (t > agora) {
          const dia = i === 0 ? 'hoje' : i === 1 ? 'amanhã' : ['dom', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][t.getDay()];
          return dia + ' às ' + h + 'h';
        }
      }
    }
    return '';
  }

  /* Decide o humor a partir do Histórico da Lia */
  function humor(historico) {
    const h = (historico || []).filter(function (x) { return x.data; })
      .sort(function (a, b) { return a.data.localeCompare(b.data); });
    const ultimo = h[h.length - 1];
    const recentes = h.filter(function (x) { return minutosDesde(x.data) <= 30; });
    const falha = recentes.slice().reverse().find(function (x) { return x.resultado === 'falha'; });

    if (ultimo && ultimo.resultado === 'falha' && minutosDesde(ultimo.data) <= 180) {
      return { estado: 'raiva', titulo: 'Algo deu errado', detalhe: descreverErro(ultimo) };
    }
    if (falha) return { estado: 'raiva', titulo: 'Algo deu errado', detalhe: descreverErro(falha) };
    if (ultimo && minutosDesde(ultimo.data) <= 10) {
      return { estado: 'trabalhando', titulo: 'Trabalhando agora', detalhe: (OPERACOES[ultimo.operacao] || ultimo.operacao.replace(/_/g, ' ')) + (ultimo.registro && ultimo.registro !== '-' ? ' · ' + ultimo.registro : '') };
    }
    const rel = h.slice().reverse().find(function (x) {
      return RELATORIOS[x.operacao] && x.resultado !== 'falha' && x.resultado !== 'adiada';
    });
    if (rel && minutosDesde(rel.data) <= 60) {
      return { estado: 'feliz', titulo: 'Relatório enviado!', detalhe: RELATORIOS[rel.operacao] + ' enviado às ' + hora(rel.data) };
    }
    const prox = proximaRotina();
    return {
      estado: 'dormindo', titulo: 'Terminou por agora',
      detalhe: (ultimo ? 'Última tarefa às ' + hora(ultimo.data) + '. ' : '') + (prox ? 'Próxima rotina ' + prox + '.' : '')
    };
  }
  function descreverErro(x) {
    const onde = OPERACOES[x.operacao] || x.operacao.replace(/_/g, ' ');
    return 'Às ' + hora(x.data) + ', ' + onde + (x.erro ? ': ' + String(x.erro).slice(0, 120) : '');
  }

  /* ---------- Cena em pixel art: mesa + notebook + Lia ---------- */
  function px(x, y, w, h, cls) { return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '"' + (cls ? ' class="' + cls + '"' : '') + '/>'; }
  function zPixel(x, y) { return px(x, y, 4, 1) + px(x + 2, y + 1, 1, 1) + px(x + 1, y + 2, 1, 1) + px(x, y + 3, 4, 1); }
  function brilho(x, y) { return px(x + 1, y, 1, 3) + px(x, y + 1, 3, 1); }

  function codigo() {
    const cores = ['c1', 'c2', 'c3', 'c4', 'c5'];
    const larg = [14, 9, 20, 12, 6, 17, 10, 22, 8, 15];
    let s = '';
    for (let k = 0; k < 2; k++) {
      larg.forEach(function (w, i) {
        s += px(104 + (i % 3) * 2, 38 + k * 20 + i * 2, w, 1, 'cod ' + cores[(i + k) % 5]);
      });
    }
    return s;
  }

  function svg() {
    return '' +
'<svg class="esc-svg" viewBox="32 4 124 78" shape-rendering="crispEdges" role="img" aria-label="Escritório da Lia" xmlns="http://www.w3.org/2000/svg">' +
  '<defs><clipPath id="esc-tela"><rect x="102" y="36" width="30" height="19"/></clipPath></defs>' +
  px(0, 0, 160, 78, 'px-parede') + px(0, 78, 160, 12, 'px-chao') + px(0, 77, 160, 1, 'px-rodape') +

  // banquinho
  px(69, 64, 2, 14, 'px-banco') + px(64, 76, 12, 2, 'px-banco') +

  // ===== Lia =====
  '<g class="lia">' +
    '<g class="lia-corpo-todo">' +
      // braço de trás (digitando)
      '<g class="bracos-digitando"><g class="braco-tras">' + px(78, 48, 10, 3, 'p-sombra') + px(86, 51, 3, 3, 'p-sombra') + px(88, 53, 5, 3, 'p-mao') + '</g></g>' +
      // corpo
      px(63, 44, 15, 16, 'p-corpo') + px(63, 44, 15, 1, 'p-sombra') +
      px(66, 48, 9, 5, 'p-painel') + px(68, 50, 2, 1, 'p-led') + px(72, 50, 2, 1, 'p-led l2') +
      // braços para cima (feliz)
      '<g class="bracos-alto"><g class="aceno-e">' + px(56, 38, 3, 9, 'p-corpo') + px(55, 34, 5, 4, 'p-mao') + '</g>' +
        '<g class="aceno-d">' + px(81, 38, 3, 9, 'p-corpo') + px(80, 34, 5, 4, 'p-mao') + '</g></g>' +
      // cabeça
      '<g class="lia-cabeca">' +
        px(69, 23, 2, 5, 'p-sombra') + px(68, 20, 4, 3, 'p-luz') +
        px(60, 28, 20, 16, 'p-cabeca') + px(60, 42, 20, 2, 'p-corpo') +
        px(58, 33, 2, 5, 'p-sombra') + px(80, 33, 2, 5, 'p-sombra') +
        px(63, 31, 16, 10, 'p-visor') +
        '<g class="olhos olhos-abertos">' + px(70, 34, 2, 3, 'p-olho') + px(75, 34, 2, 3, 'p-olho') + '</g>' +
        '<g class="olhos olhos-felizes">' + px(69, 35, 1, 1, 'p-olho') + px(70, 34, 1, 1, 'p-olho') + px(71, 35, 1, 1, 'p-olho') +
          px(74, 35, 1, 1, 'p-olho') + px(75, 34, 1, 1, 'p-olho') + px(76, 35, 1, 1, 'p-olho') + '</g>' +
        '<g class="olhos olhos-bravos">' + px(68, 32, 2, 1, 'p-bravo') + px(70, 33, 2, 1, 'p-bravo') + px(77, 32, 2, 1, 'p-bravo') + px(75, 33, 2, 1, 'p-bravo') +
          px(70, 35, 2, 2, 'p-bravo') + px(75, 35, 2, 2, 'p-bravo') + '</g>' +
        '<g class="olhos olhos-dormindo">' + px(69, 36, 3, 1, 'p-olho') + px(74, 36, 3, 1, 'p-olho') + '</g>' +
        '<g class="boca boca-normal">' + px(72, 38, 3, 1, 'p-olho') + '</g>' +
        '<g class="boca boca-feliz">' + px(71, 38, 5, 1, 'p-olho') + px(72, 39, 3, 1, 'p-olho') + '</g>' +
        '<g class="boca boca-brava">' + px(72, 38, 3, 1, 'p-bravo') + px(71, 39, 1, 1, 'p-bravo') + px(75, 39, 1, 1, 'p-bravo') + '</g>' +
        '<g class="boca boca-dormindo">' + px(73, 38, 2, 1, 'p-olho') + '</g>' +
        '<g class="bochechas">' + px(64, 38, 2, 1, 'p-bochecha') + px(77, 38, 1, 1, 'p-bochecha') + '</g>' +
      '</g>' +
      // braço da frente (digitando)
      '<g class="bracos-digitando"><g class="braco-frente">' + px(75, 51, 12, 3, 'p-corpo') + px(86, 53, 3, 2, 'p-corpo') + px(88, 54, 6, 3, 'p-mao') + '</g></g>' +
    '</g>' +
    // vapor (raiva)
    '<g class="vapor">' + px(55, 22, 3, 3, 'p-vapor v1') + px(83, 20, 3, 3, 'p-vapor v2') + px(58, 16, 2, 2, 'p-vapor v3') + px(81, 14, 2, 2, 'p-vapor v4') + '</g>' +
    // Zzz (dormindo)
    '<g class="zzz"><g class="z1">' + zPixel(84, 22) + '</g><g class="z2">' + zPixel(90, 14) + '</g><g class="z3">' + zPixel(97, 6) + '</g></g>' +
    // brilhos (feliz)
    '<g class="brilhos"><g class="b1">' + brilho(46, 24) + '</g><g class="b2">' + brilho(90, 20) + '</g><g class="b3">' + brilho(52, 10) + '</g><g class="b4">' + brilho(86, 8) + '</g></g>' +
  '</g>' +

  // mesa (na frente do corpo)
  px(38, 60, 114, 4, 'px-mesa') + px(38, 63, 114, 1, 'px-mesa-sombra') + px(42, 64, 4, 14, 'px-mesa-sombra') + px(144, 64, 4, 14, 'px-mesa-sombra') +

  // notebook
  px(100, 34, 34, 23, 'px-note') + px(102, 36, 30, 19, 'tela-fundo') +
  '<g clip-path="url(#esc-tela)">' +
    '<g class="tela tela-codigo"><g class="codigo-rolando">' + codigo() + '</g>' + px(104, 52, 3, 1, 'cursor') + '</g>' +
    '<g class="tela tela-erro">' + px(116, 38, 2, 10, 'px-branco') + px(116, 50, 2, 2, 'px-branco') + '</g>' +
    '<g class="tela tela-relatorio">' + px(108, 40, 16, 11, 'px-branco') +
      px(108, 40, 2, 1, 'px-env') + px(110, 41, 2, 1, 'px-env') + px(112, 42, 2, 1, 'px-env') + px(114, 43, 4, 1, 'px-env') + px(118, 42, 2, 1, 'px-env') + px(120, 41, 2, 1, 'px-env') + px(122, 40, 2, 1, 'px-env') +
      px(122, 37, 6, 6, 'px-ok') + px(123, 40, 1, 1, 'px-branco') + px(124, 41, 1, 1, 'px-branco') + px(125, 40, 1, 1, 'px-branco') + px(126, 39, 1, 1, 'px-branco') + '</g>' +
    '<g class="tela tela-dormindo">' + px(116, 45, 2, 1, 'protetor') + '</g>' +
  '</g>' +
  px(96, 57, 42, 3, 'px-note-base') + px(98, 57, 30, 1, 'px-teclas') + px(112, 59, 10, 1, 'px-note') +

  px(0, 0, 160, 90, 'esc-sombra') +
'</svg>';
  }

  /* Ponteiros do relógio com a hora real */
  function acertarRelogio(raiz) {
    const d = new Date();
    const h = raiz && raiz.querySelector('.esc-ponteiro-h'), m = raiz && raiz.querySelector('.esc-ponteiro-m');
    if (h) h.setAttribute('transform', 'rotate(' + ((d.getHours() % 12) * 30 + d.getMinutes() / 2) + ' 232 48)');
    if (m) m.setAttribute('transform', 'rotate(' + d.getMinutes() * 6 + ' 232 48)');
  }

  window.Escritorio = { svg: svg, humor: humor, acertarRelogio: acertarRelogio };
})();
