/**
 * Renderização dos painéis analíticos: Dashboard, Estatísticas,
 * Minha Evolução e Produtividade Financeira.
 */

import { charts } from "./charts.js";
import { finance } from "./finance.js";
import { storage } from "./storage.js";
import {
  clamp, escapeHTML, formatCurrency, formatDate, formatMonth, formatNumber,
  formatPercent, ICONS, monthKey, parseDate
} from "./utils.js";

function trendMarkup(value, invert = false) {
  const adjusted = invert ? -value : value;
  const positive = adjusted >= 0;
  return `<span class="metric-card__trend ${positive ? "text-success" : "text-danger"}">
    ${positive ? ICONS.arrowUp : ICONS.arrowDown}${Math.abs(value).toFixed(0)}%
  </span>`;
}

function metricCard({ label, value, detail, trend, variant = "", icon = ICONS.wallet, invertTrend = false }) {
  return `<article class="metric-card ${variant ? `metric-card--${variant}` : ""}">
    <div class="metric-card__top"><span class="metric-card__label">${label}</span><span class="metric-card__icon">${icon}</span></div>
    <p class="metric-card__value">${value}</p>
    <div class="metric-card__footer"><span>${detail}</span>${Number.isFinite(trend) ? trendMarkup(trend, invertTrend) : ""}</div>
  </article>`;
}

function recentTransactions(transactions, settings) {
  if (!transactions.length) {
    return `<div class="empty-state">
      <div class="empty-state__icon">${ICONS.wallet}</div>
      <h3>Nenhuma movimentação ainda</h3>
      <p>Cadastre sua primeira entrada ou saída para começar a acompanhar seu financeiro.</p>
      <button class="button button--primary" data-action="new-transaction">${ICONS.plus}Adicionar movimentação</button>
    </div>`;
  }
  return `<div class="table-container"><table class="data-table"><thead><tr><th>Movimentação</th><th>Data</th><th>Categoria</th><th>Valor</th></tr></thead><tbody>
    ${transactions.slice(0, 6).map((item) => `<tr>
      <td><div class="description-cell"><span class="transaction-type ${item.type === "expense" ? "transaction-type--expense" : ""}">${item.type === "income" ? ICONS.income : ICONS.expense}</span><div class="description-cell__text"><strong>${escapeHTML(item.description)}</strong><span>${escapeHTML(item.clientName || item.paymentMethod || item.note || "Sem detalhes adicionais")}</span></div></div></td>
      <td>${formatDate(item.date, settings.locale, { year: undefined })}</td>
      <td>${escapeHTML(item.category)}</td>
      <td class="amount ${item.type === "income" ? "amount--income" : "amount--expense"}">${item.type === "income" ? "+" : "−"}${formatCurrency(item.value, settings)}</td>
    </tr>`).join("")}
  </tbody></table></div>`;
}

