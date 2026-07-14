/**
 * Camada única de persistência.
 * Centraliza leitura, escrita, migrações, backups e restauração do LocalStorage.
 */

import { addDays, addMonths, monthKey, roundMoney, safeJSONParse, toISODate, uid } from "./utils.js";

const NAMESPACE = "fluxo_finance_v1";
const DATA_KEY = `${NAMESPACE}:data`;
const AUTH_KEY = `${NAMESPACE}:auth`;
const BACKUP_KEY = `${NAMESPACE}:backups`;
const LEGACY_MIGRATION_KEY = `${NAMESPACE}:legacy-cloud-migration`;
const CURRENT_SCHEMA = 3;

const defaultSettings = Object.freeze({
  userName: "Meu financeiro",
  avatar: "",
  theme: "system",
  currency: "BRL",
  locale: "pt-BR",
  monthlyTarget: 7000,
  inactivityMinutes: 15,
  autoBackup: true,
  sidebarCollapsed: false,
  accentColor: "#635bff"
});

function createDefaultData() {
  return {
    schemaVersion: CURRENT_SCHEMA,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    settings: { ...defaultSettings },
    transactions: [],
    goals: [],
    debts: [],
    monthlyGoals: [],
    activity: {
      lastOpenedAt: new Date().toISOString(),
      lastBackupAt: null
    }
  };
}

function ensureCollections(data) {
  const rawSettings = { ...defaultSettings, ...(data?.settings || {}) };
  const normalizedSettings = {
    ...rawSettings,
    userName: String(rawSettings.userName || defaultSettings.userName).slice(0, 60),
    avatar: /^data:image\/(png|jpeg|webp);base64,/i.test(rawSettings.avatar || "") ? rawSettings.avatar : "",
    theme: ["system", "light", "dark"].includes(rawSettings.theme) ? rawSettings.theme : defaultSettings.theme,
    currency: ["BRL", "USD", "EUR"].includes(rawSettings.currency) ? rawSettings.currency : defaultSettings.currency,
    locale: ["pt-BR", "en-US", "es-ES"].includes(rawSettings.locale) ? rawSettings.locale : defaultSettings.locale,
    monthlyTarget: Math.max(0, Number(rawSettings.monthlyTarget) || defaultSettings.monthlyTarget),
    inactivityMinutes: Math.max(0, Number(rawSettings.inactivityMinutes) || 0),
    autoBackup: Boolean(rawSettings.autoBackup),
    sidebarCollapsed: Boolean(rawSettings.sidebarCollapsed),
    accentColor: /^#[0-9a-f]{6}$/i.test(rawSettings.accentColor || "") ? rawSettings.accentColor : defaultSettings.accentColor
  };
  return {
    ...createDefaultData(),
    ...data,
    schemaVersion: CURRENT_SCHEMA,
    settings: normalizedSettings,
    transactions: Array.isArray(data?.transactions) ? data.transactions : [],
    goals: Array.isArray(data?.goals) ? data.goals : [],
    debts: Array.isArray(data?.debts) ? data.debts : [],
    monthlyGoals: Array.isArray(data?.monthlyGoals) ? data.monthlyGoals : [],
    activity: { ...createDefaultData().activity, ...(data?.activity || {}) }
  };
}

function migrate(data) {
  if (!data || typeof data !== "object") return createDefaultData();
  const version = Number(data.schemaVersion || 0);
  let migrated = { ...data };

  if (version < 1) migrated.schemaVersion = 1;
  if (version < 2) migrated.schemaVersion = 2;

  return ensureCollections(migrated);
}

class StorageService extends EventTarget {
  #data = null;
  #backupTimer = null;
  #scope = { mode: "legacy", userId: "local", workspaceId: "local" };

