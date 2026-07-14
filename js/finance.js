/**
 * Regras de negócio financeiras.
 * Faz cálculos, filtros, indicadores, parcelas e exportação CSV.
 */

import { storage } from "./storage.js";
import {
  addMonths, csvEscape, daysRemainingInMonth, endOfMonth, formatCurrency, getLastMonths,
  groupBy, isDateInRange, isSameMonth, monthKey, parseDate, roundMoney, startOfMonth,
  sum, toISODate, toNumber, uid
} from "./utils.js";

export class FinanceService {
  getTransactions() {
    return storage.getCollection("transactions");
  }

  createTransaction(input) {
    const transaction = this.normalizeTransaction(input);
    if (transaction.type === "expense" && transaction.isInstallment && transaction.installments > 1) {
      return this.createInstallments(transaction);
    }
    return [storage.add("transactions", transaction)];
  }

  updateTransaction(id, patch) {
    const current = this.getTransactions().find((item) => item.id === id);
    if (!current) return null;
    return storage.update("transactions", id, this.normalizeTransaction({ ...current, ...patch, id }));
  }

  deleteTransaction(id) {
    return storage.remove("transactions", id);
  }

  deleteInstallmentGroup(groupId) {
    const next = this.getTransactions().filter((item) => item.installmentGroupId !== groupId);
    storage.replaceCollection("transactions", next);
  }

  normalizeTransaction(input) {
    const type = input.type === "expense" ? "expense" : "income";
    const value = roundMoney(Math.abs(toNumber(input.value)));
    if (!value) throw new Error("Informe um valor maior que zero.");
    const date = toISODate(input.date || new Date());
    const base = {
      id: input.id || uid("transaction"),
      type,
      date,
      value,
      category: String(input.category || "Outros").trim(),
      description: String(input.description || input.origin || input.category || "Movimentação").trim(),
      note: String(input.note || "").trim(),
      status: String(input.status || (type === "income" ? "received" : "paid")),
      createdAt: input.createdAt,
      updatedAt: input.updatedAt
    };

    if (type === "income") {
      return {
        ...base,
        origin: String(input.origin || input.category || "Outros").trim(),
        clientName: String(input.clientName || "").trim(),
        paymentMethod: "",
        isInstallment: false,
        installments: 1
      };
    }

    return {
      ...base,
      paymentMethod: String(input.paymentMethod || "Outros").trim(),
      isInstallment: Boolean(input.isInstallment),
      installments: Math.max(1, Math.floor(toNumber(input.installments, 1))),
      origin: "",
      clientName: ""
    };
  }

  createInstallments(transaction) {
    const groupId = uid("installment");
    const totalInstallments = Math.min(120, transaction.installments);
    const totalValue = transaction.value;
    const baseValue = Math.floor((totalValue / totalInstallments) * 100) / 100;
    let allocated = 0;
    const records = [];

    for (let index = 0; index < totalInstallments; index += 1) {
      const isLast = index === totalInstallments - 1;
      const value = isLast ? roundMoney(totalValue - allocated) : baseValue;
      allocated = roundMoney(allocated + value);
      const installment = storage.add("transactions", {
        ...transaction,
        id: uid("transaction"),
        date: toISODate(addMonths(transaction.date, index)),
        value,
        isInstallment: true,
        installments: totalInstallments,
        installmentNumber: index + 1,
        installmentGroupId: groupId,
        installmentOriginalValue: totalValue,
        description: `${transaction.description} (${index + 1}/${totalInstallments})`
      });
      records.push(installment);
    }
    return records;
  }

  getSummary(reference = new Date(), transactions = this.getTransactions()) {
    const current = transactions.filter((item) => isSameMonth(item.date, reference));
    const previousReference = addMonths(reference, -1);
    const previous = transactions.filter((item) => isSameMonth(item.date, previousReference));
    const allIncome = sum(transactions.filter((item) => item.type === "income").map((item) => item.value));
    const allExpense = sum(transactions.filter((item) => item.type === "expense").map((item) => item.value));
    const income = sum(current.filter((item) => item.type === "income").map((item) => item.value));
    const expenses = sum(current.filter((item) => item.type === "expense").map((item) => item.value));
    const previousIncome = sum(previous.filter((item) => item.type === "income").map((item) => item.value));
    const previousExpenses = sum(previous.filter((item) => item.type === "expense").map((item) => item.value));
    const profit = roundMoney(income - expenses);
    const previousProfit = roundMoney(previousIncome - previousExpenses);
    return {
      balance: roundMoney(allIncome - allExpense),
      income,
      expenses,
      profit,
      previousIncome,
      previousExpenses,
      previousProfit,
      incomeChange: this.percentChange(income, previousIncome),
      expenseChange: this.percentChange(expenses, previousExpenses),
      profitChange: this.percentChange(profit, previousProfit),
      count: current.length,
      transactions: current
    };
  }