export function renderDashboard() {
  charts.destroyAll();
  const settings = storage.getSettings();
  const summary = finance.getSummary();
  const projection = finance.getTargetProjection();
  const indicators = finance.getIndicators();
  const series = finance.getMonthlySeries(6);
  const insights = finance.getSmartInsights();
  const transactions = finance.getCashflow();
  const targetPercent = clamp(projection.reached, 0, 100);
  const estimated = !projection.estimatedDate
    ? "Cadastre receitas para gerar uma estimativa"
    : projection.reachesThisMonth
      ? `Estimativa: ${formatDate(projection.estimatedDate, settings.locale)}`
      : `No ritmo atual: ${formatDate(projection.estimatedDate, settings.locale)}`;

  const html = `
    <section class="metric-grid">
      ${metricCard({ label: "Saldo atual", value: formatCurrency(summary.balance, settings), detail: "Histórico completo", icon: ICONS.wallet })}
      ${metricCard({ label: "Receita do mês", value: formatCurrency(summary.income, settings), detail: "vs. mês anterior", trend: summary.incomeChange, variant: "income", icon: ICONS.income })}
      ${metricCard({ label: "Despesas do mês", value: formatCurrency(summary.expenses, settings), detail: "vs. mês anterior", trend: summary.expenseChange, variant: "expense", icon: ICONS.expense, invertTrend: true })}
      ${metricCard({ label: "Lucro líquido", value: formatCurrency(summary.profit, settings), detail: "Receitas menos despesas", trend: summary.profitChange, variant: "profit", icon: ICONS.chart })}
    </section>

    <section class="dashboard-layout">
      <article class="panel chart-panel">
        <header class="panel__header">
          <div><h2 class="panel__title">Desempenho financeiro</h2><p class="panel__description">Receitas, despesas e lucro nos últimos 6 meses.</p></div>
          <div class="chart-legend-custom"><span><i></i>Receitas</span><span><i></i>Despesas</span><span><i></i>Lucro</span></div>
        </header>
        <div class="panel__body"><div class="chart-wrap"><canvas id="dashboard-chart" aria-label="Gráfico de desempenho financeiro"></canvas></div></div>
      </article>

      <article class="goal-spotlight">
        <p class="goal-spotlight__eyebrow">Meta mensal</p>
        <h3>Meta ${formatCurrency(projection.target, settings)}</h3>
        <p class="goal-spotlight__value">${formatCurrency(projection.current, settings)}</p>
        <p class="goal-spotlight__sub">de ${formatCurrency(projection.target, settings)} em ${formatMonth(new Date(), settings.locale)}</p>
        <div class="progress progress--large"><div class="progress__bar" data-progress="${targetPercent}"></div></div>
        <div class="goal-spotlight__percent"><span>${formatPercent(projection.reached, settings.locale, 1)} atingido</span><span>${formatCurrency(projection.remaining, settings)} restantes</span></div>
        <div class="goal-spotlight__stats">
          <div class="goal-spotlight__stat"><span>Necessário por dia</span><strong>${formatCurrency(projection.dailyNeeded, settings)}</strong></div>
          <div class="goal-spotlight__stat"><span>Média diária</span><strong>${formatCurrency(projection.averageDaily, settings)}</strong></div>
          <div class="goal-spotlight__stat" style="grid-column:1/-1"><span>Projeção</span><strong>${estimated}</strong></div>
        </div>
      </article>
    </section>

    <div class="section-heading"><div><h3>Indicadores do mês</h3><p>Leitura rápida dos seus principais números.</p></div></div>
    <section class="indicator-grid">
      <article class="indicator"><span class="indicator__label">Maior gasto</span><strong class="indicator__value">${indicators.maxExpense ? formatCurrency(indicators.maxExpense.value, settings) : "—"}</strong><span class="indicator__detail">${escapeHTML(indicators.maxExpense?.description || "Sem gastos registrados")}</span></article>
      <article class="indicator"><span class="indicator__label">Categoria que mais consumiu</span><strong class="indicator__value">${escapeHTML(indicators.topExpenseCategory?.category || "—")}</strong><span class="indicator__detail">${indicators.topExpenseCategory ? formatCurrency(indicators.topExpenseCategory.value, settings) : "Sem dados"}</span></article>
      <article class="indicator"><span class="indicator__label">Maior receita</span><strong class="indicator__value">${indicators.maxIncome ? formatCurrency(indicators.maxIncome.value, settings) : "—"}</strong><span class="indicator__detail">${escapeHTML(indicators.maxIncome?.description || "Sem receitas registradas")}</span></article>
      <article class="indicator"><span class="indicator__label">Ticket médio</span><strong class="indicator__value">${formatCurrency(indicators.averageTicket, settings)}</strong><span class="indicator__detail">${formatNumber(indicators.uniqueClients, settings.locale)} clientes únicos</span></article>
      <article class="indicator"><span class="indicator__label">Média diária</span><strong class="indicator__value">${formatCurrency(indicators.dailyAverage, settings)}</strong><span class="indicator__detail">Em ${indicators.activeDays} dias com registros</span></article>
      <article class="indicator"><span class="indicator__label">Dias restantes</span><strong class="indicator__value">${indicators.daysRemaining}</strong><span class="indicator__detail">Até o fim do mês</span></article>
      <article class="indicator"><span class="indicator__label">Receita diária necessária</span><strong class="indicator__value">${formatCurrency(indicators.dailyNeeded, settings)}</strong><span class="indicator__detail">Para atingir a meta mensal</span></article>
      <article class="indicator"><span class="indicator__label">Movimentações</span><strong class="indicator__value">${summary.count}</strong><span class="indicator__detail">Entradas e saídas neste mês</span></article>
    </section>

    <section class="grid grid--2" style="margin-top:16px">
      <article class="panel">
        <header class="panel__header"><div><h2 class="panel__title">Dashboard inteligente</h2><p class="panel__description">Análises geradas com base no seu histórico.</p></div></header>
        <div class="panel__body"><div class="insights-list">
          ${insights.map((item) => `<div class="insight-card insight-card--${item.type}"><span class="insight-card__icon">${item.type === "warning" ? ICONS.alert : item.type === "positive" ? ICONS.check : ICONS.bulb}</span><div><strong>${escapeHTML(item.title)}</strong><p>${escapeHTML(item.message)}</p></div></div>`).join("")}
        </div></div>
      </article>
      <article class="panel">
        <header class="panel__header"><div><h2 class="panel__title">Ações rápidas</h2><p class="panel__description">Atalhos para as tarefas mais frequentes.</p></div><span class="badge badge--primary">Atalhos</span></header>
        <div class="panel__body"><div class="quick-actions">
          <button class="quick-action" data-action="new-income">${ICONS.income}<span>Nova entrada</span></button>
          <button class="quick-action" data-action="new-expense">${ICONS.expense}<span>Nova saída</span></button>
          <button class="quick-action" data-action="new-goal">${ICONS.target}<span>Novo objetivo</span></button>
          <button class="quick-action" data-route="cashflow">${ICONS.chart}<span>Ver fluxo</span></button>
        </div></div>
      </article>
    </section>

    <section class="panel" style="margin-top:16px">
      <header class="panel__header"><div><h2 class="panel__title">Movimentações recentes</h2><p class="panel__description">Últimos registros adicionados ao seu fluxo.</p></div><button class="button button--ghost button--small" data-route="cashflow">Ver todas</button></header>
      ${recentTransactions(transactions, settings)}
    </section>`;

  return {
    html,
    afterRender() {
      requestAnimationFrame(() => {
        document.querySelectorAll("[data-progress]").forEach((bar) => { bar.style.width = `${bar.dataset.progress}%`; });
        charts.renderDashboard("dashboard-chart", series);
      });
    }
  };
}

