# Correção da sincronização contínua — versão 2.2.0

Esta versão corrige o ciclo que fazia o sistema sincronizar novamente a cada 700 ms, mesmo sem alterações pendentes.

## Correções aplicadas

- A sincronização automática só é agendada quando existe algo pendente.
- Verificações de Realtime e de segurança em segundo plano não fazem o indicador piscar continuamente.
- Registros antigos sem `updatedAt` são normalizados para não serem reaplicados em todos os ciclos.
- Atualizações recebidas da nuvem preservam a posição de rolagem.
- A página não exibe skeleton durante atualizações silenciosas.
- Formulários, filtros e modais não são interrompidos por uma atualização remota.
- O cache do PWA foi atualizado para `v2.2.0`.

## Como atualizar no GitHub

Substitua no repositório os arquivos:

- `index.html`
- `js/app.js`
- `js/cloud.js`
- `service-worker.js`

Não execute novamente o SQL do Supabase. Seus lançamentos permanecem no banco.

Depois do deploy:

1. Abra o sistema no computador e atualize a página.
2. Feche e abra novamente o PWA ou a aba uma vez para carregar o novo Service Worker.
3. Faça o mesmo no celular.
4. Confirme que o indicador fica em **Sincronizado** e só muda quando houver uma alteração real.
