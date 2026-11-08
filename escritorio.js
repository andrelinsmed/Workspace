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

  /* Linhas de código do monitor (duplicadas para rolar sem emenda) */
  function linhasCodigo() {
    const cores = ['#5eead4', '#93c5fd', '#fcd34d', '#f9a8d4', '#a7f3d0', '#c4b5fd'];
    const larg = [62, 40, 78, 52, 30, 70, 46, 84, 36, 58, 66, 44];
    let s = '';
    for (let k = 0; k < 2; k++) {
      larg.forEach(function (w, i) {
        const y = 106 + k * 72 + i * 6;
        const x = 162 + (i % 3 === 1 ? 8 : i % 3 === 2 ? 16 : 0);
        s += '<rect x="' + x + '" y="' + y + '" width="' + (w * 0.9) + '" height="3" rx="1.5" fill="' + cores[(i + k) % cores.length] + '" opacity=".9"/>';
      });
    }
    return s;
  }

  function svg() {
    return '' +
'<svg class="esc-svg" viewBox="0 0 600 290" role="img" aria-label="Escritório da Lia" xmlns="http://www.w3.org/2000/svg">' +
  '<defs><clipPath id="esc-tela"><rect x="157" y="102" width="111" height="66" rx="3"/></clipPath></defs>' +
  // parede e chão
  '<rect class="esc-parede" x="0" y="0" width="600" height="232"/>' +
  '<rect class="esc-chao" x="0" y="232" width="600" height="58"/>' +
  '<rect class="esc-rodape" x="0" y="228" width="600" height="5"/>' +
  // janela
  '<g class="esc-janela">' +
    '<rect x="36" y="36" width="128" height="96" rx="6" class="esc-moldura"/>' +
    '<rect x="42" y="42" width="116" height="84" rx="3" class="esc-ceu"/>' +
    '<circle class="esc-sol" cx="130" cy="66" r="11"/>' +
    '<g class="esc-noite"><circle cx="128" cy="64" r="10" fill="#f1f5f9"/><circle cx="133" cy="60" r="9" class="esc-ceu-noite"/>' +
      '<circle cx="62" cy="58" r="1.6" fill="#fff"/><circle cx="88" cy="74" r="1.2" fill="#fff"/><circle cx="104" cy="52" r="1.4" fill="#fff"/><circle cx="72" cy="96" r="1.1" fill="#fff"/></g>' +
    '<g class="esc-nuvem"><ellipse cx="70" cy="92" rx="16" ry="7" fill="#fff" opacity=".85"/><ellipse cx="82" cy="88" rx="11" ry="7" fill="#fff" opacity=".85"/></g>' +
    '<rect x="98" y="42" width="4" height="84" class="esc-moldura"/><rect x="42" y="82" width="116" height="4" class="esc-moldura"/>' +
  '</g>' +
  // relógio
  '<g class="esc-relogio"><circle cx="372" cy="50" r="17" class="esc-moldura"/><circle cx="372" cy="50" r="14" fill="#fff"/>' +
    '<line class="esc-ponteiro-h" x1="372" y1="50" x2="372" y2="42" stroke="#334155" stroke-width="2.2" stroke-linecap="round"/>' +
    '<line class="esc-ponteiro-m" x1="372" y1="50" x2="372" y2="39" stroke="#334155" stroke-width="1.4" stroke-linecap="round"/>' +
    '<circle cx="372" cy="50" r="1.6" fill="#334155"/></g>' +
  // prateleira com planta e livros
  '<rect x="450" y="92" width="118" height="5" rx="2" class="esc-madeira"/>' +
  '<g><rect x="466" y="74" width="18" height="18" rx="3" fill="#c2410c"/>' +
    '<path class="esc-folha" d="M475 74 C468 62 466 56 470 50 C474 58 476 64 475 74Z" fill="#16a34a"/>' +
    '<path class="esc-folha f2" d="M475 74 C482 62 486 58 484 50 C479 57 476 64 475 74Z" fill="#22c55e"/></g>' +
  '<rect x="510" y="66" width="9" height="26" rx="1.5" fill="#0f766e"/><rect x="521" y="70" width="8" height="22" rx="1.5" fill="#f59e0b"/>' +
  '<rect x="531" y="64" width="10" height="28" rx="1.5" fill="#6366f1"/><rect x="544" y="72" width="7" height="20" rx="1.5" transform="rotate(12 547 82)" fill="#e11d48"/>' +
  // cadeira (atrás da Lia)
  '<rect x="318" y="128" width="84" height="86" rx="16" class="esc-cadeira"/>' +

  // ===== Lia =====
  '<g class="lia">' +
    '<g class="lia-corpo-todo">' +
      '<rect x="331" y="140" width="58" height="58" rx="15" class="lia-corpo"/>' +
      '<rect x="350" y="152" width="20" height="12" rx="4" class="lia-peito"/>' +
      '<circle cx="356" cy="158" r="2" class="lia-led"/><circle cx="364" cy="158" r="2" class="lia-led l2"/>' +
      // braços digitando
      '<g class="lia-bracos-digitando">' +
        '<g class="lia-braco-e"><path d="M336 152 Q318 170 304 185" class="lia-braco"/><circle cx="303" cy="186" r="6" class="lia-mao"/></g>' +
        '<g class="lia-braco-d"><path d="M384 152 Q372 180 334 187" class="lia-braco"/><circle cx="332" cy="187" r="6" class="lia-mao"/></g>' +
      '</g>' +
      // braços para cima (feliz)
      '<g class="lia-bracos-alto">' +
        '<g class="lia-aceno-e"><path d="M336 150 Q318 132 312 108" class="lia-braco"/><circle cx="311" cy="105" r="6" class="lia-mao"/></g>' +
        '<g class="lia-aceno-d"><path d="M384 150 Q402 132 408 108" class="lia-braco"/><circle cx="409" cy="105" r="6" class="lia-mao"/></g>' +
      '</g>' +
      // cabeça
      '<g class="lia-cabeca">' +
        '<line x1="360" y1="84" x2="360" y2="70" class="lia-antena"/>' +
        '<circle cx="360" cy="66" r="5.5" class="lia-luz"/>' +
        '<rect x="321" y="82" width="78" height="60" rx="20" class="lia-cabeca-forma"/>' +
        '<circle cx="321" cy="112" r="5" class="lia-orelha"/><circle cx="399" cy="112" r="5" class="lia-orelha"/>' +
        '<rect x="329" y="92" width="62" height="38" rx="13" class="lia-visor"/>' +
        // olhos por estado
        '<g class="olhos olhos-abertos"><ellipse cx="346" cy="109" rx="5" ry="6.5" class="lia-olho"/><ellipse cx="370" cy="109" rx="5" ry="6.5" class="lia-olho"/></g>' +
        '<g class="olhos olhos-felizes"><path d="M341 111 Q347 103 353 111" class="lia-traco"/><path d="M367 111 Q373 103 379 111" class="lia-traco"/></g>' +
        '<g class="olhos olhos-bravos"><path d="M339 101 L354 106" class="lia-traco vermelho"/><path d="M381 101 L366 106" class="lia-traco vermelho"/>' +
          '<ellipse cx="347" cy="111" rx="4.5" ry="4" class="lia-olho bravo"/><ellipse cx="373" cy="111" rx="4.5" ry="4" class="lia-olho bravo"/></g>' +
        '<g class="olhos olhos-dormindo"><path d="M341 110 Q347 115 353 110" class="lia-traco"/><path d="M367 110 Q373 115 379 110" class="lia-traco"/></g>' +
        // bocas
        '<path class="boca boca-normal" d="M354 121 Q360 125 366 121" />' +
        '<path class="boca boca-feliz" d="M350 119 Q360 129 370 119 Z" />' +
        '<path class="boca boca-brava" d="M352 124 Q360 118 368 124" />' +
        '<ellipse class="boca boca-dormindo" cx="360" cy="122" rx="3" ry="2.2"/>' +
        '<circle cx="335" cy="122" r="3.5" class="lia-bochecha"/><circle cx="385" cy="122" r="3.5" class="lia-bochecha"/>' +
      '</g>' +
    '</g>' +
    // vapor de raiva
    '<g class="vapor"><circle cx="314" cy="86" r="6"/><circle cx="406" cy="86" r="6"/><circle cx="318" cy="76" r="4"/><circle cx="402" cy="76" r="4"/></g>' +
    // Zzz
    '<g class="zzz"><text x="404" y="84">z</text><text x="416" y="70" class="z2">z</text><text x="430" y="54" class="z3">Z</text></g>' +
  '</g>' +

  // mesa (na frente do corpo da Lia)
  '<rect x="112" y="192" width="376" height="13" rx="4" class="esc-madeira"/>' +
  '<rect x="128" y="205" width="10" height="56" rx="2" class="esc-madeira-escura"/><rect x="462" y="205" width="10" height="56" rx="2" class="esc-madeira-escura"/>' +
  // monitor
  '<rect x="205" y="172" width="12" height="20" rx="2" class="esc-metal"/><ellipse cx="211" cy="191" rx="28" ry="4" class="esc-metal"/>' +
  '<rect x="150" y="95" width="125" height="80" rx="7" class="esc-monitor"/>' +
  '<rect x="157" y="102" width="111" height="66" rx="3" class="tela-fundo"/>' +
  '<g clip-path="url(#esc-tela)">' +
    '<g class="tela tela-codigo"><g class="codigo-rolando">' + linhasCodigo() + '</g><rect class="cursor" x="162" y="160" width="6" height="4" fill="#5eead4"/></g>' +
    '<g class="tela tela-erro"><text x="212" y="133" text-anchor="middle" class="tela-erro-x">✕</text><text x="212" y="153" text-anchor="middle" class="tela-txt">ERRO</text></g>' +
    '<g class="tela tela-relatorio"><rect x="194" y="112" width="36" height="25" rx="3" fill="#fff"/><path d="M194 114 L212 127 L230 114" fill="none" stroke="#0f766e" stroke-width="2"/>' +
      '<circle cx="230" cy="114" r="7" fill="#22c55e"/><path d="M226.5 114 L229 116.5 L233.5 111.5" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/>' +
      '<text x="212" y="156" text-anchor="middle" class="tela-txt">enviado!</text></g>' +
    '<g class="tela tela-dormindo"><circle cx="212" cy="135" r="3" class="protetor"/></g>' +
  '</g>' +
  '<circle cx="212" cy="99" r="1.3" fill="#64748b"/>' +
  // teclado
  '<rect x="282" y="185" width="66" height="8" rx="2.5" class="esc-teclado"/>' +
  // caneca
  '<g><rect x="418" y="172" width="20" height="20" rx="4" class="esc-caneca"/><path d="M438 177 q8 0 8 6 q0 6 -8 6" fill="none" class="esc-caneca-alca"/>' +
    '<g class="fumaca"><path d="M424 166 q-4 -6 0 -12 q4 -6 0 -12"/><path d="M432 166 q-4 -6 0 -12 q4 -6 0 -12" class="f2"/></g></g>' +
  // confete (feliz)
  '<g class="confete">' +
    '<rect x="300" y="60" width="6" height="3" fill="#f59e0b"/><rect x="420" y="58" width="6" height="3" fill="#ec4899"/>' +
    '<rect x="340" y="40" width="5" height="3" fill="#22c55e"/><rect x="392" y="44" width="6" height="3" fill="#3b82f6"/>' +
    '<circle cx="290" cy="90" r="2.5" fill="#a855f7"/><circle cx="436" cy="92" r="2.5" fill="#f43f5e"/>' +
    '<path d="M318 54 l3 6 6 1 -5 4 1 6 -5 -3 -5 3 1 -6 -5 -4 6 -1z" fill="#fbbf24"/>' +
    '<path d="M410 30 l2.5 5 5 .8 -4 3.4 1 5 -4.5 -2.5 -4.5 2.5 1 -5 -4 -3.4 5 -.8z" fill="#fbbf24"/>' +
  '</g>' +
  // escurecer à noite
  '<rect class="esc-sombra" x="0" y="0" width="600" height="290"/>' +
'</svg>';
  }

  /* Ponteiros do relógio com a hora real */
  function acertarRelogio(raiz) {
    const d = new Date();
    const h = raiz.querySelector('.esc-ponteiro-h'), m = raiz.querySelector('.esc-ponteiro-m');
    if (h) h.setAttribute('transform', 'rotate(' + ((d.getHours() % 12) * 30 + d.getMinutes() / 2) + ' 372 50)');
    if (m) m.setAttribute('transform', 'rotate(' + d.getMinutes() * 6 + ' 372 50)');
  }

  window.Escritorio = { svg: svg, humor: humor, acertarRelogio: acertarRelogio };
})();