  getScope() {
    return { ...this.#scope };
  }

  setScope({ userId = "local", workspaceId = userId, migrateLegacy = false } = {}) {
    const next = {
      mode: userId === "local" ? "legacy" : "cloud",
      userId: String(userId || "local"),
      workspaceId: String(workspaceId || userId || "local")
    };
    const unchanged = this.#scope.mode === next.mode
      && this.#scope.userId === next.userId
      && this.#scope.workspaceId === next.workspaceId;
    if (unchanged) return this.getScope();

    const targetKey = next.mode === "legacy" ? DATA_KEY : `${NAMESPACE}:data:${next.userId}:${next.workspaceId}`;
    if (migrateLegacy && next.mode === "cloud" && !localStorage.getItem(targetKey)) {
      const migratedTo = localStorage.getItem(LEGACY_MIGRATION_KEY);
      const legacy = localStorage.getItem(DATA_KEY);
      if (legacy && (!migratedTo || migratedTo === next.userId)) {
        localStorage.setItem(targetKey, legacy);
        const legacyBackups = localStorage.getItem(BACKUP_KEY);
        if (legacyBackups) localStorage.setItem(`${NAMESPACE}:backups:${next.userId}:${next.workspaceId}`, legacyBackups);
        localStorage.setItem(LEGACY_MIGRATION_KEY, next.userId);
      }
    }

    this.#scope = next;
    this.#data = null;
    clearTimeout(this.#backupTimer);
    this.#backupTimer = null;
    this.#emit("scope:changed", this.getScope());
    return this.getScope();
  }

  #dataKey() {
    return this.#scope.mode === "legacy"
      ? DATA_KEY
      : `${NAMESPACE}:data:${this.#scope.userId}:${this.#scope.workspaceId}`;
  }

  #backupKey() {
    return this.#scope.mode === "legacy"
      ? BACKUP_KEY
      : `${NAMESPACE}:backups:${this.#scope.userId}:${this.#scope.workspaceId}`;
  }

