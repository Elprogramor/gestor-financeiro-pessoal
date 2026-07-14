# Configurar o login com Google

O projeto já contém o botão e o código de login. Falta apenas habilitar o provedor no Supabase e criar as credenciais no Google Cloud.

## 1. Confira as URLs no Supabase

No Supabase, abra:

`Authentication > URL Configuration`

Em **Site URL**, informe a URL publicada:

```text
https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/
```

Em **Redirect URLs**, adicione:

```text
https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/**
http://localhost:5500/**
http://127.0.0.1:5500/**
```

## 2. Abra a configuração do Google no Supabase

Acesse:

`Authentication > Sign In / Providers > Google`

Deixe essa tela aberta. Ela mostra a **Callback URL** do seu projeto, semelhante a:

```text
https://SEU-PROJETO.supabase.co/auth/v1/callback
```

## 3. Crie o projeto no Google Cloud

1. Entre no Google Cloud Console.
2. Crie ou selecione um projeto.
3. Abra **Google Auth Platform** ou **APIs e serviços**.
4. Configure a tela de consentimento.
5. Escolha o tipo **External** para permitir contas Google comuns.
6. Informe nome do aplicativo e e-mail de suporte.

Durante testes, adicione seu e-mail e o e-mail das pessoas conhecidas como usuários de teste, caso o aplicativo permaneça em modo de teste.

## 4. Crie o cliente OAuth

Em **Credentials**, crie:

`OAuth client ID > Web application`

Em **Authorized JavaScript origins**, coloque apenas a origem, sem o caminho do repositório:

```text
https://SEU-USUARIO.github.io
```

Para testes locais, adicione também:

```text
http://localhost:5500
http://127.0.0.1:5500
```

Em **Authorized redirect URIs**, coloque exatamente a Callback URL mostrada pelo Supabase:

```text
https://SEU-PROJETO.supabase.co/auth/v1/callback
```

Crie a credencial e copie:

- Client ID;
- Client Secret.

## 5. Conclua no Supabase

Volte para o provedor Google no Supabase:

1. Ative o Google.
2. Cole o Client ID.
3. Cole o Client Secret.
4. Salve.

O Client Secret fica somente no painel do Supabase. Ele não deve ser colocado nos arquivos do GitHub.

## 6. Teste

1. Abra o sistema em uma aba anônima.
2. Clique em **Continuar com o Google**.
3. Escolha uma conta.
4. Confirme que o dashboard abre.
5. Cadastre uma movimentação de teste.
6. Entre em outro dispositivo com a mesma conta e confirme a sincronização.
