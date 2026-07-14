/**
 * Configuração pública da aplicação.
 *
 * A Project URL e a Publishable key podem ficar no frontend. A segurança dos
 * dados continua sendo aplicada pelas políticas RLS do Supabase.
 *
 * Nunca coloque aqui Secret key, service_role ou senha do banco.
 */
export const APP_CONFIG = Object.freeze({
  appName: "Fluxo",
  version: "3.0.0",

  // Substitua pelos valores públicos do seu projeto Supabase antes de publicar.
  supabaseUrl: "https://kaxuylohxauezgnxkkru.supabase.co",
  supabasePublishableKey: "sb_publishable_8RopQbxbuMie03H_eIkf-g_OSxh5y66",

  // URL final do GitHub Pages, usada nos logins Google e links de convite.
  // Exemplo: "https://seuusuario.github.io/gestor-financeiro/"
  publicAppUrl: "https://elprogramor.github.io/gestor-financeiro-pessoal/",

  // Em produção, deixe false para que visitantes vejam somente login/cadastro.
  allowLocalMode: false
});

export function hasBundledCloudConfig() {
  return /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(APP_CONFIG.supabaseUrl)
    && !/SEU-PROJETO/i.test(APP_CONFIG.supabaseUrl)
    && APP_CONFIG.supabasePublishableKey.length > 30
    && !/COLE_SUA_CHAVE/i.test(APP_CONFIG.supabasePublishableKey);
}
