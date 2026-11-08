# Workspace Crisalix

Painel dos robôs da Crisalix (hoje: **Lia**, assistente comercial da Leticia).

- Site estático (GitHub Pages): `index.html`, `style.css`, `app.js`, `config.js`. Sem build, sem dependências.
- **Nenhum dado fica neste repositório.** O site busca os dados direto no Apps Script de cada robô, que só responde com a senha certa (propriedade `PAINEL_SENHA` do script).
- API da Lia: `apps-script/Painel.gs` (cópia de referência do arquivo que fica no projeto Apps Script "Lia").

## Novo robô
1. No Apps Script do robô, crie um `doPost` no mesmo formato de `Painel.gs` e a propriedade `PAINEL_SENHA`.
2. Implante como App da Web (Executar como: eu · Acesso: qualquer pessoa).
3. Acrescente o robô em `config.js` com a URL `/exec`.
