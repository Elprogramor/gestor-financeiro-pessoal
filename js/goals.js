/**
 * Regras de objetivos, dívidas e metas mensais.
 */

import { storage } from "./storage.js";
import { finance } from "./finance.js";
import {
  addMonths, clamp, daysBetween, formatCurrency, monthKey, parseDate, roundMoney,
  sum, toISODate, toNumber, uid
} from "./utils.js";

export class GoalsService {
  getGoals() {
    return storage.getCollection("goals");
  }

  saveGoal(input) {
    const goal = this.normalizeGoal(input);
    return input.id ? storage.update("goals", input.id, goal) : storage.add("goals", goal);
  }

  deleteGoal(id) {
    return storage.remove("goals", id);
  }

  normalizeGoal(input) {
    const targetValue = roundMoney(Math.max(0, toNumber(input.targetValue)));
    const currentValue = roundMoney(Math.max(0, toNumber(input.currentValue)));
    if (!input.name?.trim()) throw new Error("Informe o nome do objetivo.");
    if (!targetValue) throw new Error("Informe um valor alvo maior que zero.");
    return {
      id: input.id || uid("goal"),
      name: String(input.name).trim(),
      type: String(input.type || "Outro").trim(),
      targetValue,
      currentValue,
      deadline: toISODate(input.deadline || addMonths(new Date(), 6)),
      color: /^#[0-9a-f]{6}$/i.test(input.color || "") ? input.color : "#635bff",
      note: String(input.note || "").trim(),
      createdAt: input.createdAt,
      updatedAt: input.updatedAt
    };
  }

  enrichGoal(goal, reference = new Date()) {
    const percent = goal.targetValue ? clamp((goal.currentValue / goal.targetValue) * 100, 0, 999) : 0;
    const remaining = Math.max(0, goal.targetValue - goal.currentValue);
    const daysRemaining = daysBetween(reference, goal.deadline);
    return {
      ...goal,
      percent,
      remaining,
      daysRemaining,
      status: percent >= 100 ? "completed" : daysRemaining < 0 ? "overdue" : "active"
    };
  }

  getEnrichedGoals(reference = new Date()) {
    return this.getGoals().map((goal) => this.enrichGoal(goal, reference));
  }

  getDebts() {
    return storage.getCollection("debts");
  }

  saveDebt(input) {
    const debt = this.normalizeDebt(input);
    return input.id ? storage.update("debts", input.id, debt) : storage.add("debts", debt);
  }

  deleteDebt(id) {
    return storage.remove("debts", id);
  }

  normalizeDebt(input) {
    const principalValue = roundMoney(Math.max(0, toNumber(input.principalValue)));
    const installments = Math.max(1, Math.floor(toNumber(input.installments, 1)));
    const interestRate = Math.max(0, toNumber(input.interestRate));
    const totalValue = roundMoney(principalValue * Math.pow(1 + interestRate / 100, installments));
    const paidAmount = roundMoney(Math.max(0, Math.min(toNumber(input.paidAmount), totalValue)));
    if (!input.name?.trim()) throw new Error("Informe o nome da dívida.");
    if (!principalValue) throw new Error("Informe o valor da dívida.");
    return {
      id: input.id || uid("debt"),
      name: String(input.name).trim(),
      principalValue,
      installments,
      interestRate,
      startDate: toISODate(input.startDate || new Date()),
      paidAmount,
      status: input.status === "paid" || paidAmount >= totalValue ? "paid" : input.status === "late" ? "late" : "active",
      dueDay: Math.min(31, Math.max(1, Math.floor(toNumber(input.dueDay, parseDate(input.startDate)?.getDate() || 10)))),
      note: String(input.note || "").trim(),
      createdAt: input.createdAt,
      updatedAt: input.updatedAt
    };
  }

  enrichDebt(debt, reference = new Date()) {
    const totalValue = roundMoney(debt.principalValue * Math.pow(1 + debt.interestRate / 100, debt.installments));
    const paidAmount = Math.min(totalValue, toNumber(debt.paidAmount));
    const remaining = Math.max(0, totalValue - paidAmount);
    const percent = totalValue ? clamp((paidAmount / totalValue) * 100, 0, 100) : 0;
    const installmentValue = totalValue / debt.installments;
    const installmentsPaid = Math.min(debt.installments, Math.floor(paidAmount / installmentValue));
    const nextDue = this.getNextDebtDueDate(debt, installmentsPaid, reference);
    return {
      ...debt,
      totalValue,
      paidAmount,
      remaining,
      percent,
      installmentValue,
      installmentsPaid,
      installmentsRemaining: Math.max(0, debt.installments - installmentsPaid),
      nextDue,
      status: remaining <= 0 ? "paid" : debt.status
    };
  }

  getNextDebtDueDate(debt, installmentsPaid = 0, reference = new Date()) {
    const start = parseDate(debt.startDate) || new Date();
    let candidate = addMonths(start, installmentsPaid);
    candidate.setDate(Math.min(debt.dueDay || start.getDate(), new Date(candidate.getFullYear(), candidate.getMonth() + 1, 0).getDate()));
    while (candidate < reference && installmentsPaid < debt.installments) {
      installmentsPaid += 1;
      candidate = addMonths(start, installmentsPaid);
      candidate.setDate(Math.min(debt.dueDay || start.getDate(), new Date(candidate.getFullYear(), candidate.getMonth() + 1, 0).getDate()));
    }
    return toISODate(candidate);
  }