export function renderStats() {
  charts.destroyAll();
  const settings = storage.getSettings();
  const series = finance.getMonthlySeries(12);
  const yearly = finance.getYearlySeries();
  const expenses = finance.getCategoryBreakdown("expense");
  const origins = finance.getOriginBreakdown();
  const summary = finance.getSummary();
  const html = `
    <div class="page-heading"><div><h2>Estatísticas</h2><p>Compare receitas, despesas, lucros, categorias, origens, meses e anos.</p></div><div class="page-heading__actions"><button class="button button--secondary" data-action="print">${ICONS.print}Imprimir relatório</button></div></div>
    <section class="metric-grid">
      ${metricCard({ label: "Receitas no mês", value: formatCurrency(summary.income, settings), detail: `${summary.count} movimentações`, variant: "income", icon: ICONS.income })}
      ${metricCard({ label: "Despesas no mês", value: formatCurrency(summary.expenses, settings), detail: `${expenses.length} categorias`, variant: "expense", icon: ICONS.expense })}
      ${metricCard({ label: "Lucro no mês", value: formatCurrency(summary.profit, settings), detail: summary.profit >= 0 ? "Resultado positivo" : "Resultado negativo", variant: "profit", icon: ICONS.chart })}
      ${metricCard({ label: "Origens de receita", value: String(origins.length), detail: "Atividades monitoradas", icon: ICONS.target })}
    </section>
    <section class="grid grid--2" style="margin-top:16px">
      <article class="panel"><header class="panel__header"><div><h3 class="panel__title">Receitas x despesas</h3><p class="panel__description">Comparativo mensal em barras.</p></div></header><div class="panel__body"><div class="chart-wrap"><canvas id="stats-bar"></canvas></div></div></article>
      <article class="panel"><header class="panel__header"><div><h3 class="panel__title">Despesas por categoria</h3><p class="panel__description">Distribuição do mês atual.</p></div></header><div class="panel__body"><div class="chart-wrap"><canvas id="stats-pie"></canvas></div></div></article>
      <article class="panel"><header class="panel__header"><div><h3 class="panel__title">Evolução do lucro</h3><p class="panel__description">Gráfico de área dos últimos 12 meses.</p></div></header><div class="panel__body"><div class="chart-wrap"><canvas id="stats-area"></canvas></div></div></article>
      <article class="panel"><header class="panel__header"><div><h3 class="panel__title">Receita por origem</h3><p class="panel__description">Atividades com maior retorno.</p></div></header><div class="panel__body"><div class="chart-wrap"><canvas id="stats-origins"></canvas></div></div></article>
    </section>
    <section class="panel" style="margin-top:16px"><header class="panel__header"><div><h3 class="panel__title">Comparativo anual</h3><p class="panel__description">Receitas, despesas e lucro consolidados por ano.</p></div></header><div class="panel__body"><div class="chart-wrap chart-wrap--small"><canvas id="stats-yearly"></canvas></div></div></section>`;
  return {
    html,
    afterRender() {
      requestAnimationFrame(() => {
        charts.renderMonthlyBar("stats-bar", series);
        charts.renderExpensePie("stats-pie", expenses);
        charts.renderProfitArea("stats-area", series);
        charts.renderOrigins("stats-origins", origins);
        charts.renderYearly("stats-yearly", yearly);
      });
    }
  };
}

