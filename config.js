// Configuração do Workspace Crisalix.
// Para incluir um robô novo, acrescente um item em "robos" com a URL /exec do Apps Script dele.
// A senha NÃO fica aqui: cada robô confere a senha na propriedade PAINEL_SENHA do próprio Apps Script.
window.WORKSPACE = {
  titulo: 'Workspace Crisalix',
  dono: 'Leticia Soares',
  robos: [
    {
      id: 'lia',
      nome: 'Lia',
      papel: 'Assistente comercial · reuniões, resumos, agenda e CRM',
      api: 'https://script.google.com/macros/s/AKfycbzk5nNV5RA2BOazzcmZ2q1QmwP7B8TkE0EE1O0gtvse05nmqorG1bO8573cNioCPeUc/exec',
      cor: '#0f766e'
    },
    {
      id: 'pessoal',
      nome: 'Módulo pessoal',
      papel: 'Próxima etapa da Lia',
      api: null,
      cor: '#7c3aed'
    }
  ]
};
