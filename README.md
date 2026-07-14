# Fluxo — Gestão Financeira para Autônomos

Aplicação web estática feita com HTML5, CSS3 e JavaScript puro. Funciona como PWA, continua utilizável offline e pode sincronizar os mesmos lançamentos entre celular e computador usando uma conta pessoal no Supabase.

## Como os dados são protegidos

O projeto utiliza três camadas:

1. **Supabase/PostgreSQL** como cópia compartilhada entre dispositivos.
2. **LocalStorage** como cache offline e fila de alterações pendentes.
3. **Backup JSON** para manter uma cópia independente fora do aplicativo.

A sincronização é feita por registro. Entradas, saídas, objetivos, dívidas e metas recebem identificadores próprios, datas de atualização e exclusões sincronizáveis. Isso evita substituir todo o histórico sempre que um único item é alterado.

## Estrutura

```text
/index.html
/supabase-setup.sql
/SUPABASE_SETUP.md

/css
  style.css
  dashboard.css
  forms.css
  tables.css
  responsive.css

/js
  app.js
  storage.js
  cloud.js
  dashboard.js
  finance.js
  goals.js
  charts.js
  ui.js
  utils.js

/assets
  /icons
  /images
```

## Executar localmente

O projeto utiliza módulos ES e Service Worker, portanto deve ser aberto por um servidor HTTP.

### Live Server no VS Code

1. Abra a pasta no VS Code.
2. Instale a extensão **Live Server**.
3. Clique com o botão direito em `index.html`.
4. Escolha **Open with Live Server**.

### Python

Dentro da pasta do projeto:

```bash
python -m http.server 5500
```

No Windows, caso `python` não funcione:

```bash
py -m http.server 5500
```

Depois acesse:

```text
http://localhost:5500
```

## Configurar o Supabase

Leia o guia completo:

```text
SUPABASE_SETUP.md
```

Resumo:

1. Crie um projeto gratuito no Supabase.
2. Abra o **SQL Editor**.
3. Execute todo o arquivo `supabase-setup.sql`.
4. Copie a **Project URL**.
5. Copie somente a **Publishable key** ou a chave `anon` de um projeto antigo.
6. Abra o Fluxo e informe esses dois dados na primeira tela.
7. Crie uma conta com e-mail e senha.
8. Entre com a mesma conta no celular e no computador.

Nunca coloque no frontend:

- Secret key.
- `service_role`.
- Senha do banco.
- String de conexão PostgreSQL.

## Migração dos dados locais

Caso você já tenha lançamentos na versão anterior:

1. Abra primeiro a nova versão no navegador que contém os dados antigos.
2. Configure o Supabase.
3. Crie ou acesse sua conta.
4. Aguarde o indicador mostrar **Sincronizado**.
5. Só depois entre no celular ou em outro computador.

Os registros existentes no navegador serão enviados na primeira sincronização. Dados remotos e locais serão mesclados individualmente.

Como proteção adicional, exporte um JSON antes da migração:

```text
Configurações → Dados e backup → JSON
```

## Indicador de sincronização

O topo do sistema mostra:

- **Sincronizado:** todos os registros foram enviados e recebidos.
- **Sincronizando:** operação em andamento.
- **Pendente:** existem mudanças aguardando envio.
- **Offline:** alterações continuam salvas no dispositivo e serão enviadas depois.
- **Atenção:** confira a mensagem em Configurações → Nuvem e sincronização.

## Publicar no GitHub Pages

1. Envie todos os arquivos para a raiz do repositório.
2. Abra **Settings → Pages**.
3. Em **Build and deployment**, escolha **Deploy from a branch**.
4. Selecione a branch `main` e a pasta `/ (root)`.
5. Salve e aguarde a publicação.

Depois adicione a URL publicada nas URLs permitidas do Supabase Auth, conforme explicado em `SUPABASE_SETUP.md`.

## Recursos

- Dashboard e indicadores financeiros.
- Entradas, saídas e compras parceladas.
- Fluxo de caixa com filtros, busca, ordenação e saldo acumulado.
- Objetivos, dívidas, metas mensais e calendário financeiro.
- Estatísticas, evolução e produtividade por origem.
- Exportação JSON/CSV, importação e impressão.
- Backups locais e snapshots na nuvem.
- Conta com e-mail e senha.
- Políticas RLS por usuário.
- Sincronização em tempo real e verificação periódica.
- Fila offline para alterações pendentes.
- Bloqueio automático por inatividade.
- Temas claro, escuro e automático.
- PWA instalável.

## Rotina recomendada de backup

Mesmo com a nuvem, mantenha uma cópia independente:

1. Use o sistema normalmente com o indicador **Sincronizado**.
2. Exporte um JSON semanal ou mensalmente.
3. Guarde o arquivo no Google Drive, OneDrive ou em outro local seguro.
4. Não apague o projeto do Supabase antes de confirmar que possui um JSON recente.

## Observação de segurança

A Publishable/anon key pode estar no navegador porque o acesso às linhas é restringido pelas políticas RLS e pela sessão autenticada. A aplicação rejeita chaves `service_role` e Secret keys na tela de configuração.

O LocalStorage não é um cofre criptografado. Ele serve como cache offline. Proteja o celular e o computador com senha, mantenha o navegador atualizado e preserve backups JSON externos.