  percentChange(current, previous) {
    if (!previous) return current ? 100 : 0;
    return ((current - previous) / Math.abs(previous)) * 100;
  }

  getMonthlySeries(monthCount = 6, reference = new Date(), transactions = this.getTransactions()) {
    return getLastMonths(monthCount, reference).map((date) => {
      const key = monthKey(date);
      const items = transactions.filter((item) => monthKey(item.date) === key);
      const income = sum(items.filter((item) => item.type === "income").map((item) => item.value));
      const expenses = sum(items.filter((item) => item.type === "expense").map((item) => item.value));
      return { key, date, income: roundMoney(income), expenses: roundMoney(expenses), profit: roundMoney(income - expenses), count: items.length };
    });
  }

  getYearlySeries(transactions = this.getTransactions()) {
    const years = groupBy(transactions, (item) => parseDate(item.date)?.getFullYear() || "Sem data");
    return Object.entries(years).map(([year, items]) => {
      const income = sum(items.filter((item) => item.type === "income").map((item) => item.value));
      const expenses = sum(items.filter((item) => item.type === "expense").map((item) => item.value));
      return { year, income: roundMoney(income), expenses: roundMoney(expenses), profit: roundMoney(income - expenses) };
    }).sort((a, b) => String(a.year).localeCompare(String(b.year)));
  }

  getCashflow(transactions = this.getTransactions()) {
    let balance = 0;
    const chronological = [...transactions].sort((a, b) => {
      const dateDiff = new Date(a.date) - new Date(b.date);
      return dateDiff || new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
    });
    const withBalance = chronological.map((item) => {
      balance += item.type === "income" ? item.value : -item.value;
      return { ...item, balanceAfter: roundMoney(balance) };
    });
    return withBalance.reverse();
  }

  filterTransactions(filters = {}, transactions = this.getTransactions()) {
    const now = new Date();
    let filtered = [...transactions];
    const period = filters.period || "all";

    if (period !== "all") {
      let start;
      let end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      if (period === "day") start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      if (period === "week") {
        const day = now.getDay() || 7;
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + 1);
      }
      if (period === "month") start = startOfMonth(now);
      if (period === "year") start = new Date(now.getFullYear(), 0, 1);
      if (start) filtered = filtered.filter((item) => isDateInRange(item.date, start, end));
    }

    if (filters.startDate) filtered = filtered.filter((item) => parseDate(item.date) >= parseDate(filters.startDate));
    if (filters.endDate) filtered = filtered.filter((item) => parseDate(item.date) <= parseDate(filters.endDate));
    if (filters.category && filters.category !== "all") filtered = filtered.filter((item) => item.category === filters.category);
    if (filters.type && filters.type !== "all") filtered = filtered.filter((item) => item.type === filters.type);
    if (filters.search) {
      const query = filters.search.toLocaleLowerCase("pt-BR").trim();
      filtered = filtered.filter((item) => [item.description, item.category, item.origin, item.note, item.clientName, item.paymentMethod]
        .some((value) => String(value || "").toLocaleLowerCase("pt-BR").includes(query)));
    }

