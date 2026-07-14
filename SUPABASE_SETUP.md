# Configurar sincronização gratuita com Supabase

O projeto continua funcionando offline. O Supabase passa a ser a cópia compartilhada entre celular e computador, enquanto o LocalStorage funciona como cache e fila de alterações pendentes.

## 1. Criar o projeto

1. Entre no Supabase e crie um projeto gratuito.
2. Guarde com segurança a senha do banco exibida durante a criação. Ela não será colocada no frontend.
3. Aguarde o projeto terminar de provisionar.

## 2. Criar as tabelas e proteções

1. Abra **SQL Editor**.
2. Escolha **New query**.
3. Copie todo o conteúdo de `supabase-setup.sql`.
4. Execute o SQL.

O script cria:

- `finance_profiles`: preferências do painel.
- `finance_records`: movimentações, objetivos, dívidas e metas.
- `finance_backups`: até dez snapshots completos mantidos pelo aplicativo.
- Políticas RLS: cada conta só acessa as próprias linhas.
- Publicação Realtime: atualizações chegam aos outros dispositivos.

## 3. Configurar autenticação

Em **Authentication**, mantenha o provedor de e-mail e senha habilitado.

Para uso pessoal, existem duas opções:

- Manter confirmação de e-mail habilitada, que é mais segura.
- Desabilitar a confirmação de e-mail para um primeiro teste mais simples.

Se mantiver a confirmação, configure a URL publicada do projeto em **Authentication > URL Configuration**:

```text
https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/
```

Durante testes locais, adicione também:

```text
http://localhost:5500/
http://127.0.0.1:5500/
```

## 4. Obter as informações públicas

No painel do projeto, abra a área de conexão/API e copie:

- **Project URL**, no formato `https://xxxx.supabase.co`.
- **Publishable key**. Em projetos antigos, a **anon key** também funciona.

Nunca use no site:

- Secret key.
- `service_role`.
- Senha do banco.
- String de conexão PostgreSQL.

## 5. Conectar o sistema

1. Execute o projeto com Live Server ou publique no GitHub Pages.
2. Na primeira tela, cole a Project URL e a Publishable/anon key.
3. Crie sua conta com e-mail e senha.
4. Entre com a mesma conta no celular e no computador.

Na primeira sincronização, os registros que já existirem no navegador serão enviados para a conta. Registros vindos de outro dispositivo serão mesclados individualmente.

## 6. Conferir se está funcionando

No topo do painel aparecerá um indicador:

- **Sincronizado**: tudo foi enviado e recebido.
- **Sincronizando**: operação em andamento.
- **Pendente**: há alterações aguardando envio.
- **Offline**: os dados foram salvos localmente e serão enviados quando a internet voltar.
- **Atenção**: confira a mensagem nas configurações.

Faça um teste:

1. Cadastre uma movimentação no computador.
2. Espere o indicador mostrar **Sincronizado**.
3. Abra o sistema no celular com a mesma conta.
4. A movimentação deverá aparecer automaticamente.

## 7. Estratégia contra perda de dados

Use as três camadas juntas:

1. **Supabase** como cópia compartilhada principal.
2. **LocalStorage** como cache offline em cada dispositivo.
3. **Exportação JSON** guardada periodicamente no Google Drive ou outro local seguro.

O aplicativo cria um backup na nuvem semanalmente e mantém até dez versões, mas o JSON externo continua sendo uma proteção independente recomendada.
