/**
 * Camada de interface: páginas operacionais, formulários, modais,
 * confirmações, notificações, calendário e configurações.
 */

import { charts } from "./charts.js";
import { finance } from "./finance.js";
import { goalsService } from "./goals.js";
import { storage } from "./storage.js";
import { cloud } from "./cloud.js";
import {
  addDays, addMonths, clamp, debounce, downloadFile, endOfMonth, escapeHTML,
  EXPENSE_CATEGORIES, formatCurrency, formatDate, formatMonth, formatNumber,
  formatPercent, formatShortDate, getMonthLabel, getProgressColor, GOAL_TYPES,
  ICONS, INCOME_CATEGORIES, monthKey, MONTHLY_GOAL_TYPES, parseDate,
  PAYMENT_METHODS, relativeTimeFromDays, sanitizeImageDataUrl, startOfMonth,
  storageSizeInBytes, toISODate, toNumber
} from "./utils.js";

const pageMeta = {
  dashboard: ["Visão geral", "Dashboard"],
  cashflow: ["Controle financeiro", "Fluxo de caixa"],
  calendar: ["Planejamento", "Calendário financeiro"],
  goals: ["Planejamento", "Objetivos financeiros"],
  debts: ["Planejamento", "Controle de dívidas"],
  "monthly-goals": ["Planejamento", "Metas mensais"],
  stats: ["Análise", "Estatísticas"],
  evolution: ["Análise", "Minha evolução"],
  productivity: ["Análise", "Produtividade financeira"],
  settings: ["Preferências", "Configurações"]
};

class UIService extends EventTarget {
  #cashflowFilters = { period: "month", category: "all", type: "all", search: "", sortBy: "date", sortDirection: "desc" };
  #cashflowPage = 1;
  #calendarDate = startOfMonth(new Date());
  #activeSettingsSection = "profile";

  setPageMeta(route) {
    const [eyebrow, title] = pageMeta[route] || pageMeta.dashboard;
    document.getElementById("page-eyebrow").textContent = eyebrow;
    document.getElementById("page-title").textContent = title;
    document.title = `${title} — Fluxo`;
  }

  renderAuthSetup() {
    return `<div>
      <h1>Proteja seu financeiro</h1>
      <p>Crie uma senha local para impedir a abertura não autorizada neste dispositivo.</p>
      <form id="auth-setup-form" class="stack" autocomplete="off">
        <div class="form-field"><label for="setup-name">Como devemos chamar você?</label><input id="setup-name" class="form-control" name="name" maxlength="60" placeholder="Seu nome" value="${escapeHTML(storage.getSettings().userName)}"></div>
        <div class="form-field"><label for="setup-password">Criar senha</label><div class="password-field"><input id="setup-password" class="form-control" name="password" type="password" minlength="4" maxlength="72" required autocomplete="new-password" placeholder="Mínimo de 4 caracteres"><button class="icon-button" type="button" data-action="toggle-password" aria-label="Exibir senha">${ICONS.info}</button></div></div>
        <div class="form-field"><label for="setup-confirm">Confirmar senha</label><input id="setup-confirm" class="form-control" name="confirm" type="password" minlength="4" maxlength="72" required autocomplete="new-password" placeholder="Repita a senha"></div>
        <button class="button button--primary button--block" type="submit">Criar acesso seguro</button>
      </form>
      <div class="auth-note">${ICONS.lock}<span>A senha é guardada como resumo criptográfico no navegador. Como o projeto não possui servidor, esta proteção é local e não substitui criptografia de banco de dados.</span></div>
    </div>`;
  }

  renderAuthLogin(message = "") {
    const settings = storage.getSettings();
    return `<div>
      ${settings.avatar ? `<img src="${sanitizeImageDataUrl(settings.avatar)}" alt="Avatar" style="width:64px;height:64px;object-fit:cover;border-radius:50%;margin:0 auto 16px;border:1px solid var(--border)">` : ""}
      <h1>Olá, ${escapeHTML(settings.userName || "bem-vindo")}</h1>
      <p>${message || "Digite sua senha para acessar seus dados financeiros."}</p>
      <form id="auth-login-form" class="stack" autocomplete="off">
        <div class="form-field"><label for="login-password">Senha</label><div class="password-field"><input id="login-password" class="form-control" name="password" type="password" required autocomplete="current-password" autofocus placeholder="Digite sua senha"><button class="icon-button" type="button" data-action="toggle-password" aria-label="Exibir senha">${ICONS.info}</button></div></div>
        <button class="button button--primary button--block" type="submit">Entrar</button>
      </form>
      <div class="auth-note">${ICONS.info}<span>Os dados ficam somente neste navegador. Mantenha backups JSON em um local seguro.</span></div>
    </div>`;
  }

  renderCloudSetup(message = "") {
    const config = cloud.getConfig() || {};
    return `<div>
      <h1>Sincronize seus dados</h1>
      <p>${escapeHTML(message || "Conecte um projeto gratuito do Supabase para acessar o mesmo histórico no celular e no computador.")}</p>
      <form id="cloud-config-form" class="stack" autocomplete="off">
        <div class="form-field"><label for="cloud-url">Project URL</label><input id="cloud-url" class="form-control" name="url" type="url" required placeholder="https://seu-projeto.supabase.co" value="${escapeHTML(config.url || "")}"></div>
        <div class="form-field"><label for="cloud-key">Publishable key ou anon key</label><div class="password-field"><input id="cloud-key" class="form-control" name="key" type="password" required autocomplete="off" placeholder="sb_publishable_..." value="${escapeHTML(config.key || "")}"><button class="icon-button" type="button" data-action="toggle-password" aria-label="Exibir chave">${ICONS.info}</button></div></div>
        <button class="button button--primary button--block" type="submit">Conectar ao Supabase</button>
      </form>
      ${cloud.canUseLocalMode() ? '<button class="button button--ghost button--block auth-secondary-action" type="button" data-auth-action="use-local-mode">Continuar somente neste dispositivo</button>' : ""}
      <div class="auth-note">${ICONS.info}<span>Antes de conectar, execute o arquivo <strong>supabase-setup.sql</strong> e a atualização <strong>supabase-upgrade-v3.sql</strong>. Nunca cole uma Secret key ou service_role aqui.</span></div>
    </div>`;
  }

  renderCloudLogin(message = "", email = "") {
    const setupLink = cloud.isBundledConfig() ? "" : '<button type="button" data-auth-action="show-cloud-setup">Alterar conexão</button>';
    return `<div>
      <h1>Acessar seu financeiro</h1>
      <p>${escapeHTML(message || "Entre com sua conta para acessar seus dados em qualquer dispositivo.")}</p>
      <button class="button button--google button--block" type="button" data-auth-action="google-login" aria-label="Entrar com o Google">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.87h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.35Z"/><path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.63-2.42l-3.24-2.51c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.59A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.39 13.9A6 6 0 0 1 6.08 12c0-.66.11-1.3.31-1.9V7.51H3.04A10 10 0 0 0 2 12c0 1.61.38 3.13 1.04 4.49l3.35-2.59Z"/><path fill="#EA4335" d="M12 5.97c1.47 0 2.78.5 3.82 1.49l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.96 5.51l3.35 2.59C7.18 7.73 9.39 5.97 12 5.97Z"/></svg>
        Continuar com o Google
      </button>
      <div class="auth-divider"><span>ou entre com e-mail</span></div>
      <form id="cloud-login-form" class="stack" autocomplete="on">
        <div class="form-field"><label for="cloud-login-email">E-mail</label><input id="cloud-login-email" class="form-control" name="email" type="email" required autocomplete="email" value="${escapeHTML(email)}" placeholder="voce@email.com"></div>
        <div class="form-field"><label for="cloud-login-password">Senha</label><div class="password-field"><input id="cloud-login-password" class="form-control" name="password" type="password" required minlength="6" autocomplete="current-password" placeholder="Sua senha"><button class="icon-button" type="button" data-action="toggle-password" aria-label="Exibir senha">${ICONS.info}</button></div></div>
        <button class="button button--primary button--block" type="submit">Entrar e sincronizar</button>
      </form>
      <div class="auth-links"><button type="button" data-auth-action="show-cloud-register">Criar minha conta</button>${setupLink}</div>
      <div class="auth-note">${ICONS.lock}<span>Cada conta possui dados separados. Convites compartilhados respeitam permissões de edição ou somente leitura.</span></div>
    </div>`;
  }

  renderCloudRegister(message = "", email = "") {
    const setupLink = cloud.isBundledConfig() ? "" : '<button type="button" data-auth-action="show-cloud-setup">Alterar conexão</button>';
    return `<div>
      <h1>Criar conta pessoal</h1>
      <p>${escapeHTML(message || "Crie sua conta individual ou entre com o Google. Seus dados ficam separados dos demais usuários.")}</p>
      <button class="button button--google button--block" type="button" data-auth-action="google-login">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.87h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.35Z"/><path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.63-2.42l-3.24-2.51c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.59A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.39 13.9A6 6 0 0 1 6.08 12c0-.66.11-1.3.31-1.9V7.51H3.04A10 10 0 0 0 2 12c0 1.61.38 3.13 1.04 4.49l3.35-2.59Z"/><path fill="#EA4335" d="M12 5.97c1.47 0 2.78.5 3.82 1.49l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.96 5.51l3.35 2.59C7.18 7.73 9.39 5.97 12 5.97Z"/></svg>
        Criar conta com o Google
      </button>
      <div class="auth-divider"><span>ou use e-mail e senha</span></div>
      <form id="cloud-register-form" class="stack" autocomplete="on">
        <div class="form-field"><label for="cloud-register-name">Seu nome</label><input id="cloud-register-name" class="form-control" name="name" required maxlength="60" value="${escapeHTML(storage.getSettings().userName || "")}" placeholder="Seu nome"></div>
        <div class="form-field"><label for="cloud-register-email">E-mail</label><input id="cloud-register-email" class="form-control" name="email" type="email" required autocomplete="email" value="${escapeHTML(email)}" placeholder="voce@email.com"></div>
        <div class="form-field"><label for="cloud-register-password">Criar senha</label><div class="password-field"><input id="cloud-register-password" class="form-control" name="password" type="password" required minlength="6" maxlength="72" autocomplete="new-password" placeholder="Mínimo de 6 caracteres"><button class="icon-button" type="button" data-action="toggle-password" aria-label="Exibir senha">${ICONS.info}</button></div></div>
        <div class="form-field"><label for="cloud-register-confirm">Confirmar senha</label><input id="cloud-register-confirm" class="form-control" name="confirm" type="password" required minlength="6" maxlength="72" autocomplete="new-password" placeholder="Repita a senha"></div>
        <button class="button button--primary button--block" type="submit">Criar conta e sincronizar</button>
      </form>
      <div class="auth-links"><button type="button" data-auth-action="show-cloud-login">Já tenho uma conta</button>${setupLink}</div>
    </div>`;
  }