export function renderEvolution() {
  charts.destroyAll();
  const settings = storage.getSettings();
  const evolution = finance.getEvolution();
  const series = finance.getMonthlySeries(12);
  const html = `
    <div class="page-heading"><div><h2>Minha Evolução</h2><p>Seu histórico consolidado, marcos e crescimento ao longo do tempo.</p></div></div>
    <section class="evolution-hero">
      <article class="panel evolution-primary">
        <span class="badge badge--primary">Faturamento total</span>
        <div class="evolution-primary__value">${formatCurrency(evolution.totalRevenue, settings)}</div>
        <p class="muted">Somatório de todas as receitas registradas desde o início.</p>
        <div class="cluster" style="margin-top:18px">
          <span class="badge ${evolution.revenueComparison >= 0 ? "badge--success" : "badge--danger"}">${evolution.revenueComparison >= 0 ? "+" : ""}${evolution.revenueComparison.toFixed(0)}% receita</span>
          <span class="badge ${evolution.profitComparison >= 0 ? "badge--success" : "badge--danger"}">${evolution.profitComparison >= 0 ? "+" : ""}${evolution.profitComparison.toFixed(0)}% lucro</span>
          <span class="small muted">comparado ao mês anterior</span>
        </div>
      </article>
      <div class="evolution-metrics">
        <article class="panel evolution-stat"><span>Lucro acumulado</span><strong class="${evolution.accumulatedProfit >= 0 ? "text-success" : "text-danger"}">${formatCurrency(evolution.accumulatedProfit, settings)}</strong></article>
        <article class="panel evolution-stat"><span>Clientes únicos</span><strong>${formatNumber(evolution.clientCount, settings.locale)}</strong></article>
        <article class="panel evolution-stat"><span>Dias consecutivos</span><strong>${evolution.currentStreak}</strong><div class="streak-visual">${Array.from({ length: 7 }, (_, index) => `<i class="${index < Math.min(7, evolution.currentStreak) ? "is-active" : ""}"></i>`).join("")}</div></article>
        <article class="panel evolution-stat"><span>Maior sequência positiva</span><strong>${evolution.positiveStreak} meses</strong></article>
      </div>
    </section>
    <section class="indicator-grid" style="margin-top:16px">
      <article class="indicator"><span class="indicator__label">Maior faturamento</span><strong class="indicator__value">${formatCurrency(evolution.bestRevenue.income, settings)}</strong><span class="indicator__detail">${evolution.bestRevenue.key === "—" ? "Sem histórico" : escapeHTML(evolution.bestRevenue.key)}</span></article>
      <article class="indicator"><span class="indicator__label">Maior economia</span><strong class="indicator__value">${formatCurrency(evolution.bestSaving.profit, settings)}</strong><span class="indicator__detail">Melhor lucro mensal</span></article>
      <article class="indicator"><span class="indicator__label">Receita atual</span><strong class="indicator__value">${formatCurrency(evolution.current.income, settings)}</strong><span class="indicator__detail">No mês corrente</span></article>
      <article class="indicator"><span class="indicator__label">Lucro atual</span><strong class="indicator__value">${formatCurrency(evolution.current.profit, settings)}</strong><span class="indicator__detail">Resultado do mês</span></article>
    </section>
    <section class="panel" style="margin-top:16px"><header class="panel__header"><div><h3 class="panel__title">Evolução dos últimos 12 meses</h3><p class="panel__description">Acompanhe a trajetória de receitas, despesas e lucro.</p></div></header><div class="panel__body"><div class="chart-wrap"><canvas id="evolution-chart"></canvas></div></div></section>`;
  return { html, afterRender() { requestAnimationFrame(() => charts.renderDashboard("evolution-chart", series)); } };
}

