# Atualização para a versão 3.0

Esta atualização preserva os lançamentos existentes e acrescenta:

- acesso direto por login, sem pedir Project URL ou chave aos visitantes;
- conta individual para cada pessoa;
- login com Google;
- espaços financeiros compartilhados;
- convites com validade de 7 dias;
- permissões de Proprietário, Editor e Somente leitura;
- cache local separado por conta e por espaço financeiro.

## Ordem correta para atualizar

### 1. Faça um backup

Na versão atual, acesse:

`Configurações > Dados e backup > JSON`

Guarde o arquivo antes da atualização.

### 2. Atualize o banco existente

No Supabase:

1. Abra **SQL Editor**.
2. Clique em **New query**.
3. Copie todo o conteúdo de `supabase-upgrade-v3.sql`.
4. Clique em **Run**.

Use `supabase-upgrade-v3.sql` para um banco que já possui seus dados. Ele não apaga nem recria as movimentações existentes.

O arquivo `supabase-setup.sql` é destinado a uma instalação totalmente nova e já contém a estrutura completa.

### 3. Coloque a configuração pública no projeto

Abra `js/config.js` e substitua:

```js
supabaseUrl: "https://SEU-PROJETO.supabase.co",
supabasePublishableKey: "sb_publishable_COLE_SUA_CHAVE_PUBLICA_AQUI",
publicAppUrl: "https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/",
```

Use somente:

- **Project URL**;
- **Publishable key** ou a antiga chave `anon`.

Nunca coloque no arquivo:

- Secret key;
- `service_role`;
- senha do banco;
- connection string.

Depois dessa configuração, nenhuma pessoa verá a tela pedindo URL ou chave. Ela verá somente login, cadastro e botão do Google.

### 4. Envie a versão nova ao GitHub

Substitua os arquivos do projeto pelo conteúdo desta pasta e envie:

```powershell
git add .
git commit -m "Adiciona contas, Google e acessos compartilhados"
git push
```

Após o GitHub Pages atualizar, pressione `Ctrl + F5` no computador. No celular, feche o PWA ou a aba e abra novamente.

### 5. Configure o Google

Siga `GOOGLE_LOGIN_SETUP.md`.

O login tradicional por e-mail e senha continua funcionando mesmo antes dessa configuração.

## Como cada pessoa usa seus próprios dados

A pessoa abre o mesmo endereço do GitHub Pages e escolhe:

- **Continuar com o Google**; ou
- **Criar minha conta**.

O banco cria automaticamente um espaço pessoal exclusivo. Os dados dela não se misturam com os seus.

## Como compartilhar seu espaço com sua esposa

1. Entre na sua conta.
2. Abra **Configurações**.
3. Entre em **Pessoas e acessos**.
4. Informe o e-mail dela.
5. Escolha:
   - **Pode visualizar e editar**; ou
   - **Somente visualizar**.
6. Clique em **Criar convite**.
7. Compartilhe o link pelo WhatsApp, e-mail ou botão de compartilhamento.

Ela abre o link e entra com o mesmo e-mail informado no convite. Pode usar Google ou e-mail e senha. Depois da aceitação, aparecerão dois espaços no seletor superior:

- o espaço pessoal dela;
- o espaço compartilhado por você.

## Permissões

### Proprietário

- controla todos os dados;
- cria e cancela convites;
- muda permissões;
- remove acessos.

### Editor

- visualiza todos os dados do espaço;
- cria, altera e exclui lançamentos, objetivos, dívidas e metas;
- não administra pessoas.

### Somente leitura

- visualiza dashboard, fluxo, calendário e relatórios;
- não cria, altera, importa ou exclui informações.

As permissões são verificadas pelas políticas RLS do banco, e não apenas pela interface.