  getEnrichedDebts(reference = new Date()) {
    return this.getDebts().map((debt) => this.enrichDebt(debt, reference));
  }

  getDebtSchedule(debtInput) {
    const debt = this.enrichDebt(debtInput);
    const start = parseDate(debt.startDate) || new Date();
    return Array.from({ length: debt.installments }, (_, index) => {
      const date = addMonths(start, index);
      date.setDate(Math.min(debt.dueDay, new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()));
      return {
        debtId: debt.id,
        name: debt.name,
        date: toISODate(date),
        value: roundMoney(debt.installmentValue),
        installmentNumber: index + 1,
        paid: index < debt.installmentsPaid
      };
    });
  }

  getAllDebtSchedule() {
    return this.getDebts().flatMap((debt) => this.getDebtSchedule(debt));
  }

  getMonthlyGoals() {
    return storage.getCollection("monthlyGoals");
  }

  saveMonthlyGoal(input) {
    const goal = this.normalizeMonthlyGoal(input);
    const duplicate = this.getMonthlyGoals().find((item) => item.type === goal.type && item.month === goal.month && item.id !== input.id);
    if (duplicate && !input.id) return storage.update("monthlyGoals", duplicate.id, goal);
    return input.id ? storage.update("monthlyGoals", input.id, goal) : storage.add("monthlyGoals", goal);
  }

  deleteMonthlyGoal(id) {
    return storage.remove("monthlyGoals", id);
  }

  normalizeMonthlyGoal(input) {
    const value = Math.max(0, toNumber(input.value));
    if (!value) throw new Error("Informe um valor de meta maior que zero.");
    return {
      id: input.id || uid("monthlyGoal"),
      type: String(input.type || "Receita"),
      value: roundMoney(value),
      month: /^\d{4}-\d{2}$/.test(input.month || "") ? input.month : monthKey(new Date()),
      color: /^#[0-9a-f]{6}$/i.test(input.color || "") ? input.color : "#635bff",
      createdAt: input.createdAt,
      updatedAt: input.updatedAt
    };
  }

  getMonthlyGoalActual(goal, transactions = finance.getTransactions()) {
    const items = transactions.filter((item) => monthKey(item.date) === goal.month);
    const incomes = items.filter((item) => item.type === "income");
    const expenses = items.filter((item) => item.type === "expense");
    if (goal.type === "Receita") return sum(incomes.map((item) => item.value));
    if (goal.type === "Economia") return sum(incomes.map((item) => item.value)) - sum(expenses.map((item) => item.value));
    if (goal.type === "Investimentos") return sum(expenses.filter((item) => /invest/i.test(item.category) || /invest/i.test(item.description)).map((item) => item.value));
    if (goal.type === "Clientes") return new Set(incomes.map((item) => item.clientName).filter(Boolean)).size;
    return 0;
  }

  enrichMonthlyGoal(goal, transactions = finance.getTransactions()) {
    const actual = this.getMonthlyGoalActual(goal, transactions);
    const percent = goal.value ? clamp((actual / goal.value) * 100, 0, 999) : 0;
    return {
      ...goal,
      actual,
      percent,
      remaining: Math.max(0, goal.value - actual),
      status: percent >= 100 ? "completed" : percent >= 70 ? "on-track" : percent >= 40 ? "attention" : "behind"
    };
  }

  getEnrichedMonthlyGoals(month = monthKey(new Date())) {
    const transactions = finance.getTransactions();
    return this.getMonthlyGoals().filter((goal) => goal.month === month).map((goal) => this.enrichMonthlyGoal(goal, transactions));
  }

  getGoalSummary() {
    const goals = this.getEnrichedGoals();
    const debts = this.getEnrichedDebts();
    return {
      totalGoalTarget: sum(goals.map((item) => item.targetValue)),
      totalGoalCurrent: sum(goals.map((item) => item.currentValue)),
      activeGoals: goals.filter((item) => item.status === "active").length,
      completedGoals: goals.filter((item) => item.status === "completed").length,
      totalDebt: sum(debts.map((item) => item.totalValue)),
      remainingDebt: sum(debts.map((item) => item.remaining)),
      debtPaid: sum(debts.map((item) => item.paidAmount))
    };
  }

  getGoalMotivation(goal, settings = storage.getSettings()) {
    const enriched = this.enrichGoal(goal);
    if (enriched.percent >= 100) return "Objetivo concluído. Excelente trabalho!";
    if (enriched.daysRemaining < 0) return `O prazo terminou com ${formatCurrency(enriched.remaining, settings)} pendentes.`;
    const monthlyNeeded = enriched.daysRemaining > 0 ? (enriched.remaining / enriched.daysRemaining) * 30 : enriched.remaining;
    return `Reserve cerca de ${formatCurrency(monthlyNeeded, settings)} por mês para manter o ritmo.`;
  }
}

export const goalsService = new GoalsService();