export function renderProductivity() {
  charts.destroyAll();
  const settings = storage.getSettings();
  const origins = finance.getOriginBreakdown();
  const total = origins.reduce((sum, item) => sum + item.value, 0);
  const top = origins[0];
  const html = `
    <div class="page-heading"><div><h2>Produtividade Financeira</h2><p>Entenda quais atividades, clientes e origens geram mais retorno financeiro.</p></div><div class="page-heading__actions"><button class="button button--primary" data-action="new-income">${ICONS.plus}Registrar receita</button></div></div>
    <section class="metric-grid">
      ${metricCard({ label: "Receita total analisada", value: formatCurrency(total, settings), detail: "Todas as origens", variant: "income", icon: ICONS.income })}
      ${metricCard({ label: "Atividade mais rentável", value: escapeHTML(top?.origin || "—"), detail: top ? formatCurrency(top.value, settings) : "Sem dados", variant: "profit", icon: ICONS.target })}
      ${metricCard({ label: "Ticket médio da líder", value: formatCurrency(top?.average || 0, settings), detail: `${top?.count || 0} recebimentos`, icon: ICONS.chart })}
      ${metricCard({ label: "Clientes na atividade líder", value: String(top?.clients || 0), detail: "Clientes únicos informados", icon: ICONS.users })}
    </section>
    <section class="grid grid--2" style="margin-top:16px">
      <article class="panel"><header class="panel__header"><div><h3 class="panel__title">Retorno por atividade</h3><p class="panel__description">Comparativo entre as origens de receita.</p></div></header><div class="panel__body"><div class="chart-wrap"><canvas id="productivity-chart"></canvas></div></div></article>
      <article class="panel"><header class="panel__header"><div><h3 class="panel__title">Ranking de produtividade</h3><p class="panel__description">Participação, volume e ticket médio.</p></div></header><div class="panel__body">
        ${origins.length ? `<div class="productivity-list">${origins.map((item) => {
          const percent = total ? (item.value / total) * 100 : 0;
          return `<div class="productivity-row"><div class="productivity-row__name"><span class="productivity-row__icon">${ICONS.chart}</span><div><strong>${escapeHTML(item.origin)}</strong><span>${item.count} receitas • ${item.clients} clientes</span></div></div><div class="productivity-row__bar"><i style="width:${clamp(percent, 0, 100)}%"></i></div><div class="productivity-row__value"><strong>${formatCurrency(item.value, settings)}</strong><span>${formatPercent(percent, settings.locale, 1)} • ticket ${formatCurrency(item.average, settings)}</span></div></div>`;
        }).join("")}</div>` : `<div class="empty-state"><div class="empty-state__icon">${ICONS.chart}</div><h3>Sem receitas para analisar</h3><p>Informe a origem das entradas para descobrir quais atividades geram mais retorno.</p><button class="button button--primary" data-action="new-income">${ICONS.plus}Adicionar receita</button></div>`}
      </div></article>
    </section>`;
  return { html, afterRender() { requestAnimationFrame(() => charts.renderOrigins("productivity-chart", origins)); } };
}
