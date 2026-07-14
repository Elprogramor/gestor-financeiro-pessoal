# Fluxo — Gestão Financeira Pessoal

Aplicação web em HTML5, CSS3 e JavaScript puro, com PWA, funcionamento offline e sincronização pelo Supabase.

## Recursos principais

- dashboard, fluxo de caixa, calendário e estatísticas;
- receitas, despesas, parcelas, metas, objetivos e dívidas;
- exportação JSON/CSV e impressão;
- tema claro/escuro;
- conta individual por usuário;
- login com e-mail/senha ou Google;
- espaços compartilhados por convite;
- permissões de Proprietário, Editor e Somente leitura;
- cache offline separado por usuário e espaço;
- PWA instalável;
- sincronização em tempo real entre celular e computador.

## Atualizar uma instalação existente

Leia primeiro:

`ATUALIZACAO_V3.md`

Execute no banco existente:

`supabase-upgrade-v3.sql`

## Criar uma instalação nova

Execute no SQL Editor:

`supabase-setup.sql`

Depois configure os valores públicos em:

`js/config.js`

## Login com Google

Leia:

`GOOGLE_LOGIN_SETUP.md`

## Executar localmente

Com Live Server ou Python:

```powershell
python -m http.server 5500
```

Abra:

```text
http://localhost:5500
```

## Segurança

A Publishable key ou chave `anon` pode ser usada no navegador porque as tabelas estão protegidas por RLS. Nunca publique `service_role`, Secret key, senha do banco ou connection string.

## Versão

`3.0.0`