  renderCloudConfirmation(email) {
    return `<div class="auth-result">
      <div class="auth-result__icon">${ICONS.check}</div>
      <h1>Confirme seu e-mail</h1>
      <p>Enviamos uma confirmação para <strong>${escapeHTML(email)}</strong>. Depois de confirmar, volte e entre na sua conta.</p>
      <button class="button button--primary button--block" data-auth-action="show-cloud-login" data-email="${escapeHTML(email)}">Ir para o login</button>
      <div class="auth-note">${ICONS.info}<span>Para uso pessoal, você também pode desativar a confirmação de e-mail nas configurações de autenticação do Supabase.</span></div>
    </div>`;
  }

  renderCashflow() {
    charts.destroyAll();
    const settings = storage.getSettings();
    const all = finance.getCashflow();
    const categories = [...new Set(finance.getTransactions().map((item) => item.category))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    const filtered = finance.filterTransactions(this.#cashflowFilters, all);
    const income = filtered.filter((item) => item.type === "income").reduce((total, item) => total + item.value, 0);
    const expenses = filtered.filter((item) => item.type === "expense").reduce((total, item) => total + item.value, 0);
    const html = `
      <div class="page-heading"><div><h2>Fluxo de caixa</h2><p>Visualize todas as entradas e saídas, filtre períodos e acompanhe o saldo após cada movimentação.</p></div><div class="page-heading__actions"><button class="button button--secondary" data-action="export-csv">${ICONS.download}CSV</button><button class="button button--primary" data-action="new-transaction">${ICONS.plus}Nova movimentação</button></div></div>
      <section class="panel">
        <div class="table-summary">
          <div class="table-summary__item"><span>Entradas filtradas</span><strong class="text-success">${formatCurrency(income, settings)}</strong></div>
          <div class="table-summary__item"><span>Saídas filtradas</span><strong class="text-danger">${formatCurrency(expenses, settings)}</strong></div>
          <div class="table-summary__item"><span>Resultado do filtro</span><strong>${formatCurrency(income - expenses, settings)}</strong></div>
        </div>
        <div class="filters-bar">
          <div class="form-field form-field--search"><label for="flow-search">Pesquisar</label><input id="flow-search" class="form-control" type="search" placeholder="Descrição, categoria, cliente…" value="${escapeHTML(this.#cashflowFilters.search)}"></div>
          <div class="form-field"><label for="flow-period">Período</label><select id="flow-period" class="form-control"><option value="all">Todos</option><option value="day">Hoje</option><option value="week">Semana</option><option value="month">Mês</option><option value="year">Ano</option></select></div>
          <div class="form-field"><label for="flow-type">Tipo</label><select id="flow-type" class="form-control"><option value="all">Todos</option><option value="income">Entradas</option><option value="expense">Saídas</option></select></div>
          <div class="form-field"><label for="flow-category">Categoria</label><select id="flow-category" class="form-control"><option value="all">Todas</option>${categories.map((item) => `<option value="${escapeHTML(item)}">${escapeHTML(item)}</option>`).join("")}</select></div>
          <div class="form-field"><label for="flow-sort">Ordenar</label><select id="flow-sort" class="form-control"><option value="date:desc">Mais recentes</option><option value="date:asc">Mais antigas</option><option value="value:desc">Maior valor</option><option value="value:asc">Menor valor</option><option value="category:asc">Categoria A–Z</option></select></div>
        </div>
        <div id="cashflow-table-region">${this.#cashflowTable(filtered, settings)}</div>
      </section>`;

    return {
      html,
      afterRender: () => {
        document.getElementById("flow-period").value = this.#cashflowFilters.period;
        document.getElementById("flow-type").value = this.#cashflowFilters.type;
        document.getElementById("flow-category").value = this.#cashflowFilters.category;
        document.getElementById("flow-sort").value = `${this.#cashflowFilters.sortBy}:${this.#cashflowFilters.sortDirection}`;
        const update = () => {
          const [sortBy, sortDirection] = document.getElementById("flow-sort").value.split(":");
          this.#cashflowFilters = {
            ...this.#cashflowFilters,
            search: document.getElementById("flow-search").value,
            period: document.getElementById("flow-period").value,
            type: document.getElementById("flow-type").value,
            category: document.getElementById("flow-category").value,
            sortBy,
            sortDirection
          };
          this.#cashflowPage = 1;
          this.#updateCashflowTable();
        };
        document.getElementById("flow-search").addEventListener("input", debounce(update, 120));
        ["flow-period", "flow-type", "flow-category", "flow-sort"].forEach((id) => document.getElementById(id).addEventListener("change", update));
      }
    };
  }

  #cashflowTable(filtered, settings) {
    const pageSize = 12;
    const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
    this.#cashflowPage = clamp(this.#cashflowPage, 1, pages);
    const pageItems = filtered.slice((this.#cashflowPage - 1) * pageSize, this.#cashflowPage * pageSize);
    if (!pageItems.length) return `<div class="empty-state"><div class="empty-state__icon">${ICONS.search}</div><h3>Nenhum resultado</h3><p>Ajuste os filtros ou adicione uma nova movimentação.</p><button class="button button--primary" data-action="new-transaction">${ICONS.plus}Adicionar movimentação</button></div>`;
    return `<div class="table-container"><table class="data-table"><thead><tr><th>Movimentação</th><th>Data</th><th>Tipo</th><th>Categoria</th><th>Valor</th><th>Saldo após</th><th></th></tr></thead><tbody>
      ${pageItems.map((item) => `<tr>
        <td><div class="description-cell"><span class="transaction-type ${item.type === "expense" ? "transaction-type--expense" : ""}">${item.type === "income" ? ICONS.income : ICONS.expense}</span><div class="description-cell__text"><strong>${escapeHTML(item.description)}</strong><span>${escapeHTML(item.installmentGroupId ? `Parcela ${item.installmentNumber}/${item.installments}` : item.clientName || item.origin || item.paymentMethod || item.note || "Sem detalhes")}</span></div></div></td>
        <td>${formatShortDate(item.date, settings.locale)}</td>
        <td><span class="badge ${item.type === "income" ? "badge--success" : "badge--danger"}">${item.type === "income" ? "Entrada" : "Saída"}</span></td>
        <td>${escapeHTML(item.category)}</td>
        <td class="amount ${item.type === "income" ? "amount--income" : "amount--expense"}">${item.type === "income" ? "+" : "−"}${formatCurrency(item.value, settings)}</td>
        <td class="balance">${formatCurrency(item.balanceAfter, settings)}</td>
        <td><div class="table-actions"><button class="icon-button" data-action="edit-transaction" data-id="${item.id}" title="Editar">${ICONS.edit}</button><button class="icon-button text-danger" data-action="delete-transaction" data-id="${item.id}" title="Excluir">${ICONS.trash}</button></div></td>
      </tr>`).join("")}
    </tbody></table></div><div class="table-pagination"><span>${filtered.length} resultado(s) • página ${this.#cashflowPage} de ${pages}</span><div class="table-pagination__buttons"><button class="button button--secondary" data-action="cashflow-prev" ${this.#cashflowPage <= 1 ? "disabled" : ""}>Anterior</button><button class="button button--secondary" data-action="cashflow-next" ${this.#cashflowPage >= pages ? "disabled" : ""}>Próxima</button></div></div>`;
  }

  #updateCashflowTable() {
    const region = document.getElementById("cashflow-table-region");
    if (!region) return;
    const filtered = finance.filterTransactions(this.#cashflowFilters, finance.getCashflow());
    region.innerHTML = this.#cashflowTable(filtered, storage.getSettings());
  }

  setGlobalSearch(value) {
    this.#cashflowFilters.search = value || "";
    this.#cashflowFilters.period = "all";
    this.#cashflowPage = 1;
  }

  renderGoals() {
    const settings = storage.getSettings();
    const goals = goalsService.getEnrichedGoals();
    const summary = goalsService.getGoalSummary();
    return {
      html: `<div class="page-heading"><div><h2>Objetivos financeiros</h2><p>Transforme planos em metas mensuráveis, com prazo, progresso e valor restante.</p></div><div class="page-heading__actions"><button class="button button--primary" data-action="new-goal">${ICONS.plus}Novo objetivo</button></div></div>
        <section class="indicator-grid">
          <article class="indicator"><span class="indicator__label">Valor total dos objetivos</span><strong class="indicator__value">${formatCurrency(summary.totalGoalTarget, settings)}</strong><span class="indicator__detail">Soma de todos os valores alvo</span></article>
          <article class="indicator"><span class="indicator__label">Valor já acumulado</span><strong class="indicator__value text-success">${formatCurrency(summary.totalGoalCurrent, settings)}</strong><span class="indicator__detail">Progresso consolidado</span></article>
          <article class="indicator"><span class="indicator__label">Objetivos ativos</span><strong class="indicator__value">${summary.activeGoals}</strong><span class="indicator__detail">Em andamento</span></article>
          <article class="indicator"><span class="indicator__label">Objetivos concluídos</span><strong class="indicator__value">${summary.completedGoals}</strong><span class="indicator__detail">Metas alcançadas</span></article>
        </section>
        <div class="section-heading"><div><h3>Seus objetivos</h3><p>Acompanhe o progresso individual de cada plano.</p></div></div>
        ${goals.length ? `<section class="goal-grid">${goals.map((goal) => this.#goalCard(goal, settings)).join("")}</section>` : this.#empty("target", "Nenhum objetivo criado", "Crie uma reserva, planeje um equipamento ou defina uma meta de faturamento.", "new-goal", "Criar objetivo")}`,
      afterRender: () => requestAnimationFrame(() => document.querySelectorAll("[data-progress]").forEach((bar) => { bar.style.width = `${clamp(Number(bar.dataset.progress), 0, 100)}%`; }))
    };
  }

  #goalCard(goal, settings) {
    return `<article class="goal-card">
      <div class="goal-card__header"><span class="goal-card__icon" style="background:${goal.color}20;color:${goal.color}">${ICONS.target}</span><div class="table-actions"><button class="icon-button" data-action="edit-goal" data-id="${goal.id}" title="Editar">${ICONS.edit}</button><button class="icon-button text-danger" data-action="delete-goal" data-id="${goal.id}" title="Excluir">${ICONS.trash}</button></div></div>
      <h3>${escapeHTML(goal.name)}</h3><div class="goal-card__meta">${escapeHTML(goal.type)} • prazo ${formatDate(goal.deadline, settings.locale)}</div>
      <div class="goal-card__values"><strong>${formatCurrency(goal.currentValue, settings)}</strong><span>de ${formatCurrency(goal.targetValue, settings)}</span></div>
      <div class="progress"><div class="progress__bar" data-progress="${goal.percent}" style="background:${goal.color}"></div></div>
      <div class="goal-card__footer"><span>${formatPercent(goal.percent, settings.locale, 1)}</span><span>${goal.status === "completed" ? "Concluído" : `${formatCurrency(goal.remaining, settings)} restantes`}</span></div>
      <p class="small muted" style="margin:13px 0 0">${escapeHTML(goalsService.getGoalMotivation(goal, settings))}</p>
    </article>`;
  }

  renderDebts() {
    const settings = storage.getSettings();
    const debts = goalsService.getEnrichedDebts();
    const summary = goalsService.getGoalSummary();
    return {
      html: `<div class="page-heading"><div><h2>Controle de dívidas</h2><p>Acompanhe juros, parcelas, total pago e o caminho até a quitação.</p></div><div class="page-heading__actions"><button class="button button--primary" data-action="new-debt">${ICONS.plus}Nova dívida</button></div></div>
        <section class="indicator-grid">
          <article class="indicator"><span class="indicator__label">Valor total com juros</span><strong class="indicator__value">${formatCurrency(summary.totalDebt, settings)}</strong><span class="indicator__detail">Compromissos cadastrados</span></article>
          <article class="indicator"><span class="indicator__label">Já pago</span><strong class="indicator__value text-success">${formatCurrency(summary.debtPaid, settings)}</strong><span class="indicator__detail">Amortização total</span></article>
          <article class="indicator"><span class="indicator__label">Quanto falta</span><strong class="indicator__value text-danger">${formatCurrency(summary.remainingDebt, settings)}</strong><span class="indicator__detail">Saldo das dívidas</span></article>
          <article class="indicator"><span class="indicator__label">Dívidas ativas</span><strong class="indicator__value">${debts.filter((item) => item.status !== "paid").length}</strong><span class="indicator__detail">Ainda em pagamento</span></article>
        </section>
        <div class="section-heading"><div><h3>Dívidas cadastradas</h3><p>Valores calculados com juros compostos mensais informados.</p></div></div>
        ${debts.length ? `<section class="debt-grid">${debts.map((debt) => this.#debtCard(debt, settings)).join("")}</section>` : this.#empty("wallet", "Nenhuma dívida cadastrada", "Adicione suas dívidas para visualizar parcelas, juros e progresso de quitação.", "new-debt", "Cadastrar dívida")}`,
      afterRender: () => requestAnimationFrame(() => document.querySelectorAll("[data-progress]").forEach((bar) => { bar.style.width = `${clamp(Number(bar.dataset.progress), 0, 100)}%`; }))
    };
  }

  #debtCard(debt, settings) {
    const status = debt.status === "paid" ? ["badge--success", "Quitada"] : debt.status === "late" ? ["badge--danger", "Atrasada"] : ["badge--warning", "Ativa"];
    return `<article class="debt-card">
      <div class="debt-card__header"><span class="debt-card__icon">${ICONS.wallet}</span><div class="table-actions"><span class="badge ${status[0]}">${status[1]}</span><button class="icon-button" data-action="edit-debt" data-id="${debt.id}">${ICONS.edit}</button><button class="icon-button text-danger" data-action="delete-debt" data-id="${debt.id}">${ICONS.trash}</button></div></div>
      <h3>${escapeHTML(debt.name)}</h3><div class="debt-card__meta">${debt.installments} parcelas • ${debt.interestRate.toFixed(2)}% a.m.</div>
      <div class="debt-card__values"><strong>${formatCurrency(debt.paidAmount, settings)}</strong><span>de ${formatCurrency(debt.totalValue, settings)}</span></div>
      <div class="progress"><div class="progress__bar" data-progress="${debt.percent}" style="background:${getProgressColor(debt.percent)}"></div></div>
      <div class="debt-card__footer"><span>${formatPercent(debt.percent, settings.locale, 1)} pago</span><span>${debt.installmentsPaid}/${debt.installments} parcelas estimadas</span></div>
      <div class="stack" style="margin-top:14px;gap:6px"><div class="cluster small"><span class="muted">Quanto falta:</span><strong>${formatCurrency(debt.remaining, settings)}</strong></div><div class="cluster small"><span class="muted">Parcela estimada:</span><strong>${formatCurrency(debt.installmentValue, settings)}</strong></div><div class="cluster small"><span class="muted">Próximo vencimento:</span><strong>${debt.status === "paid" ? "—" : formatDate(debt.nextDue, settings.locale)}</strong></div></div>
    </article>`;
  }

  renderMonthlyGoals() {
    const settings = storage.getSettings();
    const month = monthKey(new Date());
    const goals = goalsService.getEnrichedMonthlyGoals(month);
    return {
      html: `<div class="page-heading"><div><h2>Metas mensais</h2><p>Defina objetivos para receita, economia, investimentos e número de clientes.</p></div><div class="page-heading__actions"><button class="button button--primary" data-action="new-monthly-goal">${ICONS.plus}Nova meta</button></div></div>
        <section class="panel"><header class="panel__header"><div><h3 class="panel__title">${formatMonth(new Date(), settings.locale)}</h3><p class="panel__description">A cor e o status mudam automaticamente conforme o progresso.</p></div><span class="badge badge--primary">${goals.length}/4 configuradas</span></header><div class="panel__body">
        ${goals.length ? `<div class="monthly-goal-list">${goals.map((goal) => this.#monthlyGoalCard(goal, settings)).join("")}</div>` : this.#empty("target", "Nenhuma meta para este mês", "Crie metas para acompanhar seu desempenho mensal automaticamente.", "new-monthly-goal", "Criar meta mensal")}
        </div></section>`,
      afterRender: () => requestAnimationFrame(() => document.querySelectorAll("[data-progress]").forEach((bar) => { bar.style.width = `${clamp(Number(bar.dataset.progress), 0, 100)}%`; }))
    };
  }

  #monthlyGoalCard(goal, settings) {
    const statusMap = { completed: ["badge--success", "Concluída"], "on-track": ["badge--primary", "No ritmo"], attention: ["badge--warning", "Atenção"], behind: ["badge--danger", "Abaixo"] };
    const status = statusMap[goal.status];
    const isClients = goal.type === "Clientes";
    return `<article class="panel monthly-goal-card">
      <div class="monthly-goal-card__top"><div class="monthly-goal-card__label"><span class="monthly-goal-card__icon" style="background:${goal.color}20;color:${goal.color}">${goal.type === "Clientes" ? ICONS.users : goal.type === "Receita" ? ICONS.income : ICONS.target}</span><div><strong>${escapeHTML(goal.type)}</strong><span>${goal.month}</span></div></div><div class="table-actions"><span class="badge ${status[0]}">${status[1]}</span><button class="icon-button" data-action="edit-monthly-goal" data-id="${goal.id}">${ICONS.edit}</button><button class="icon-button text-danger" data-action="delete-monthly-goal" data-id="${goal.id}">${ICONS.trash}</button></div></div>
      <div class="monthly-goal-card__values"><strong>${isClients ? formatNumber(goal.actual, settings.locale) : formatCurrency(goal.actual, settings)}</strong><span>meta ${isClients ? formatNumber(goal.value, settings.locale) : formatCurrency(goal.value, settings)}</span></div>
      <div class="progress"><div class="progress__bar" data-progress="${goal.percent}" style="background:${goal.color}"></div></div>
      <div class="goal-card__footer"><span>${formatPercent(goal.percent, settings.locale, 1)}</span><span>${goal.percent >= 100 ? "Meta alcançada" : `${isClients ? formatNumber(goal.remaining, settings.locale) : formatCurrency(goal.remaining, settings)} restantes`}</span></div>
    </article>`;
  }

  renderCalendar() {
    const settings = storage.getSettings();
    const monthStart = startOfMonth(this.#calendarDate);
    const firstWeekday = (monthStart.getDay() + 6) % 7;
    const gridStart = addDays(monthStart, -firstWeekday);
    const events = this.#getCalendarEvents();
    const days = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
    return {
      html: `<div class="page-heading"><div><h2>Calendário financeiro</h2><p>Entradas, saídas, vencimentos, parcelas e objetivos organizados em uma visão mensal.</p></div><div class="page-heading__actions"><button class="button button--primary" data-action="new-transaction">${ICONS.plus}Nova movimentação</button></div></div>
        <section class="panel"><div class="calendar-toolbar"><div class="cluster"><button class="icon-button" data-action="calendar-prev" aria-label="Mês anterior">${ICONS.arrowDown}</button><button class="button button--secondary button--small" data-action="calendar-today">Hoje</button><button class="icon-button" data-action="calendar-next" aria-label="Próximo mês">${ICONS.arrowUp}</button></div><h3>${formatMonth(this.#calendarDate, settings.locale)}</h3><div class="cluster"><span class="badge badge--success">Entradas</span><span class="badge badge--danger">Saídas</span><span class="badge badge--primary">Objetivos</span></div></div>
        <div class="calendar-grid">${["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((day) => `<div class="calendar-weekday">${day}</div>`).join("")}${days.map((date) => this.#calendarDay(date, monthStart, events, settings)).join("")}</div></section>`
    };
  }

  #getCalendarEvents() {
    const transactions = finance.getTransactions().map((item) => ({ date: item.date, type: item.type, label: `${item.type === "income" ? "+" : "−"} ${item.description}`, value: item.value }));
    const goals = goalsService.getGoals().map((goal) => ({ date: goal.deadline, type: "goal", label: `Prazo: ${goal.name}` }));
    const debts = goalsService.getAllDebtSchedule().filter((item) => !item.paid).map((item) => ({ date: item.date, type: "debt", label: `${item.name} ${item.installmentNumber}`, value: item.value }));
    return [...transactions, ...goals, ...debts].reduce((map, event) => {
      (map[event.date] ||= []).push(event);
      return map;
    }, {});
  }

  #calendarDay(date, monthStart, events, settings) {
    const key = toISODate(date);
    const dayEvents = events[key] || [];
    const today = toISODate(new Date()) === key;
    const outside = date.getMonth() !== monthStart.getMonth();
    return `<div class="calendar-day ${outside ? "is-outside" : ""} ${today ? "is-today" : ""}"><span class="calendar-day__number">${date.getDate()}</span>${dayEvents.slice(0, 3).map((event) => `<span class="calendar-event calendar-event--${event.type}" title="${escapeHTML(event.label)}${event.value ? ` • ${formatCurrency(event.value, settings)}` : ""}">${escapeHTML(event.label)}</span>`).join("")}${dayEvents.length > 3 ? `<span class="calendar-more">+${dayEvents.length - 3} eventos</span>` : ""}</div>`;
  }

  renderSettings() {
    const settings = storage.getSettings();
    const usage = storage.getStorageUsage();
    const backups = storage.listBackups();
    const cloudState = cloud.getState();
    const cloudStatusLabels = { synced: "Sincronizado", syncing: "Sincronizando", pending: "Pendente", offline: "Offline", error: "Atenção", "signed-out": "Desconectado", local: "Modo local", setup: "Não configurado" };
    const cloudStatusLabel = cloudStatusLabels[cloudState.status] || cloudState.status;
    const bytesLabel = usage.bytes < 1024 ? `${usage.bytes} B` : usage.bytes < 1024 * 1024 ? `${(usage.bytes / 1024).toFixed(1)} KB` : `${(usage.bytes / 1024 / 1024).toFixed(2)} MB`;
    const roleLabels = { owner: "Proprietário", editor: "Editor", viewer: "Somente leitura" };
    const navigation = [["cloud","Nuvem e sincronização"], ...(cloudState.signedIn ? [["access","Pessoas e acessos"]] : []), ["profile","Perfil"],["appearance","Aparência"],["finance","Financeiro"],["security","Segurança"],["data","Dados e backup"]];
    const accessSection = cloudState.signedIn ? `<section class="panel settings-section" data-settings-panel="access"><h3>Pessoas e acessos</h3><p>Compartilhe este espaço sem compartilhar sua senha. Cada convidado entra com a própria conta.</p>
      <div class="settings-row"><div class="settings-row__label"><strong>Espaço atual</strong><span>${escapeHTML(cloudState.workspace?.name || "Meu financeiro")}</span></div><span class="role-badge role-badge--${escapeHTML(cloudState.role)}">${roleLabels[cloudState.role] || "Membro"}</span></div>
      <div id="access-management-content"><div class="access-loading"><span class="spinner"></span>Carregando acessos…</div></div>
    </section>` : "";
    const html = `<div class="page-heading"><div><h2>Configurações</h2><p>Personalize o sistema, gerencie backups, segurança, moeda e preferências.</p></div></div>
      <div class="settings-layout"><nav class="panel settings-nav">
        ${navigation.map(([id,label]) => `<button data-settings-section="${id}" class="${this.#activeSettingsSection === id ? "is-active" : ""}">${label}</button>`).join("")}
      </nav><div>
        <section class="panel settings-section" data-settings-panel="cloud"><h3>Nuvem e sincronização</h3><p>Acompanhe a conexão entre este dispositivo e o banco compartilhado.</p>
          <div class="settings-row"><div class="settings-row__label"><strong>Conta conectada</strong><span>${cloudState.email ? escapeHTML(cloudState.email) : cloudState.mode === "local" ? "Uso somente local" : "Nenhuma conta conectada"}</span></div><span class="sync-badge sync-badge--${escapeHTML(cloudState.status)}"><i></i>${escapeHTML(cloudStatusLabel)}</span></div>
          <div class="settings-row"><div class="settings-row__label"><strong>Estado da sincronização</strong><span>${escapeHTML(cloudState.message)}${cloudState.pending ? ` • ${cloudState.pending} alteração(ões) pendente(s)` : ""}</span></div><button class="button button--secondary" data-action="sync-now" ${cloudState.signedIn ? "" : "disabled"}>Sincronizar agora</button></div>
          <div class="settings-row"><div class="settings-row__label"><strong>Backup na nuvem</strong><span>Cria uma cópia adicional completa e mantém até dez versões.</span></div><button class="button button--secondary" data-action="cloud-backup" ${cloudState.signedIn ? "" : "disabled"}>Criar backup na nuvem</button></div>
          <div class="settings-row"><div class="settings-row__label"><strong>Sessão</strong><span>Use a mesma conta em todos os seus dispositivos.</span></div><div class="data-actions">${cloudState.signedIn ? '<button class="button button--secondary button--small" data-action="cloud-sign-out">Sair da conta</button>' : ''}${cloudState.bundledConfig ? "" : '<button class="button button--ghost button--small text-danger" data-action="reset-cloud-config">Reconfigurar conexão</button>'}</div></div>
        </section>
        ${accessSection}
        <section class="panel settings-section" data-settings-panel="profile"><h3>Perfil</h3><p>Informações usadas na personalização local do painel.</p>
          <div class="settings-row"><div class="settings-row__label"><strong>Avatar</strong><span>Imagem sincronizada com a conta e mantida no cache local.</span></div><div class="avatar-editor"><img id="settings-avatar-preview" src="${sanitizeImageDataUrl(settings.avatar) || "./assets/images/avatar-placeholder.svg"}" alt="Avatar"><div class="cluster"><button class="button button--secondary button--small" data-action="choose-avatar">Escolher imagem</button>${settings.avatar ? '<button class="button button--ghost button--small text-danger" data-action="remove-avatar">Remover</button>' : ""}</div></div></div>
          <div class="settings-row"><div class="settings-row__label"><strong>Nome do usuário</strong><span>Exibido na barra lateral e sincronizado com a conta.</span></div><input id="setting-user-name" class="form-control" value="${escapeHTML(settings.userName)}" maxlength="60"></div>
        </section>
        <section class="panel settings-section" data-settings-panel="appearance"><h3>Aparência</h3><p>Escolha o tema, cor principal e idioma de formatação.</p>
          <div class="settings-row"><div class="settings-row__label"><strong>Tema</strong><span>O modo sistema acompanha o dispositivo.</span></div><select id="setting-theme" class="form-control"><option value="system">Sistema</option><option value="light">Claro</option><option value="dark">Escuro</option></select></div>
          <div class="settings-row"><div class="settings-row__label"><strong>Cor de destaque</strong><span>Aplicada a botões, gráficos e progresso.</span></div><div class="color-picker-row">${["#635bff","#1769e0","#14966f","#d98516","#d946ef"].map((color) => `<button class="color-swatch ${settings.accentColor === color ? "is-active" : ""}" style="background:${color}" data-action="set-accent" data-color="${color}" aria-label="Usar cor ${color}"></button>`).join("")}</div></div>
          <div class="settings-row"><div class="settings-row__label"><strong>Idioma e região</strong><span>Altera navegação, datas e números principais.</span></div><select id="setting-locale" class="form-control"><option value="pt-BR">Português (Brasil)</option><option value="en-US">English (United States)</option><option value="es-ES">Español</option></select></div>
        </section>
        <section class="panel settings-section" data-settings-panel="finance"><h3>Preferências financeiras</h3><p>Configurações usadas em cálculos e projeções.</p>
          <div class="settings-row"><div class="settings-row__label"><strong>Moeda</strong><span>Formato exibido em todo o sistema.</span></div><select id="setting-currency" class="form-control"><option value="BRL">Real brasileiro (BRL)</option><option value="USD">Dólar americano (USD)</option><option value="EUR">Euro (EUR)</option></select></div>
          <div class="settings-row"><div class="settings-row__label"><strong>Meta mensal</strong><span>Usada no painel Meta e nos indicadores.</span></div><div class="input-prefix"><span>¤</span><input id="setting-target" class="form-control" type="number" min="0" step="0.01" value="${settings.monthlyTarget}"></div></div>
        </section>
        <section class="panel settings-section" data-settings-panel="security"><h3>Segurança</h3><p>Controle a senha da conta e o bloqueio automático por inatividade.</p>
          <div class="settings-row"><div class="settings-row__label"><strong>Alterar senha</strong><span>Atualiza a senha usada para entrar em todos os dispositivos.</span></div><button class="button button--secondary" data-action="change-password">Alterar senha</button></div>
          <div class="settings-row"><div class="settings-row__label"><strong>Bloqueio por inatividade</strong><span>Tempo sem interação antes de solicitar a senha.</span></div><select id="setting-timeout" class="form-control"><option value="5">5 minutos</option><option value="10">10 minutos</option><option value="15">15 minutos</option><option value="30">30 minutos</option><option value="60">1 hora</option><option value="0">Desativado</option></select></div>
        </section>
        <section class="panel settings-section" data-settings-panel="data"><h3>Dados e backup</h3><p>Exporte, importe e proteja seu histórico financeiro.</p>
          <div class="settings-row"><div class="settings-row__label"><strong>Backup automático local</strong><span>Mantém até cinco cópias locais antes de alterações importantes.</span></div><label class="switch"><input id="setting-auto-backup" type="checkbox" ${settings.autoBackup ? "checked" : ""}><span class="switch__slider"></span></label></div>
          <div class="settings-row"><div class="settings-row__label"><strong>Exportação e importação</strong><span>JSON preserva todos os dados; CSV exporta movimentações.</span></div><div class="data-actions"><button class="button button--secondary button--small" data-action="export-json">${ICONS.download}JSON</button><button class="button button--secondary button--small" data-action="import-json">${ICONS.upload}Importar</button><button class="button button--secondary button--small" data-action="export-csv">${ICONS.download}CSV</button><button class="button button--secondary button--small" data-action="print">${ICONS.print}PDF/Imprimir</button></div></div>
          <div class="settings-row"><div class="settings-row__label"><strong>Backups locais</strong><span>${backups.length} cópia(s) disponíveis neste navegador.</span></div><div class="stack">${backups.length ? backups.map((backup) => `<div class="cluster"><span class="small muted">${formatDate(backup.createdAt, settings.locale, { hour: "2-digit", minute: "2-digit" })} • ${escapeHTML(backup.reason)}</span><button class="button button--ghost button--small" data-action="restore-backup" data-id="${backup.id}">Restaurar</button></div>`).join("") : '<span class="small muted">Nenhum backup local criado.</span>'}<button class="button button--secondary button--small" data-action="create-backup">Criar backup agora</button></div></div>
          <div class="settings-row"><div class="settings-row__label"><strong>Armazenamento usado</strong><span>Estimativa considerando limite comum de 5 MB do LocalStorage.</span></div><div class="storage-meter"><div class="storage-meter__labels"><span>${bytesLabel}</span><span>${usage.percent.toFixed(1)}%</span></div><div class="progress"><div class="progress__bar" style="width:${usage.percent}%"></div></div></div></div>
          <div class="settings-row"><div class="settings-row__label"><strong>Dados de demonstração</strong><span>Substitui o conteúdo atual por um histórico fictício para explorar o sistema.</span></div><button class="button button--secondary" data-action="load-demo">Carregar demonstração</button></div>
          <div class="settings-row"><div class="settings-row__label"><strong>Apagar dados financeiros</strong><span>Remove movimentações, metas e configurações, preservando sua conta de acesso.</span></div><button class="button button--danger" data-action="reset-data">Apagar todos os dados</button></div>
        </section>
        <div class="cluster" style="justify-content:flex-end;margin-top:14px"><button class="button button--primary" data-action="save-settings">Salvar configurações</button></div>
      </div></div>`;
    return {
      html,
      afterRender: () => {
        document.getElementById("setting-theme").value = settings.theme;
        document.getElementById("setting-locale").value = settings.locale;
        document.getElementById("setting-currency").value = settings.currency;
        document.getElementById("setting-timeout").value = String(settings.inactivityMinutes);
        this.#applySettingsPanelVisibility();
        if (cloudState.signedIn) this.#loadAccessPanel();
        document.querySelectorAll("[data-settings-section]").forEach((button) => button.addEventListener("click", () => {
          this.#activeSettingsSection = button.dataset.settingsSection;
          document.querySelectorAll("[data-settings-section]").forEach((item) => item.classList.toggle("is-active", item === button));
          this.#applySettingsPanelVisibility();
        }));
      }
    };
  }

  async #loadAccessPanel() {
    const container = document.getElementById("access-management-content");
    if (!container) return;
    const state = cloud.getState();
    if (!cloud.isOwner()) {
      const label = state.role === "editor" ? "Você pode consultar e alterar os dados deste espaço." : "Você pode consultar os dados, mas não pode criar, editar ou excluir informações.";
      container.innerHTML = `<div class="access-info">${ICONS.lock}<div><strong>Acesso concedido por convite</strong><p>${label} Somente o proprietário pode convidar ou remover pessoas.</p></div></div>`;
      return;
    }

    try {
      const [members, invites] = await Promise.all([cloud.listMembers(), cloud.listPendingInvites()]);
      const memberRows = members.map((member) => {
        const isOwner = member.role === "owner";
        const roleControl = isOwner
          ? '<span class="role-badge role-badge--owner">Proprietário</span>'
          : `<div class="member-actions"><select class="form-control form-control--small" data-member-role="${member.member_user_id}"><option value="editor" ${member.role === "editor" ? "selected" : ""}>Editor</option><option value="viewer" ${member.role === "viewer" ? "selected" : ""}>Somente leitura</option></select><button class="button button--secondary button--small" data-action="update-member-role" data-id="${member.member_user_id}">Salvar</button><button class="button button--ghost button--small text-danger" data-action="remove-member" data-id="${member.member_user_id}">Remover</button></div>`;
        return `<div class="access-person"><div class="access-avatar">${escapeHTML((member.display_name || member.email || "?").slice(0, 1).toUpperCase())}</div><div class="access-person__identity"><strong>${escapeHTML(member.display_name || "Usuário")}</strong><span>${escapeHTML(member.email || "")}</span></div>${roleControl}</div>`;
      }).join("");
      const inviteRows = invites.length ? invites.map((invite) => `<div class="access-invite"><div><strong>${escapeHTML(invite.email)}</strong><span>${invite.role === "editor" ? "Pode editar" : "Somente leitura"} • expira em ${formatDate(invite.expires_at, storage.getSettings().locale)}</span></div><div class="data-actions"><button class="button button--ghost button--small" data-action="copy-invite" data-link="${escapeHTML(invite.link)}">Copiar link</button><button class="button button--ghost button--small text-danger" data-action="cancel-invite" data-id="${invite.id}">Cancelar</button></div></div>`).join("") : '<p class="small muted">Nenhum convite pendente.</p>';

      container.innerHTML = `<div class="invite-box">
        <div><h4>Convidar uma pessoa</h4><p>Ela entrará com o próprio e-mail, senha ou Google. O convite não dá acesso à sua conta pessoal.</p></div>
        <div class="invite-form"><input id="invite-email" class="form-control" type="email" placeholder="pessoa@email.com" autocomplete="email"><select id="invite-role" class="form-control"><option value="editor">Pode visualizar e editar</option><option value="viewer">Somente visualizar</option></select><button class="button button--primary" data-action="create-invite">Criar convite</button></div>
        <div id="invite-created-result"></div>
      </div>
      <div class="access-group"><div class="access-group__heading"><h4>Pessoas com acesso</h4><span>${members.length} pessoa(s)</span></div><div class="access-list">${memberRows}</div></div>
      <div class="access-group"><div class="access-group__heading"><h4>Convites pendentes</h4><span>${invites.length}</span></div><div class="access-list">${inviteRows}</div></div>`;
    } catch (error) {
      container.innerHTML = `<div class="access-info access-info--error">${ICONS.info}<div><strong>Não foi possível carregar os acessos</strong><p>${escapeHTML(error.message || "Verifique se a atualização SQL v3 foi executada.")}</p></div></div>`;
    }
  }

  async #createInvite() {
    const email = document.getElementById("invite-email")?.value.trim();
    const role = document.getElementById("invite-role")?.value;
    if (!email) return this.toast("Informe o e-mail da pessoa convidada.", "error");
    try {
      const invite = await cloud.createInvite({ email, role });
      const result = document.getElementById("invite-created-result");
      if (result) result.innerHTML = `<div class="invite-result"><div><strong>Convite criado para ${escapeHTML(invite.email)}</strong><p>Envie este link. Ele expira automaticamente e só funciona para o e-mail convidado.</p></div><div class="invite-link-row"><input class="form-control" readonly value="${escapeHTML(invite.link)}"><button class="button button--secondary button--small" data-action="copy-invite" data-link="${escapeHTML(invite.link)}">Copiar</button><button class="button button--secondary button--small" data-action="share-invite" data-link="${escapeHTML(invite.link)}" data-email="${escapeHTML(invite.email)}">Compartilhar</button><button class="button button--ghost button--small" data-action="email-invite" data-link="${escapeHTML(invite.link)}" data-email="${escapeHTML(invite.email)}">E-mail</button></div></div>`;
      this.toast("Convite criado com segurança.");
    } catch (error) {
      this.toast(error.message || "Não foi possível criar o convite.", "error");
    }
  }

  async #copyInvite(link) {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      this.toast("Link do convite copiado.");
    } catch {
      const input = document.createElement("textarea");
      input.value = link;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
      this.toast("Link do convite copiado.");
    }
  }

  async #shareInvite(link, email) {
    const text = `Você recebeu acesso a um espaço financeiro no Fluxo. Entre com ${email} para aceitar: ${link}`;
    if (navigator.share) {
      try { await navigator.share({ title: "Convite para o Fluxo", text, url: link }); return; }
      catch (error) { if (error?.name === "AbortError") return; }
    }
    await this.#copyInvite(link);
  }

  #emailInvite(link, email) {
    const subject = encodeURIComponent("Convite para acessar um espaço financeiro no Fluxo");
    const body = encodeURIComponent(`Olá! Você recebeu acesso a um espaço financeiro no Fluxo.\n\nEntre usando este mesmo e-mail (${email}) e abra o link:\n${link}`);
    location.href = `mailto:${encodeURIComponent(email)}?subject=${subject}&body=${body}`;
  }

  #applySettingsPanelVisibility() {
    document.querySelectorAll("[data-settings-panel]").forEach((panel) => panel.classList.toggle("is-hidden", panel.dataset.settingsPanel !== this.#activeSettingsSection));
  }

  async handleAction(action, element) {
    const id = element?.dataset?.id;
    const writeActions = new Set([
      "new-transaction", "new-income", "new-expense", "edit-transaction", "delete-transaction",
      "new-goal", "edit-goal", "delete-goal", "new-debt", "edit-debt", "delete-debt",
      "new-monthly-goal", "edit-monthly-goal", "delete-monthly-goal", "import-json",
      "choose-avatar", "remove-avatar", "set-accent", "save-settings", "cloud-backup",
      "load-demo", "reset-data", "restore-backup"
    ]);
    if (cloud.isCloudMode() && cloud.getState().signedIn && !cloud.canEdit() && writeActions.has(action)) {
      return this.toast("Este acesso é somente para visualização.", "warning");
    }
    switch (action) {
      case "new-transaction": return this.openTransactionModal();
      case "new-income": return this.openTransactionModal(null, "income");
      case "new-expense": return this.openTransactionModal(null, "expense");
      case "edit-transaction": return this.openTransactionModal(finance.getTransactions().find((item) => item.id === id));
      case "delete-transaction": return this.#deleteTransaction(id);
      case "new-goal": return this.openGoalModal();
      case "edit-goal": return this.openGoalModal(goalsService.getGoals().find((item) => item.id === id));
      case "delete-goal": return this.#deleteRecord("goal", id);
      case "new-debt": return this.openDebtModal();
      case "edit-debt": return this.openDebtModal(goalsService.getDebts().find((item) => item.id === id));
      case "delete-debt": return this.#deleteRecord("debt", id);
      case "new-monthly-goal": return this.openMonthlyGoalModal();
      case "edit-monthly-goal": return this.openMonthlyGoalModal(goalsService.getMonthlyGoals().find((item) => item.id === id));
      case "delete-monthly-goal": return this.#deleteRecord("monthly-goal", id);
      case "cashflow-prev": this.#cashflowPage -= 1; return this.#updateCashflowTable();
      case "cashflow-next": this.#cashflowPage += 1; return this.#updateCashflowTable();
      case "calendar-prev": this.#calendarDate = addMonths(this.#calendarDate, -1); return this.#emitRefresh();
      case "calendar-next": this.#calendarDate = addMonths(this.#calendarDate, 1); return this.#emitRefresh();
      case "calendar-today": this.#calendarDate = startOfMonth(new Date()); return this.#emitRefresh();
      case "export-json": return this.exportJSON();
      case "import-json": return document.getElementById("json-import-input").click();
      case "export-csv": return this.exportCSV();
      case "print": return window.print();
      case "choose-avatar": return document.getElementById("avatar-input").click();
      case "remove-avatar": storage.setSettings({ avatar: "" }); this.toast("Avatar removido."); return this.#emitRefresh();
      case "set-accent": storage.setSettings({ accentColor: element.dataset.color }); this.#emit("ui:settings-changed"); return this.#emitRefresh();
      case "save-settings": return this.saveSettings();
      case "change-password": return this.openPasswordModal();
      case "sync-now": { const ok = await cloud.syncNow(); this.toast(ok ? "Sincronização concluída." : "Não foi possível sincronizar agora.", ok ? "success" : "warning"); return this.#emitRefresh(); }
      case "cloud-backup": { try { await cloud.createCloudBackup("manual"); this.toast("Backup na nuvem criado."); } catch (error) { this.toast(error.message, "error"); } return this.#emitRefresh(); }
      case "cloud-sign-out": return cloud.signOut();
      case "reset-cloud-config": return this.#resetCloudConfiguration();
      case "create-invite": return this.#createInvite();
      case "copy-invite": return this.#copyInvite(element.dataset.link);
      case "share-invite": return this.#shareInvite(element.dataset.link, element.dataset.email);
      case "email-invite": return this.#emailInvite(element.dataset.link, element.dataset.email);
      case "cancel-invite": { try { await cloud.cancelInvite(id); this.toast("Convite cancelado."); await this.#loadAccessPanel(); } catch (error) { this.toast(error.message, "error"); } return; }
      case "update-member-role": { try { const role = document.querySelector(`[data-member-role="${id}"]`)?.value; await cloud.updateMemberRole(id, role); this.toast("Permissão atualizada."); await this.#loadAccessPanel(); } catch (error) { this.toast(error.message, "error"); } return; }
      case "remove-member": { if (!await this.confirm("Remover acesso", "Esta pessoa deixará de acessar este espaço financeiro.", "Remover")) return; try { await cloud.removeMember(id); this.toast("Acesso removido."); await this.#loadAccessPanel(); } catch (error) { this.toast(error.message, "error"); } return; }
      case "create-backup": storage.createBackup("manual"); this.toast("Backup local criado."); return this.#emitRefresh();
      case "restore-backup": return this.#restoreBackup(id);
      case "load-demo": return this.#loadDemo();
      case "reset-data": return this.#resetData();
      case "toggle-password": return this.togglePassword(element);
      default: return undefined;
    }
  }

  async #resetCloudConfiguration() {
    if (!await this.confirm("Reconfigurar conexão", "A cópia local será preservada, mas será necessário informar novamente a URL, a chave pública e entrar na conta.", "Reconfigurar")) return;
    await cloud.resetConfiguration();
    this.#emit("ui:auth-reset");
  }

  async #deleteTransaction(id) {
    const transaction = finance.getTransactions().find((item) => item.id === id);
    if (!transaction) return;
    const groupMessage = transaction.installmentGroupId ? " Esta é uma parcela; as demais permanecerão cadastradas." : "";
    const confirmed = await this.confirm("Excluir movimentação", `Deseja excluir “${transaction.description}”?${groupMessage}`, "Excluir");
    if (!confirmed) return;
    finance.deleteTransaction(id);
    this.toast("Movimentação excluída.");
    this.#emitRefresh();
  }

  async #deleteRecord(type, id) {
    const configs = {
      goal: [goalsService.getGoals(), "objetivo", () => goalsService.deleteGoal(id)],
      debt: [goalsService.getDebts(), "dívida", () => goalsService.deleteDebt(id)],
      "monthly-goal": [goalsService.getMonthlyGoals(), "meta mensal", () => goalsService.deleteMonthlyGoal(id)]
    };
    const [collection, label, remove] = configs[type];
    const item = collection.find((record) => record.id === id);
    if (!item) return;
    if (await this.confirm(`Excluir ${label}`, `Deseja excluir “${item.name || item.type}”?`, "Excluir")) {
      remove();
      this.toast(`${label[0].toUpperCase()}${label.slice(1)} excluída.`);
      this.#emitRefresh();
    }
  }

  #empty(icon, title, description, action, label) {
    return `<div class="panel empty-state"><div class="empty-state__icon">${ICONS[icon] || ICONS.info}</div><h3>${title}</h3><p>${description}</p><button class="button button--primary" data-action="${action}">${ICONS.plus}${label}</button></div>`;
  }

  openTransactionModal(transaction = null, preferredType = "income") {
    const editing = Boolean(transaction);
    const type = transaction?.type || preferredType;
    const settings = storage.getSettings();
    const categories = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    const modal = `<div class="modal-backdrop" data-close-modal></div><section class="modal" role="dialog" aria-modal="true"><button class="modal__close icon-button" data-close-modal>${ICONS.close}</button>
      <header class="modal__header"><h2>${editing ? "Editar movimentação" : "Nova movimentação"}</h2><p>Registre uma entrada ou saída no seu fluxo financeiro.</p></header>
      <form id="transaction-form">
        <input type="hidden" name="id" value="${transaction?.id || ""}">
        <div class="form-field form-field--full" style="margin-bottom:14px"><label>Tipo</label><div class="segmented-control"><input id="transaction-income" name="type" value="income" type="radio" ${type === "income" ? "checked" : ""}><label for="transaction-income">${ICONS.income}Entrada</label><input id="transaction-expense" name="type" value="expense" type="radio" ${type === "expense" ? "checked" : ""}><label for="transaction-expense">${ICONS.expense}Saída</label></div></div>
        <div class="form-grid">
          <div class="form-field"><label for="transaction-date">Data</label><input id="transaction-date" class="form-control" name="date" type="date" required value="${transaction?.date || toISODate(new Date())}"></div>
          <div class="form-field"><label for="transaction-value">Valor</label><div class="input-prefix"><span>${settings.currency === "BRL" ? "R$" : settings.currency}</span><input id="transaction-value" class="form-control" name="value" type="number" min="0.01" step="0.01" required value="${transaction?.value || ""}" placeholder="0,00"></div></div>
          <div class="form-field"><label for="transaction-category">Categoria</label><select id="transaction-category" class="form-control" name="category" required>${categories.map((item) => `<option value="${item}" ${transaction?.category === item ? "selected" : ""}>${item}</option>`).join("")}</select></div>
          <div class="form-field is-hidden" id="custom-category-field"><label for="transaction-custom-category">Categoria personalizada</label><input id="transaction-custom-category" class="form-control" name="customCategory" maxlength="40" placeholder="Informe a categoria"></div>
          <div class="form-field form-field--full"><label for="transaction-description">${type === "income" ? "Origem/descrição" : "Descrição"}</label><input id="transaction-description" class="form-control" name="description" required maxlength="100" value="${escapeHTML(transaction?.description || "")}" placeholder="Ex.: Gestão de redes sociais"></div>
          <div class="form-field income-only"><label for="transaction-origin">Origem</label><select id="transaction-origin" class="form-control" name="origin">${INCOME_CATEGORIES.map((item) => `<option value="${item}" ${(transaction?.origin || transaction?.category) === item ? "selected" : ""}>${item}</option>`).join("")}</select></div>
          <div class="form-field income-only"><label for="transaction-client">Cliente <span>opcional</span></label><input id="transaction-client" class="form-control" name="clientName" maxlength="80" value="${escapeHTML(transaction?.clientName || "")}" placeholder="Nome do cliente"></div>
          <div class="form-field expense-only"><label for="transaction-payment">Forma de pagamento</label><select id="transaction-payment" class="form-control" name="paymentMethod">${PAYMENT_METHODS.map((item) => `<option value="${item}" ${transaction?.paymentMethod === item ? "selected" : ""}>${item}</option>`).join("")}</select></div>
          <div class="form-field"><label for="transaction-status">Status</label><select id="transaction-status" class="form-control" name="status"></select></div>
          <div class="form-field expense-only form-field--full"><label class="cluster" style="justify-content:flex-start"><input id="transaction-installment" name="isInstallment" type="checkbox" ${transaction?.isInstallment ? "checked" : ""} ${editing ? "disabled" : ""}> Compra parcelada</label><span class="form-help">Ao salvar, cada parcela será criada na data correspondente.</span></div>
          <div class="form-field expense-only is-hidden" id="installments-field"><label for="transaction-installments">Quantidade de parcelas</label><input id="transaction-installments" class="form-control" name="installments" type="number" min="2" max="120" value="${transaction?.installments || 2}"></div>
          <div class="form-field form-field--full"><label for="transaction-note">Observação <span>opcional</span></label><textarea id="transaction-note" class="form-control" name="note" maxlength="300" placeholder="Detalhes adicionais…">${escapeHTML(transaction?.note || "")}</textarea></div>
        </div>
        <div class="modal__actions"><button type="button" class="button button--secondary" data-close-modal>Cancelar</button><button type="submit" class="button button--primary">${editing ? "Salvar alterações" : "Adicionar movimentação"}</button></div>
      </form></section>`;
    this.openModal(modal);
    this.#bindTransactionForm(transaction);
  }

  #bindTransactionForm(existing) {
    const form = document.getElementById("transaction-form");
    const category = form.elements.category;
    const customField = document.getElementById("custom-category-field");
    const installment = form.elements.isInstallment;
    const installmentField = document.getElementById("installments-field");
    const syncType = () => {
      const type = new FormData(form).get("type");
      const categories = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
      const current = category.value;
      category.innerHTML = categories.map((item) => `<option value="${item}">${item}</option>`).join("");
      category.value = categories.includes(current) ? current : categories[0];
      form.querySelectorAll(".income-only").forEach((item) => item.classList.toggle("is-hidden", type !== "income"));
      form.querySelectorAll(".expense-only").forEach((item) => item.classList.toggle("is-hidden", type !== "expense"));
      const status = form.elements.status;
      status.innerHTML = type === "income" ? '<option value="received">Recebido</option><option value="pending">Pendente</option>' : '<option value="paid">Pago</option><option value="pending">Pendente</option>';
      status.value = existing?.status || (type === "income" ? "received" : "paid");
      form.querySelector("label[for='transaction-description']").textContent = type === "income" ? "Origem/descrição" : "Descrição";
      syncCategory();
      syncInstallment();
    };
    const syncCategory = () => customField.classList.toggle("is-hidden", category.value !== "Outros");
    const syncInstallment = () => installmentField.classList.toggle("is-hidden", !installment?.checked || form.querySelector("input[name='type']:checked").value !== "expense");
    form.querySelectorAll("input[name='type']").forEach((input) => input.addEventListener("change", syncType));
    category.addEventListener("change", syncCategory);
    installment?.addEventListener("change", syncInstallment);
    syncType();
    if (existing?.category && !(existing.type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).includes(existing.category)) {
      category.value = "Outros";
      form.elements.customCategory.value = existing.category;
      syncCategory();
    }
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      data.isInstallment = Boolean(form.elements.isInstallment?.checked);
      data.category = data.category === "Outros" && data.customCategory?.trim() ? data.customCategory.trim() : data.category;
      try {
        if (existing) finance.updateTransaction(existing.id, data);
        else finance.createTransaction(data);
        this.closeModal();
        this.toast(existing ? "Movimentação atualizada." : data.isInstallment ? "Parcelas adicionadas ao fluxo." : "Movimentação adicionada.");
        this.#emitRefresh();
      } catch (error) { this.toast(error.message, "error"); }
    });
  }

  openGoalModal(goal = null) {
    const settings = storage.getSettings();
    this.openModal(`<div class="modal-backdrop" data-close-modal></div><section class="modal" role="dialog" aria-modal="true"><button class="modal__close icon-button" data-close-modal>${ICONS.close}</button><header class="modal__header"><h2>${goal ? "Editar objetivo" : "Novo objetivo financeiro"}</h2><p>Defina valor alvo, progresso atual e prazo.</p></header><form id="goal-form"><div class="form-grid">
      <div class="form-field form-field--full"><label for="goal-name">Nome</label><input id="goal-name" class="form-control" name="name" required maxlength="80" value="${escapeHTML(goal?.name || "")}" placeholder="Ex.: Reserva de emergência"></div>
      <div class="form-field"><label for="goal-type">Tipo</label><select id="goal-type" class="form-control" name="type">${GOAL_TYPES.map((item) => `<option value="${item}" ${goal?.type === item ? "selected" : ""}>${item}</option>`).join("")}</select></div>
      <div class="form-field"><label for="goal-deadline">Data limite</label><input id="goal-deadline" class="form-control" name="deadline" type="date" required value="${goal?.deadline || toISODate(addMonths(new Date(), 6))}"></div>
      <div class="form-field"><label for="goal-target">Valor alvo</label><div class="input-prefix"><span>${settings.currency}</span><input id="goal-target" class="form-control" name="targetValue" type="number" min="0.01" step="0.01" required value="${goal?.targetValue || ""}"></div></div>
      <div class="form-field"><label for="goal-current">Valor atual</label><div class="input-prefix"><span>${settings.currency}</span><input id="goal-current" class="form-control" name="currentValue" type="number" min="0" step="0.01" value="${goal?.currentValue || 0}"></div></div>
      <div class="form-field"><label for="goal-color">Cor</label><input id="goal-color" class="form-control" name="color" type="color" value="${goal?.color || settings.accentColor}"></div>
      <div class="form-field form-field--full"><label for="goal-note">Observação <span>opcional</span></label><textarea id="goal-note" class="form-control" name="note">${escapeHTML(goal?.note || "")}</textarea></div>
      </div><div class="modal__actions"><button type="button" class="button button--secondary" data-close-modal>Cancelar</button><button class="button button--primary" type="submit">Salvar objetivo</button></div></form></section>`);
    document.getElementById("goal-form").addEventListener("submit", (event) => {
      event.preventDefault();
      try { goalsService.saveGoal({ ...Object.fromEntries(new FormData(event.currentTarget)), id: goal?.id }); this.closeModal(); this.toast("Objetivo salvo."); this.#emitRefresh(); }
      catch (error) { this.toast(error.message, "error"); }
    });
  }

  openDebtModal(debt = null) {
    const settings = storage.getSettings();
    this.openModal(`<div class="modal-backdrop" data-close-modal></div><section class="modal" role="dialog" aria-modal="true"><button class="modal__close icon-button" data-close-modal>${ICONS.close}</button><header class="modal__header"><h2>${debt ? "Editar dívida" : "Nova dívida"}</h2><p>Informe as condições para calcular o total com juros e o progresso.</p></header><form id="debt-form"><div class="form-grid">
      <div class="form-field form-field--full"><label for="debt-name">Nome da dívida</label><input id="debt-name" class="form-control" name="name" required maxlength="90" value="${escapeHTML(debt?.name || "")}" placeholder="Ex.: Parcelamento do notebook"></div>
      <div class="form-field"><label for="debt-value">Valor principal</label><div class="input-prefix"><span>${settings.currency}</span><input id="debt-value" class="form-control" name="principalValue" type="number" min="0.01" step="0.01" required value="${debt?.principalValue || ""}"></div></div>
      <div class="form-field"><label for="debt-paid">Valor já pago</label><div class="input-prefix"><span>${settings.currency}</span><input id="debt-paid" class="form-control" name="paidAmount" type="number" min="0" step="0.01" value="${debt?.paidAmount || 0}"></div></div>
      <div class="form-field"><label for="debt-installments">Parcelas</label><input id="debt-installments" class="form-control" name="installments" type="number" min="1" max="240" required value="${debt?.installments || 1}"></div>
      <div class="form-field"><label for="debt-interest">Juros ao mês (%)</label><input id="debt-interest" class="form-control" name="interestRate" type="number" min="0" step="0.01" value="${debt?.interestRate || 0}"></div>
      <div class="form-field"><label for="debt-start">Data inicial</label><input id="debt-start" class="form-control" name="startDate" type="date" required value="${debt?.startDate || toISODate(new Date())}"></div>
      <div class="form-field"><label for="debt-due">Dia do vencimento</label><input id="debt-due" class="form-control" name="dueDay" type="number" min="1" max="31" value="${debt?.dueDay || 10}"></div>
      <div class="form-field"><label for="debt-status">Status</label><select id="debt-status" class="form-control" name="status"><option value="active" ${debt?.status === "active" ? "selected" : ""}>Ativa</option><option value="late" ${debt?.status === "late" ? "selected" : ""}>Atrasada</option><option value="paid" ${debt?.status === "paid" ? "selected" : ""}>Quitada</option></select></div>
      <div class="form-field form-field--full"><label for="debt-note">Observação <span>opcional</span></label><textarea id="debt-note" class="form-control" name="note">${escapeHTML(debt?.note || "")}</textarea></div>
      </div><div class="modal__actions"><button type="button" class="button button--secondary" data-close-modal>Cancelar</button><button class="button button--primary" type="submit">Salvar dívida</button></div></form></section>`);
    document.getElementById("debt-form").addEventListener("submit", (event) => {
      event.preventDefault();
      try { goalsService.saveDebt({ ...Object.fromEntries(new FormData(event.currentTarget)), id: debt?.id }); this.closeModal(); this.toast("Dívida salva."); this.#emitRefresh(); }
      catch (error) { this.toast(error.message, "error"); }
    });
  }

  openMonthlyGoalModal(goal = null) {
    this.openModal(`<div class="modal-backdrop" data-close-modal></div><section class="modal" role="dialog" aria-modal="true"><button class="modal__close icon-button" data-close-modal>${ICONS.close}</button><header class="modal__header"><h2>${goal ? "Editar meta mensal" : "Nova meta mensal"}</h2><p>O progresso será calculado automaticamente a partir das movimentações.</p></header><form id="monthly-goal-form"><div class="form-grid">
      <div class="form-field"><label for="monthly-goal-type">Tipo</label><select id="monthly-goal-type" class="form-control" name="type">${MONTHLY_GOAL_TYPES.map((item) => `<option value="${item}" ${goal?.type === item ? "selected" : ""}>${item}</option>`).join("")}</select></div>
      <div class="form-field"><label for="monthly-goal-month">Mês</label><input id="monthly-goal-month" class="form-control" name="month" type="month" value="${goal?.month || monthKey(new Date())}"></div>
      <div class="form-field"><label for="monthly-goal-value">Valor/meta</label><input id="monthly-goal-value" class="form-control" name="value" type="number" min="1" step="0.01" required value="${goal?.value || ""}"></div>
      <div class="form-field"><label for="monthly-goal-color">Cor dinâmica</label><input id="monthly-goal-color" class="form-control" name="color" type="color" value="${goal?.color || storage.getSettings().accentColor}"></div>
      </div><div class="modal__actions"><button type="button" class="button button--secondary" data-close-modal>Cancelar</button><button class="button button--primary" type="submit">Salvar meta</button></div></form></section>`);
    document.getElementById("monthly-goal-form").addEventListener("submit", (event) => {
      event.preventDefault();
      try { goalsService.saveMonthlyGoal({ ...Object.fromEntries(new FormData(event.currentTarget)), id: goal?.id }); this.closeModal(); this.toast("Meta mensal salva."); this.#emitRefresh(); }
      catch (error) { this.toast(error.message, "error"); }
    });
  }

  openPasswordModal() {
    this.openModal(`<div class="modal-backdrop" data-close-modal></div><section class="modal modal--small" role="dialog" aria-modal="true"><button class="modal__close icon-button" data-close-modal>${ICONS.close}</button><header class="modal__header"><h2>Alterar senha</h2><p>Confirme a senha atual e escolha uma nova.</p></header><form id="password-form" class="stack"><div class="form-field"><label>Senha atual</label><input class="form-control" name="current" type="password" required></div><div class="form-field"><label>Nova senha</label><input class="form-control" name="next" type="password" minlength="4" required></div><div class="form-field"><label>Confirmar nova senha</label><input class="form-control" name="confirm" type="password" minlength="4" required></div><div class="modal__actions"><button type="button" class="button button--secondary" data-close-modal>Cancelar</button><button class="button button--primary" type="submit">Alterar senha</button></div></form></section>`);
    document.getElementById("password-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.currentTarget));
      if (data.next !== data.confirm) return this.toast("A confirmação da nova senha não confere.", "error");
      this.#emit("ui:change-password", data);
    });
  }

  saveSettings() {
    const next = {
      userName: document.getElementById("setting-user-name")?.value.trim() || "Meu financeiro",
      theme: document.getElementById("setting-theme")?.value || "system",
      locale: document.getElementById("setting-locale")?.value || "pt-BR",
      currency: document.getElementById("setting-currency")?.value || "BRL",
      monthlyTarget: Math.max(0, toNumber(document.getElementById("setting-target")?.value, 7000)),
      inactivityMinutes: Math.max(0, toNumber(document.getElementById("setting-timeout")?.value, 15)),
      autoBackup: Boolean(document.getElementById("setting-auto-backup")?.checked)
    };
    storage.setSettings(next);
    this.toast("Configurações salvas.");
    this.#emit("ui:settings-changed", next);
    this.#emitRefresh();
  }

  exportJSON() {
    const data = storage.exportData();
    downloadFile(`fluxo-backup-${toISODate(new Date())}.json`, JSON.stringify(data, null, 2), "application/json;charset=utf-8");
    this.toast("Backup JSON exportado.");
  }

  exportCSV() {
    const csv = `\uFEFF${finance.toCSV()}`;
    downloadFile(`fluxo-movimentacoes-${toISODate(new Date())}.csv`, csv, "text/csv;charset=utf-8");
    this.toast("Arquivo CSV exportado.");
  }

  async importJSONFile(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      if (await this.confirm("Importar backup", "A importação substituirá os dados atuais. Um backup local será criado antes.", "Importar")) {
        storage.importData(payload);
        this.toast("Backup importado com sucesso.");
        this.#emit("ui:settings-changed");
        this.#emitRefresh();
      }
    } catch (error) { this.toast(error.message || "Não foi possível importar o arquivo.", "error"); }
    finally { document.getElementById("json-import-input").value = ""; }
  }

  async setAvatarFromFile(file) {
    if (!file) return;
    if (file.size > 1024 * 1024) return this.toast("Escolha uma imagem de até 1 MB.", "error");
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = sanitizeImageDataUrl(reader.result);
      if (!dataUrl) return this.toast("Formato de imagem inválido.", "error");
      storage.setSettings({ avatar: dataUrl });
      this.toast("Avatar atualizado.");
      this.#emitRefresh();
    };
    reader.readAsDataURL(file);
  }

  async #restoreBackup(id) {
    if (await this.confirm("Restaurar backup", "Os dados atuais serão substituídos pela cópia selecionada.", "Restaurar")) {
      try { storage.restoreBackup(id); this.toast("Backup restaurado."); this.#emit("ui:settings-changed"); this.#emitRefresh(); }
      catch (error) { this.toast(error.message, "error"); }
    }
  }

  async #loadDemo() {
    if (await this.confirm("Carregar demonstração", "O conteúdo atual será substituído por dados fictícios. Um backup local poderá ser criado antes.", "Carregar")) {
      storage.loadDemoData();
      this.toast("Dados de demonstração carregados.");
      this.#emitRefresh();
    }
  }

  async #resetData() {
    if (await this.confirm("Apagar todos os dados", "Esta ação remove movimentações, objetivos, dívidas e preferências. Sua conta de acesso será preservada.", "Apagar tudo")) {
      storage.clearAll({ preserveAuth: true });
      this.toast("Dados financeiros apagados.", "warning");
      this.#emit("ui:settings-changed");
      this.#emitRefresh();
    }
  }

  togglePassword(button) {
    const input = button.parentElement.querySelector("input");
    if (!input) return;
    input.type = input.type === "password" ? "text" : "password";
    button.setAttribute("aria-label", input.type === "password" ? "Exibir senha" : "Ocultar senha");
  }

  openModal(html) {
    const root = document.getElementById("modal-root");
    root.innerHTML = html;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => root.querySelector("input:not([type='hidden']), select, textarea")?.focus());
  }

  closeModal() {
    document.getElementById("modal-root").innerHTML = "";
    document.body.style.overflow = "";
  }

  confirm(title, message, confirmLabel = "Confirmar") {
    return new Promise((resolve) => {
      const template = document.getElementById("confirm-template").content.cloneNode(true);
      const root = document.getElementById("modal-root");
      template.querySelector("#confirm-title").textContent = title;
      template.querySelector("#confirm-message").textContent = message;
      template.querySelector("#confirm-button").textContent = confirmLabel;
      root.replaceChildren(template);
      document.body.style.overflow = "hidden";
      const cleanup = (result) => { this.closeModal(); resolve(result); };
      root.querySelector("#confirm-button").addEventListener("click", () => cleanup(true), { once: true });
      root.querySelectorAll("[data-close-modal]").forEach((item) => item.addEventListener("click", () => cleanup(false), { once: true }));
    });
  }

  toast(message, type = "success", title = "") {
    const root = document.getElementById("toast-root");
    const toast = document.createElement("div");
    toast.className = `toast toast--${type}`;
    toast.innerHTML = `<span class="toast__icon">${type === "error" ? ICONS.alert : type === "warning" ? ICONS.info : ICONS.check}</span><div><strong>${escapeHTML(title || (type === "error" ? "Não foi possível concluir" : type === "warning" ? "Atenção" : "Tudo certo"))}</strong><p>${escapeHTML(message)}</p></div><button class="icon-button toast__close" aria-label="Fechar">${ICONS.close}</button>`;
    root.append(toast);
    const remove = () => { toast.classList.add("is-leaving"); setTimeout(() => toast.remove(), 180); };
    toast.querySelector("button").addEventListener("click", remove);
    setTimeout(remove, 4300);
  }

  #emitRefresh() { this.#emit("ui:refresh"); }
  #emit(type, detail = {}) { this.dispatchEvent(new CustomEvent(type, { detail })); }
}

export const ui = new UIService();