    const sortBy = filters.sortBy || "date";
    const direction = filters.sortDirection === "asc" ? 1 : -1;
    filtered.sort((a, b) => {
      if (sortBy === "value") return (a.value - b.value) * direction;
      if (sortBy === "category") return a.category.localeCompare(b.category, "pt-BR") * direction;
      if (sortBy === "type") return a.type.localeCompare(b.type) * direction;
      return (new Date(a.date) - new Date(b.date)) * direction;
    });
    return filtered;
  }

  getCategoryBreakdown(type = "expense", reference = new Date(), transactions = this.getTransactions()) {
    const items = transactions.filter((item) => item.type === type && isSameMonth(item.date, reference));
    return Object.entries(groupBy(items, "category")).map(([category, records]) => ({
      category,
      value: sum(records.map((item) => item.value)),
      count: records.length
    })).sort((a, b) => b.value - a.value);
  }

  getOriginBreakdown(reference = null, transactions = this.getTransactions()) {
    const items = transactions.filter((item) => item.type === "income" && (!reference || isSameMonth(item.date, reference)));
    return Object.entries(groupBy(items, (item) => item.origin || item.category || "Outros")).map(([origin, records]) => ({
      origin,
      value: sum(records.map((item) => item.value)),
      count: records.length,
      average: sum(records.map((item) => item.value)) / records.length,
      clients: new Set(records.map((item) => item.clientName).filter(Boolean)).size
    })).sort((a, b) => b.value - a.value);
  }

  getIndicators(reference = new Date(), transactions = this.getTransactions()) {
    const current = transactions.filter((item) => isSameMonth(item.date, reference));
    const incomes = current.filter((item) => item.type === "income");
    const expenses = current.filter((item) => item.type === "expense");
    const maxExpense = [...expenses].sort((a, b) => b.value - a.value)[0] || null;
    const maxIncome = [...incomes].sort((a, b) => b.value - a.value)[0] || null;
    const category = this.getCategoryBreakdown("expense", reference, transactions)[0] || null;
    const incomeTotal = sum(incomes.map((item) => item.value));
    const activeDays = new Set(current.map((item) => item.date)).size || 1;
    const settings = storage.getSettings();
    const remaining = Math.max(0, settings.monthlyTarget - incomeTotal);
    const daysRemaining = daysRemainingInMonth(reference);
    return {
      maxExpense,
      maxIncome,
      topExpenseCategory: category,
      averageTicket: incomes.length ? incomeTotal / incomes.length : 0,
      dailyAverage: incomeTotal / activeDays,
      daysRemaining,
      dailyNeeded: daysRemaining ? remaining / daysRemaining : remaining,
      activeDays,
      uniqueClients: new Set(incomes.map((item) => item.clientName).filter(Boolean)).size
    };
  }

  getEvolution(transactions = this.getTransactions()) {
    const incomes = transactions.filter((item) => item.type === "income");
    const expenses = transactions.filter((item) => item.type === "expense");
    const monthly = this.getMonthlySeries(Math.max(12, this.getDistinctMonthCount(transactions)), new Date(), transactions);
    const positiveMonths = monthly.filter((item) => item.profit > 0);
    const registeringDates = [...new Set(transactions.map((item) => item.date))].sort();
    const currentStreak = this.calculateCurrentDayStreak(registeringDates);
    const positiveStreak = this.calculatePositiveMonthStreak(monthly);
    const clients = new Set(incomes.map((item) => item.clientName).filter(Boolean));
    const bestRevenue = [...monthly].sort((a, b) => b.income - a.income)[0] || { income: 0, key: "—" };
    const bestSaving = [...monthly].sort((a, b) => b.profit - a.profit)[0] || { profit: 0, key: "—" };
    const current = monthly.at(-1) || { income: 0, expenses: 0, profit: 0 };
    const previous = monthly.at(-2) || { income: 0, expenses: 0, profit: 0 };
    return {
      totalRevenue: sum(incomes.map((item) => item.value)),
      accumulatedProfit: sum(incomes.map((item) => item.value)) - sum(expenses.map((item) => item.value)),
      clientCount: clients.size,
      currentStreak,
      bestRevenue,
      bestSaving,
      positiveStreak,
      current,
      previous,
      revenueComparison: this.percentChange(current.income, previous.income),
      profitComparison: this.percentChange(current.profit, previous.profit)
    };
  }

  getDistinctMonthCount(transactions = this.getTransactions()) {
    return new Set(transactions.map((item) => monthKey(item.date))).size;
  }

  calculateCurrentDayStreak(sortedDates) {
    if (!sortedDates.length) return 0;
    const unique = sortedDates.map((date) => parseDate(date)).filter(Boolean).sort((a, b) => b - a);
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const latest = unique[0];
    latest.setHours(12, 0, 0, 0);
    const gap = Math.round((today - latest) / 86400000);
    if (gap > 1) return 0;
    let streak = 1;
    for (let index = 1; index < unique.length; index += 1) {
      const previous = unique[index - 1];
      const current = unique[index];
      const diff = Math.round((previous - current) / 86400000);
      if (diff === 1) streak += 1;
      else if (diff > 1) break;
    }
    return streak;
  }

  calculatePositiveMonthStreak(monthly) {
    let current = 0;
    let best = 0;
    monthly.forEach((month) => {
      if (month.profit > 0) {
        current += 1;
        best = Math.max(best, current);
      } else current = 0;
    });
    return best;
  }

  getSmartInsights(reference = new Date(), transactions = this.getTransactions()) {
    const settings = storage.getSettings();
    const summary = this.getSummary(reference, transactions);
    const previous = addMonths(reference, -1);
    const insights = [];
    const remaining = Math.max(0, settings.monthlyTarget - summary.income);
    const currentGas = this.getCategoryBreakdown("expense", reference, transactions).find((item) => item.category === "Gasolina")?.value || 0;
    const previousGas = this.getCategoryBreakdown("expense", previous, transactions).find((item) => item.category === "Gasolina")?.value || 0;
    const monthly = this.getMonthlySeries(12, reference, transactions);
    const bestMonth = [...monthly].sort((a, b) => b.income - a.income)[0];

    if (previousGas && currentGas > previousGas) {
      const percent = Math.round(this.percentChange(currentGas, previousGas));
      insights.push({ type: "warning", title: "Combustível em alta", message: `Você gastou ${percent}% a mais com gasolina neste mês.` });
    }
    if (remaining > 0) {
      insights.push({ type: "info", title: "Meta mensal", message: `Faltam ${formatCurrency(remaining, settings)} para atingir sua meta.` });
    } else {
      insights.push({ type: "positive", title: "Meta alcançada", message: `Você superou sua meta mensal em ${formatCurrency(summary.income - settings.monthlyTarget, settings)}.` });
    }
    if (summary.profit > summary.previousProfit && summary.previousProfit !== 0) {
      insights.push({ type: "positive", title: "Economia maior", message: "Você economizou mais que no mês passado." });
    }
    if (bestMonth?.key === monthKey(reference) && bestMonth.income > 0) {
      insights.push({ type: "positive", title: "Seu melhor mês", message: "Este foi seu melhor mês de faturamento no período analisado." });
    }
    if (!insights.length) {
      insights.push({ type: "info", title: "Comece a criar seu histórico", message: "Registre entradas e saídas para receber análises automáticas." });
    }
    return insights.slice(0, 4);
  }

  getTargetProjection(reference = new Date(), transactions = this.getTransactions()) {
    const settings = storage.getSettings();
    const summary = this.getSummary(reference, transactions);
    const target = toNumber(settings.monthlyTarget, 7000);
    const reached = target ? (summary.income / target) * 100 : 0;
    const remaining = Math.max(0, target - summary.income);
    const day = Math.max(1, reference.getDate());
    const averageDaily = summary.income / day;
    const daysRemaining = daysRemainingInMonth(reference);
    const dailyNeeded = daysRemaining ? remaining / daysRemaining : remaining;
    const daysToTarget = averageDaily > 0 ? Math.ceil(remaining / averageDaily) : null;
    const estimatedDate = daysToTarget !== null ? new Date(reference.getFullYear(), reference.getMonth(), reference.getDate() + daysToTarget) : null;
    const reachesThisMonth = estimatedDate ? estimatedDate <= endOfMonth(reference) : false;
    return { target, current: summary.income, reached, remaining, averageDaily, dailyNeeded, estimatedDate, reachesThisMonth, daysRemaining };
  }

  toCSV(transactions = this.getTransactions()) {
    const settings = storage.getSettings();
    const headers = ["Data", "Tipo", "Categoria", "Descrição", "Origem", "Cliente", "Forma de pagamento", "Status", "Valor"];
    const rows = transactions.sort((a, b) => new Date(a.date) - new Date(b.date)).map((item) => [
      item.date,
      item.type === "income" ? "Entrada" : "Saída",
      item.category,
      item.description,
      item.origin || "",
      item.clientName || "",
      item.paymentMethod || "",
      item.status || "",
      item.value.toFixed(2).replace(".", ",")
    ]);
    return [headers, ...rows].map((row) => row.map(csvEscape).join(";")).join("\n");
  }
}

export const finance = new FinanceService();
