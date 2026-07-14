/**
 * Ponto de entrada da aplicação.
 * Coordena autenticação local/nuvem, rotas, tema, sincronização, PWA e inatividade.
 */

import { renderDashboard, renderEvolution, renderProductivity, renderStats } from "./dashboard.js";
import { cloud } from "./cloud.js";
import { storage } from "./storage.js";
import { ui } from "./ui.js";
import { applyTranslations, debounce, hashPassword, randomSalt } from "./utils.js";

class FinanceApp {
  #route = "dashboard";
  #authenticated = false;
  #inactivityTimer = null;
  #systemThemeMedia = matchMedia("(prefers-color-scheme: dark)");
  #lastAuthEmail = "";

  constructor() {
    storage.load();
    cloud.bindStorage();
    this.applySettings();
    this.bindGlobalEvents();
    this.registerServiceWorker();
    this.bootstrap();
  }

  async bootstrap() {
    if (cloud.isCloudMode()) {
      try {
        const session = await cloud.getSession();
        if (session) {
          await cloud.syncNow({ initial: true });
          this.unlock();
          return;
        }
      } catch (error) {
        this.initializeAuth(error.message || "Não foi possível conectar ao Supabase.");
        return;
      }
    }
    this.initializeAuth();
  }

  initializeAuth(message = "") {
    this.#authenticated = false;
    this.stopInactivityTimer();
    document.getElementById("app-shell").classList.add("is-hidden");
    document.getElementById("auth-screen").classList.remove("is-hidden");
    const authContent = document.getElementById("auth-content");

    if (cloud.getMode() === "setup") {
      authContent.innerHTML = ui.renderCloudSetup(message);
      this.bindCloudConfigForm();
      return;
    }

    if (cloud.isCloudMode()) {
      authContent.innerHTML = ui.renderCloudLogin(message, this.#lastAuthEmail);
      this.bindCloudLoginForm();
      return;
    }

    const auth = storage.getAuth();
    authContent.innerHTML = auth ? ui.renderAuthLogin(message) : ui.renderAuthSetup();
    if (auth) this.bindLoginForm();
    else this.bindSetupForm();
  }

  showCloudLogin(message = "", email = "") {
    this.#lastAuthEmail = email || this.#lastAuthEmail;
    document.getElementById("auth-content").innerHTML = ui.renderCloudLogin(message, this.#lastAuthEmail);
    this.bindCloudLoginForm();
  }

  showCloudRegister(message = "", email = "") {
    this.#lastAuthEmail = email || this.#lastAuthEmail;
    document.getElementById("auth-content").innerHTML = ui.renderCloudRegister(message, this.#lastAuthEmail);
    this.bindCloudRegisterForm();
  }

  showCloudSetup(message = "") {
    document.getElementById("auth-content").innerHTML = ui.renderCloudSetup(message);
    this.bindCloudConfigForm();
  }

  bindCloudConfigForm() {
    const form = document.getElementById("cloud-config-form");
    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;
      submit.textContent = "Validando conexão…";
      try {
        const data = Object.fromEntries(new FormData(form));
        cloud.saveConfig(data.url, data.key);
        await cloud.initialize();
        this.showCloudRegister("Conexão configurada. Agora crie sua conta pessoal.");
        ui.toast("Conexão com o Supabase configurada.");
      } catch (error) {
        ui.toast(error.message || "Não foi possível configurar a conexão.", "error");
        submit.disabled = false;
        submit.textContent = "Conectar ao Supabase";
      }
    });
  }

  bindCloudLoginForm() {
    const form = document.getElementById("cloud-login-form");
    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      this.#lastAuthEmail = String(data.email || "").trim();
      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;
      submit.textContent = "Entrando e sincronizando…";
      try {
        await cloud.signIn(data);
      } catch (error) {
        ui.toast(error.message || "Não foi possível entrar.", "error");
        submit.disabled = false;
        submit.textContent = "Entrar e sincronizar";
      }
    });
  }

  bindCloudRegisterForm() {
    const form = document.getElementById("cloud-register-form");
    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      if (String(data.password).length < 6) return ui.toast("Use uma senha com pelo menos 6 caracteres.", "error");
      if (data.password !== data.confirm) return ui.toast("A confirmação da senha não confere.", "error");
      this.#lastAuthEmail = String(data.email || "").trim();
      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;
      submit.textContent = "Criando conta…";
      try {
        const result = await cloud.signUp(data);
        if (!result.session) {
          document.getElementById("auth-content").innerHTML = ui.renderCloudConfirmation(this.#lastAuthEmail);
        }
      } catch (error) {
        ui.toast(error.message || "Não foi possível criar a conta.", "error");
        submit.disabled = false;
        submit.textContent = "Criar conta e sincronizar";
      }
    });
  }

  bindSetupForm() {
    const form = document.getElementById("auth-setup-form");
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      if (String(data.password).length < 4) return ui.toast("Use uma senha com pelo menos 4 caracteres.", "error");
      if (data.password !== data.confirm) return ui.toast("A confirmação da senha não confere.", "error");
      try {
        const salt = randomSalt();
        const passwordHash = await hashPassword(data.password, salt);
        storage.setAuth({ salt, passwordHash, createdAt: new Date().toISOString(), version: 1 });
        storage.setSettings({ userName: String(data.name || "Meu financeiro").trim() || "Meu financeiro" });
        this.unlock();
        ui.toast("Acesso local criado.");
      } catch {
        ui.toast("Seu navegador não permitiu criar a proteção local.", "error");
      }
    });
  }

  bindLoginForm() {
    const form = document.getElementById("auth-login-form");
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const password = new FormData(form).get("password");
      const auth = storage.getAuth();
      try {
        const candidate = await hashPassword(password, auth.salt);
        if (candidate !== auth.passwordHash) {
          form.reset();
          document.getElementById("login-password")?.focus();
          return ui.toast("Senha incorreta.", "error");
        }
        this.unlock();
      } catch {
        ui.toast("Não foi possível validar a senha neste navegador.", "error");
      }
    });
  }

  unlock() {
    this.#authenticated = true;
    document.getElementById("auth-screen").classList.add("is-hidden");
    document.getElementById("app-shell").classList.remove("is-hidden");
    this.updateProfileUI();
    this.updateSyncUI(cloud.getState());
    this.#route = this.getRouteFromHash();
    this.renderRoute(this.#route);
    this.startInactivityTimer();
  }

  async lock(message = "Sessão bloqueada por segurança.") {
    document.body.classList.remove("mobile-menu-open");
    ui.closeModal();
    if (cloud.isCloudMode() && cloud.getState().signedIn) {
      try { await cloud.signOut(); }
      catch (error) { ui.toast(error.message, "error"); }
      return;
    }
    if (cloud.isLocalMode() && storage.getAuth()) this.initializeAuth(message);
  }

  getRouteFromHash() {
    const route = location.hash.replace(/^#\/?/, "");
    return ["dashboard", "cashflow", "calendar", "goals", "debts", "monthly-goals", "stats", "evolution", "productivity", "settings"].includes(route) ? route : "dashboard";
  }

  navigate(route) {
    if (!route) return;
    location.hash = `#/${route}`;
    if (this.#route === route) this.renderRoute(route);
  }

  renderRoute(route = this.#route) {
    if (!this.#authenticated) return;
    this.#route = route;
    ui.setPageMeta(route);
    document.querySelectorAll(".nav-item[data-route]").forEach((item) => item.classList.toggle("is-active", item.dataset.route === route));
    document.body.classList.remove("mobile-menu-open");
    const container = document.getElementById("page-container");
    const skeleton = document.getElementById("skeleton");
    container.classList.add("is-hidden");
    skeleton.classList.remove("is-hidden");

    const view = this.getView(route);
    requestAnimationFrame(() => {
      container.innerHTML = view.html;
      skeleton.classList.add("is-hidden");
      container.classList.remove("is-hidden");
      container.focus({ preventScroll: true });
      view.afterRender?.();
    });
  }

  getView(route) {
    const views = {
      dashboard: renderDashboard,
      cashflow: () => ui.renderCashflow(),
      calendar: () => ui.renderCalendar(),
      goals: () => ui.renderGoals(),
      debts: () => ui.renderDebts(),
      "monthly-goals": () => ui.renderMonthlyGoals(),
      stats: renderStats,
      evolution: renderEvolution,
      productivity: renderProductivity,
      settings: () => ui.renderSettings()
    };
    return (views[route] || views.dashboard)();
  }

  bindGlobalEvents() {
    window.addEventListener("hashchange", () => this.#authenticated && this.renderRoute(this.getRouteFromHash()));

    document.addEventListener("click", async (event) => {
      const authAction = event.target.closest("[data-auth-action]");
      if (authAction) {
        event.preventDefault();
        const action = authAction.dataset.authAction;
        if (action === "show-cloud-register") this.showCloudRegister("", authAction.dataset.email || "");
        if (action === "show-cloud-login") this.showCloudLogin("", authAction.dataset.email || "");
        if (action === "show-cloud-setup") this.showCloudSetup();
        if (action === "use-local-mode") {
          cloud.useLocalMode();
          this.initializeAuth();
        }
        return;
      }
      const routeElement = event.target.closest("[data-route]");
      if (routeElement) {
        event.preventDefault();
        this.navigate(routeElement.dataset.route);
        return;
      }
      const closeElement = event.target.closest("[data-close-modal]");
      if (closeElement) {
        event.preventDefault();
        ui.closeModal();
        return;
      }
      const actionElement = event.target.closest("[data-action]");
      if (actionElement) {
        event.preventDefault();
        await ui.handleAction(actionElement.dataset.action, actionElement);
      }
    });

    document.getElementById("theme-toggle").addEventListener("click", () => this.toggleTheme());
    document.getElementById("lock-button").addEventListener("click", () => this.lock("Sistema bloqueado manualmente."));
    document.getElementById("sidebar-collapse").addEventListener("click", () => {
      const collapsed = !document.body.classList.contains("sidebar-collapsed");
      document.body.classList.toggle("sidebar-collapsed", collapsed);
      storage.setSettings({ sidebarCollapsed: collapsed });
    });
    document.getElementById("mobile-menu").addEventListener("click", () => document.body.classList.add("mobile-menu-open"));
    document.getElementById("sidebar-backdrop").addEventListener("click", () => document.body.classList.remove("mobile-menu-open"));

    const syncStatus = document.getElementById("sync-status");
    syncStatus.addEventListener("click", async () => {
      if (!cloud.isCloudMode()) return this.navigate("settings");
      const ok = await cloud.syncNow();
      ui.toast(ok ? "Sincronização concluída." : "Os dados continuam salvos localmente.", ok ? "success" : "warning");
    });

    const globalSearch = document.getElementById("global-search");
    const triggerSearch = debounce(() => {
      const value = globalSearch.value.trim();
      if (!value) return;
      ui.setGlobalSearch(value);
      this.navigate("cashflow");
    }, 350);
    globalSearch.addEventListener("input", triggerSearch);
    globalSearch.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        ui.setGlobalSearch(globalSearch.value.trim());
        this.navigate("cashflow");
      }
    });

    document.getElementById("json-import-input").addEventListener("change", (event) => ui.importJSONFile(event.target.files?.[0]));
    document.getElementById("avatar-input").addEventListener("change", (event) => ui.setAvatarFromFile(event.target.files?.[0]));

    ui.addEventListener("ui:refresh", () => this.renderRoute(this.#route));
    ui.addEventListener("ui:settings-changed", () => {
      this.applySettings();
      this.updateProfileUI();
      this.startInactivityTimer();
    });
    ui.addEventListener("ui:change-password", (event) => this.changePassword(event.detail));
    ui.addEventListener("ui:auth-reset", () => this.initializeAuth());

    storage.addEventListener("storage:error", () => ui.toast("O navegador não conseguiu salvar o cache local. Exporte um backup e libere espaço.", "error"));
    cloud.addEventListener("auth:signed-in", () => {
      this.unlock();
      ui.toast("Conta conectada e dados sincronizados.");
    });
    cloud.addEventListener("auth:signed-out", () => this.initializeAuth("Sessão encerrada. Entre novamente para sincronizar."));
    cloud.addEventListener("data:applied", () => {
      this.applySettings();
      this.updateProfileUI();
      if (this.#authenticated) this.renderRoute(this.#route);
    });
    cloud.addEventListener("status", (event) => this.updateSyncUI(event.detail));
    cloud.addEventListener("queue:changed", () => this.updateSyncUI(cloud.getState()));
    cloud.addEventListener("error", (event) => {
      if (this.#authenticated) ui.toast(event.detail.error?.message || "A sincronização encontrou um problema.", "warning");
    });

    this.#systemThemeMedia.addEventListener("change", () => {
      if (storage.getSettings().theme === "system") this.applyTheme("system");
    });

    ["pointerdown", "keydown", "scroll", "touchstart"].forEach((type) => window.addEventListener(type, () => {
      if (this.#authenticated) this.resetInactivityTimer();
    }, { passive: true }));

    document.addEventListener("keydown", (event) => this.handleKeyboardShortcut(event));
    window.addEventListener("online", () => ui.toast("Conexão restaurada. Sincronizando alterações…"));
    window.addEventListener("offline", () => ui.toast("Você está offline. As alterações ficarão pendentes e serão enviadas depois.", "warning"));
  }

  handleKeyboardShortcut(event) {
    if (event.key === "Escape" && document.getElementById("modal-root").children.length) return ui.closeModal();
    if (!this.#authenticated || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target;
    const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
    if (event.key === "/" && !typing) {
      event.preventDefault();
      document.getElementById("global-search").focus();
    }
    if (typing) return;
    if (event.key.toLowerCase() === "n") ui.openTransactionModal();
    if (event.key.toLowerCase() === "d") this.navigate("dashboard");
    if (event.key.toLowerCase() === "t") this.toggleTheme();
  }

  async changePassword({ current, next, confirm }) {
    if (next !== confirm || String(next).length < (cloud.isCloudMode() ? 6 : 4)) {
      return ui.toast("A nova senha não atende ao tamanho mínimo ou a confirmação não coincide.", "error");
    }
    try {
      if (cloud.isCloudMode()) {
        await cloud.changePassword(current, next);
      } else {
        const auth = storage.getAuth();
        if (!auth) return;
        const currentHash = await hashPassword(current, auth.salt);
        if (currentHash !== auth.passwordHash) return ui.toast("A senha atual está incorreta.", "error");
        const salt = randomSalt();
        const passwordHash = await hashPassword(next, salt);
        storage.setAuth({ ...auth, salt, passwordHash, updatedAt: new Date().toISOString() });
      }
      ui.closeModal();
      ui.toast("Senha alterada com sucesso.");
    } catch (error) {
      ui.toast(error.message || "Não foi possível alterar a senha.", "error");
    }
  }

  applySettings() {
    const settings = storage.getSettings();
    document.body.classList.toggle("sidebar-collapsed", Boolean(settings.sidebarCollapsed));
    document.documentElement.style.setProperty("--primary", settings.accentColor || "#635bff");
    document.documentElement.style.setProperty("--primary-hover", settings.accentColor || "#635bff");
    document.documentElement.style.setProperty("--primary-soft", `${settings.accentColor || "#635bff"}1f`);
    this.applyTheme(settings.theme);
    applyTranslations(settings.locale);
  }

  applyTheme(theme) {
    const resolved = theme === "system" ? (this.#systemThemeMedia.matches ? "dark" : "light") : theme;
    document.documentElement.dataset.theme = resolved;
    document.querySelector('meta[name="theme-color"]').setAttribute("content", resolved === "dark" ? "#0b0d12" : "#f6f7f9");
  }

  toggleTheme() {
    const current = document.documentElement.dataset.theme;
    const next = current === "dark" ? "light" : "dark";
    storage.setSettings({ theme: next });
    this.applyTheme(next);
    ui.toast(`Tema ${next === "dark" ? "escuro" : "claro"} ativado.`);
    if (this.#authenticated) this.renderRoute(this.#route);
  }

  updateProfileUI() {
    const settings = storage.getSettings();
    document.getElementById("sidebar-user-name").textContent = settings.userName || "Meu financeiro";
    document.getElementById("sidebar-avatar").src = /^data:image\/(png|jpeg|webp);base64,/i.test(settings.avatar || "") ? settings.avatar : "./assets/images/avatar-placeholder.svg";
    const storageLabel = document.getElementById("sidebar-storage-label");
    if (storageLabel) {
      const state = cloud.getState();
      storageLabel.textContent = state.signedIn ? "Nuvem + acesso offline" : state.mode === "local" ? "Somente neste dispositivo" : "Sincronização não configurada";
    }
  }

  updateSyncUI(state = cloud.getState()) {
    const button = document.getElementById("sync-status");
    if (!button) return;
    const labels = {
      synced: "Sincronizado", syncing: "Sincronizando", pending: "Pendente", offline: "Offline",
      error: "Atenção", "signed-out": "Desconectado", local: "Somente local", setup: "Configurar nuvem"
    };
    button.dataset.status = state.status;
    button.title = `${state.message}${state.pending ? ` • ${state.pending} pendente(s)` : ""}`;
    button.querySelector("span").textContent = labels[state.status] || "Sincronização";
  }

  startInactivityTimer() {
    this.stopInactivityTimer();
    this.resetInactivityTimer();
  }

  resetInactivityTimer() {
    clearTimeout(this.#inactivityTimer);
    const minutes = Number(storage.getSettings().inactivityMinutes || 0);
    if (!minutes) return;
    this.#inactivityTimer = setTimeout(() => this.lock("Sessão bloqueada após um período de inatividade."), minutes * 60 * 1000);
  }

  stopInactivityTimer() {
    clearTimeout(this.#inactivityTimer);
    this.#inactivityTimer = null;
  }

  async registerServiceWorker() {
    if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
    try { await navigator.serviceWorker.register("./service-worker.js", { scope: "./" }); }
    catch (error) { console.warn("Service Worker não registrado:", error); }
  }
}

new FinanceApp();