  load() {
    if (this.#data) return this.#data;
    const stored = safeJSONParse(localStorage.getItem(this.#dataKey()), null);
    this.#data = migrate(stored);
    this.#data.activity.lastOpenedAt = new Date().toISOString();
    this.#persist(false);
    return this.#data;
  }

  getData() {
    return structuredClone(this.load());
  }

  getSettings() {
    return structuredClone(this.load().settings);
  }

  getCollection(name) {
    const collection = this.load()[name];
    return Array.isArray(collection) ? structuredClone(collection) : [];
  }

  setSettings(patch) {
    this.load().settings = { ...this.load().settings, ...patch };
    this.#touch();
    this.#persist();
    this.#emit("settings:changed", this.getSettings());
    return this.getSettings();
  }

  replaceCollection(name, values) {
    if (!Array.isArray(values)) throw new TypeError(`A coleção ${name} precisa ser um array.`);
    this.load()[name] = structuredClone(values);
    this.#touch();
    this.#persist();
    this.#emit(`${name}:changed`, this.getCollection(name));
    this.#emit("data:changed", { collection: name });
    return this.getCollection(name);
  }

  add(name, item) {
    const collection = this.load()[name];
    if (!Array.isArray(collection)) throw new Error(`Coleção desconhecida: ${name}`);
    const record = {
      id: item.id || uid(name.slice(0, -1) || "item"),
      createdAt: item.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...structuredClone(item)
    };
    collection.push(record);
    this.#touch();
    this.#persist();
    this.#emit(`${name}:changed`, this.getCollection(name));
    this.#emit("data:changed", { collection: name, action: "add", id: record.id });
    return structuredClone(record);
  }

  update(name, id, patch) {
    const collection = this.load()[name];
    if (!Array.isArray(collection)) throw new Error(`Coleção desconhecida: ${name}`);
    const index = collection.findIndex((item) => item.id === id);
    if (index < 0) return null;
    collection[index] = { ...collection[index], ...structuredClone(patch), id, updatedAt: new Date().toISOString() };
    this.#touch();
    this.#persist();
    this.#emit(`${name}:changed`, this.getCollection(name));
    this.#emit("data:changed", { collection: name, action: "update", id });
    return structuredClone(collection[index]);
  }

  remove(name, id) {
    const collection = this.load()[name];
    if (!Array.isArray(collection)) throw new Error(`Coleção desconhecida: ${name}`);
    const before = collection.length;
    this.load()[name] = collection.filter((item) => item.id !== id);
    const removed = this.load()[name].length !== before;
    if (removed) {
      this.#touch();
      this.#persist();
      this.#emit(`${name}:changed`, this.getCollection(name));
      this.#emit("data:changed", { collection: name, action: "remove", id });
    }
    return removed;
  }

  clearAll({ preserveAuth = true } = {}) {
    if (this.getSettings().autoBackup) this.createBackup("before-reset");
    this.#data = createDefaultData();
    localStorage.setItem(this.#dataKey(), JSON.stringify(this.#data));
    if (!preserveAuth) localStorage.removeItem(AUTH_KEY);
    this.#emit("data:reset", this.getData());
    this.#emit("data:changed", { action: "reset" });
  }

  exportData() {
    return {
      app: "Fluxo",
      schemaVersion: CURRENT_SCHEMA,
      exportedAt: new Date().toISOString(),
      scope: this.getScope(),
      data: this.getData()
    };
  }

  applyCloudState({ settings, collections, updatedAt } = {}) {
    const current = this.load();
    this.#data = ensureCollections({
      ...current,
      settings: { ...current.settings, ...(settings || {}) },
      transactions: Array.isArray(collections?.transactions) ? collections.transactions : current.transactions,
      goals: Array.isArray(collections?.goals) ? collections.goals : current.goals,
      debts: Array.isArray(collections?.debts) ? collections.debts : current.debts,
      monthlyGoals: Array.isArray(collections?.monthlyGoals) ? collections.monthlyGoals : current.monthlyGoals,
      updatedAt: updatedAt || new Date().toISOString()
    });
    this.#persist(false);
    this.#emit("cloud:applied", this.getData());
    return this.getData();
  }

  importData(payload) {
    const source = payload?.data || payload;
    if (!source || typeof source !== "object" || !Array.isArray(source.transactions) || !source.settings || typeof source.settings !== "object") {
      throw new Error("O arquivo não possui uma estrutura de backup válida.");
    }
    const imported = migrate(source);
    if (this.getSettings().autoBackup) this.createBackup("before-import");
    this.#data = imported;
    this.#touch();
    this.#persist(false);
    this.#emit("data:imported", this.getData());
    this.#emit("data:changed", { action: "import" });
    return this.getData();
  }

  createBackup(reason = "automatic") {
    const backups = safeJSONParse(localStorage.getItem(this.#backupKey()), []);
    const safeBackups = Array.isArray(backups) ? backups : [];
    safeBackups.unshift({
      id: uid("backup"),
      reason,
      createdAt: new Date().toISOString(),
      data: this.getData()
    });
    localStorage.setItem(this.#backupKey(), JSON.stringify(safeBackups.slice(0, 5)));
    this.load().activity.lastBackupAt = new Date().toISOString();
    this.#persist(false);
    this.#emit("backup:created", { reason });
  }

  listBackups() {
    const backups = safeJSONParse(localStorage.getItem(this.#backupKey()), []);
    return Array.isArray(backups) ? backups.map(({ data, ...meta }) => meta) : [];
  }

  restoreBackup(id) {
    const backups = safeJSONParse(localStorage.getItem(this.#backupKey()), []);
    const backup = Array.isArray(backups) ? backups.find((item) => item.id === id) : null;
    if (!backup) throw new Error("Backup não encontrado.");
    this.#data = migrate(backup.data);
    this.#touch();
    this.#persist(false);
    this.#emit("data:imported", this.getData());
    this.#emit("data:changed", { action: "restore" });
  }

  getAuth() {
    return safeJSONParse(localStorage.getItem(AUTH_KEY), null);
  }

  setAuth(authData) {
    localStorage.setItem(AUTH_KEY, JSON.stringify(authData));
    this.#emit("auth:changed", { configured: true });
  }

  removeAuth() {
    localStorage.removeItem(AUTH_KEY);
    this.#emit("auth:changed", { configured: false });
  }

  getStorageUsage() {
    let bytes = 0;
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(NAMESPACE)) {
        bytes += new Blob([key, localStorage.getItem(key) || ""]).size;
      }
    }
    return { bytes, estimatedLimit: 5 * 1024 * 1024, percent: Math.min(100, (bytes / (5 * 1024 * 1024)) * 100) };
  }

  loadDemoData() {
    const today = new Date();
    const transactions = [];
    const incomeSources = ["Social Media", "Motoboy", "Freelancer", "Venda"];
    const expenseCategories = ["Moradia", "Alimentação", "Gasolina", "Internet", "Ferramentas", "Cursos", "Lazer", "Impostos"];
    const clients = ["Studio Norte", "Mercado Central", "Clínica Aurora", "Loja Vértice", "Projeto próprio"];

    for (let monthOffset = -7; monthOffset <= 0; monthOffset += 1) {
      const reference = addMonths(today, monthOffset);
      const incomeCount = 5 + ((monthOffset + 8) % 3);
      const expenseCount = 7 + ((monthOffset + 9) % 4);

      for (let index = 0; index < incomeCount; index += 1) {
        const date = new Date(reference.getFullYear(), reference.getMonth(), Math.min(27, 3 + index * 4), 12);
        const category = incomeSources[index % incomeSources.length];
        const amount = roundMoney(480 + ((monthOffset + 8) * 115) + index * 175 + (index % 2) * 90);
        transactions.push({
          id: uid("transaction"), type: "income", date: toISODate(date), value: amount,
          category, origin: category, description: `Receita de ${category.toLowerCase()}`,
          note: index % 2 ? "Projeto mensal" : "Serviço concluído", clientName: clients[index % clients.length],
          status: "received", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
        });
      }

      for (let index = 0; index < expenseCount; index += 1) {
        const date = new Date(reference.getFullYear(), reference.getMonth(), Math.min(28, 2 + index * 3), 12);
        const category = expenseCategories[index % expenseCategories.length];
        const amount = roundMoney(65 + index * 41 + ((monthOffset + 8) % 3) * 26);
        transactions.push({
          id: uid("transaction"), type: "expense", date: toISODate(date), value: amount,
          category, description: `${category} — despesa mensal`, paymentMethod: index % 3 === 0 ? "Pix" : "Crédito",
          status: "paid", isInstallment: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
        });
      }
    }

    const currentMonth = monthKey(today);
    const goals = [
      { id: uid("goal"), name: "Reserva de emergência", type: "Reserva de emergência", targetValue: 12000, currentValue: 4200, deadline: toISODate(addMonths(today, 8)), color: "#635bff" },
      { id: uid("goal"), name: "Notebook profissional", type: "Comprar equipamento", targetValue: 8500, currentValue: 3100, deadline: toISODate(addMonths(today, 5)), color: "#14966f" },
      { id: uid("goal"), name: "Quitar cartão", type: "Quitar dívida", targetValue: 3200, currentValue: 1800, deadline: toISODate(addMonths(today, 3)), color: "#d98516" }
    ].map((item) => ({ ...item, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }));

    const debts = [
      { id: uid("debt"), name: "Parcelamento do equipamento", principalValue: 4800, installments: 12, interestRate: 1.2, startDate: toISODate(addMonths(today, -3)), paidAmount: 1320, status: "active", dueDay: 10 },
      { id: uid("debt"), name: "Curso profissional", principalValue: 1800, installments: 6, interestRate: 0, startDate: toISODate(addMonths(today, -2)), paidAmount: 600, status: "active", dueDay: 18 }
    ].map((item) => ({ ...item, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }));

    const monthlyGoals = [
      { id: uid("monthlyGoal"), type: "Receita", value: 7000, month: currentMonth, color: "#635bff" },
      { id: uid("monthlyGoal"), type: "Economia", value: 1800, month: currentMonth, color: "#14966f" },
      { id: uid("monthlyGoal"), type: "Investimentos", value: 600, month: currentMonth, color: "#1787c9" },
      { id: uid("monthlyGoal"), type: "Clientes", value: 8, month: currentMonth, color: "#d98516" }
    ].map((item) => ({ ...item, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }));

    if (this.getSettings().autoBackup && this.load().transactions.length) this.createBackup("before-demo");
    this.#data = ensureCollections({
      ...this.load(),
      transactions,
      goals,
      debts,
      monthlyGoals,
      settings: { ...this.getSettings(), userName: this.getSettings().userName || "Profissional autônomo", monthlyTarget: 7000 }
    });
    this.#touch();
    this.#persist(false);
    this.#emit("data:changed", { action: "demo" });
    return this.getData();
  }

  #touch() {
    this.load().updatedAt = new Date().toISOString();
  }

  #persist(allowAutoBackup = true) {
    try {
      localStorage.setItem(this.#dataKey(), JSON.stringify(this.#data));
      if (allowAutoBackup && this.#data?.settings?.autoBackup) this.#maybeAutoBackup();
    } catch (error) {
      this.#emit("storage:error", { error });
      throw error;
    }
  }

  #maybeAutoBackup() {
    const last = this.#data?.activity?.lastBackupAt ? new Date(this.#data.activity.lastBackupAt) : null;
    const elapsed = last ? Date.now() - last.getTime() : Infinity;
    if (elapsed >= 24 * 60 * 60 * 1000 && !this.#backupTimer) {
      this.#backupTimer = setTimeout(() => {
        this.#backupTimer = null;
        this.createBackup("automatic");
      }, 80);
    }
  }

  #emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }
}

export const storage = new StorageService();
export { CURRENT_SCHEMA, DATA_KEY, AUTH_KEY, BACKUP_KEY, defaultSettings, NAMESPACE };
