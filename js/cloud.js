/**
 * Integração com Supabase, sincronização offline e espaços financeiros.
 *
 * Cada usuário possui um espaço pessoal e pode participar de espaços de outras
 * pessoas como editor ou visualizador, sempre com cache local isolado.
 */

import { APP_CONFIG, hasBundledCloudConfig } from "./config.js";
import { storage } from "./storage.js";

const SUPABASE_MODULE_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.3/+esm";
const CLOUD_CONFIG_KEY = "fluxo_finance_v1:cloud-config";
const SYNC_QUEUE_KEY = "fluxo_finance_v1:sync-queue";
const AUTH_STORAGE_KEY = "fluxo_finance_supabase_auth";
const ACTIVE_SPACE_KEY = "fluxo_finance_v1:active-space";
const COLLECTIONS = ["transactions", "goals", "debts", "monthlyGoals"];
const COLLECTION_DB_NAMES = {
  transactions: "transactions",
  goals: "goals",
  debts: "debts",
  monthlyGoals: "monthly_goals"
};
const DB_COLLECTION_NAMES = Object.fromEntries(Object.entries(COLLECTION_DB_NAMES).map(([key, value]) => [value, key]));

function safeParse(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; }
  catch { return fallback; }
}

function isoNow() { return new Date().toISOString(); }
function timestamp(value) {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function validatePublicKey(key) {
  const trimmed = String(key || "").trim();
  if (!trimmed) throw new Error("Informe a chave pública do projeto.");
  if (/^sb_secret_/i.test(trimmed) || /service[_-]?role/i.test(trimmed)) {
    throw new Error("Não use uma chave secreta ou service_role no navegador. Use apenas Publishable key ou anon key.");
  }
  if (trimmed.split(".").length === 3) {
    try {
      const payload = JSON.parse(atob(trimmed.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      if (payload?.role === "service_role") throw new Error("A chave service_role nunca pode ser colocada no frontend.");
    } catch (error) {
      if (/service_role/.test(error.message)) throw error;
    }
  }
  return trimmed;
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

class CloudService extends EventTarget {
  #client = null;
  #session = null;
  #status = "setup";
  #message = "Configure a sincronização";
  #syncing = false;
  #bound = false;
  #applyingRemote = false;
  #syncTimer = null;
  #pullTimer = null;
  #realtimeChannel = null;
  #pollTimer = null;
  #spaces = [];
  #activeSpaceId = null;
  #activeRole = null;

  getConfig() {
    if (hasBundledCloudConfig()) {
      return {
        mode: "cloud",
        url: APP_CONFIG.supabaseUrl.trim().replace(/\/$/, ""),
        key: APP_CONFIG.supabasePublishableKey.trim(),
        bundled: true
      };
    }
    return safeParse(localStorage.getItem(CLOUD_CONFIG_KEY), null);
  }

  isBundledConfig() { return Boolean(this.getConfig()?.bundled); }
  canUseLocalMode() { return Boolean(APP_CONFIG.allowLocalMode); }

  getMode() {
    return this.getConfig()?.mode || "setup";
  }

  isCloudMode() { return this.getMode() === "cloud"; }
  isLocalMode() { return this.getMode() === "local"; }
  isConfigured() {
    const config = this.getConfig();
    return config?.mode === "cloud" && Boolean(config.url && config.key);
  }

  saveConfig(url, key) {
    if (hasBundledCloudConfig()) return;
    const normalizedUrl = String(url || "").trim().replace(/\/$/, "");
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(normalizedUrl)) {
      throw new Error("A URL deve ter o formato https://seu-projeto.supabase.co");
    }
    const publicKey = validatePublicKey(key);
    localStorage.setItem(CLOUD_CONFIG_KEY, JSON.stringify({ mode: "cloud", url: normalizedUrl, key: publicKey }));
    this.#client = null;
    this.#session = null;
    this.#setStatus("signed-out", "Entre para sincronizar");
  }

  useLocalMode() {
    if (!this.canUseLocalMode()) throw new Error("O modo local foi desativado nesta publicação.");
    this.stopRealtime();
    localStorage.setItem(CLOUD_CONFIG_KEY, JSON.stringify({ mode: "local" }));
    this.#client = null;
    this.#session = null;
    this.#spaces = [];
    this.#activeSpaceId = null;
    this.#activeRole = null;
    storage.setScope({ userId: "local", workspaceId: "local" });
    this.#setStatus("local", "Somente neste dispositivo");
  }

  async resetConfiguration() {
    try { await this.signOut(); } catch { /* configuração pode estar inválida */ }
    if (!this.isBundledConfig()) localStorage.removeItem(CLOUD_CONFIG_KEY);
    this.#client = null;
    this.#session = null;
    this.#spaces = [];
    this.#activeSpaceId = null;
    this.#activeRole = null;
    this.#setStatus(this.isBundledConfig() ? "signed-out" : "setup", this.isBundledConfig() ? "Entre para sincronizar" : "Configure a sincronização");
  }

  async initialize() {
    if (!this.isConfigured()) return null;
    if (this.#client) return this.#client;
    const config = this.getConfig();
    validatePublicKey(config.key);
    const { createClient } = await import(SUPABASE_MODULE_URL);
    this.#client = createClient(config.url, config.key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce",
        storageKey: AUTH_STORAGE_KEY
      }
    });
    this.#client.auth.onAuthStateChange((event, session) => {
      this.#session = session;
      if (event === "SIGNED_OUT") {
        this.stopRealtime();
        this.#spaces = [];
        this.#activeSpaceId = null;
        this.#activeRole = null;
        this.#setStatus("signed-out", "Sessão encerrada");
        this.dispatchEvent(new CustomEvent("auth:signed-out"));
      }
    });
    return this.#client;
  }

  async getSession() {
    const client = await this.initialize();
    if (!client) return null;
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    this.#session = data.session;
    if (this.#session) {
      await this.#prepareWorkspace();
      this.#setStatus(navigator.onLine ? "pending" : "offline", navigator.onLine ? "Preparando sincronização" : "Trabalhando offline");
    }
    return this.#session;
  }

  getUser() { return this.#session?.user || null; }
  getUserEmail() { return this.getUser()?.email || ""; }
  getSpaces() { return structuredClone(this.#spaces); }
  getActiveWorkspaceId() { return this.#activeSpaceId; }
  getActiveWorkspace() { return this.#spaces.find((space) => space.space_owner_id === this.#activeSpaceId) || null; }
  getActiveRole() { return this.#activeRole || "viewer"; }
  isOwner() { return this.getActiveRole() === "owner"; }
  canEdit() { return ["owner", "editor"].includes(this.getActiveRole()); }

  getState() {
    const mode = this.getMode();
    let status = this.#status;
    let message = this.#message;
    if (mode === "local" && status === "setup") {
      status = "local";
      message = "Dados somente neste dispositivo";
    } else if (mode === "cloud" && !this.#session && status === "setup") {
      status = "signed-out";
      message = "Entre para sincronizar";
    }
    return {
      mode,
      configured: this.isConfigured(),
      bundledConfig: this.isBundledConfig(),
      signedIn: Boolean(this.#session),
      email: this.getUserEmail(),
      status,
      message,
      pending: this.getPendingCount(),
      lastSyncAt: safeParse(localStorage.getItem(`${this.#queueKey()}:meta`), {})?.lastSyncAt || null,
      spaces: this.getSpaces(),
      workspace: this.getActiveWorkspace(),
      role: this.getActiveRole(),
      canEdit: this.canEdit()
    };
  }

  async signUp({ email, password, name }) {
    const client = await this.initialize();
    const { data, error } = await client.auth.signUp({
      email: normalizeEmail(email),
      password: String(password || ""),
      options: {
        data: { name: String(name || "Meu financeiro").trim() },
        emailRedirectTo: this.#authRedirectUrl()
      }
    });
    if (error) throw error;
    this.#session = data.session;
    if (data.session) {
      await this.#prepareWorkspace(true);
      storage.setSettings({ userName: String(name || "Meu financeiro").trim() || "Meu financeiro" });
      await this.syncNow({ initial: true });
      this.dispatchEvent(new CustomEvent("auth:signed-in", { detail: { session: data.session } }));
    }
    return data;
  }

  async signIn({ email, password }) {
    const client = await this.initialize();
    const { data, error } = await client.auth.signInWithPassword({
      email: normalizeEmail(email),
      password: String(password || "")
    });
    if (error) throw error;
    this.#session = data.session;
    await this.#prepareWorkspace(true);
    await this.syncNow({ initial: true });
    this.dispatchEvent(new CustomEvent("auth:signed-in", { detail: { session: data.session } }));
    return data;
  }

  async signInWithGoogle() {
    const client = await this.initialize();
    const { data, error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: this.#authRedirectUrl(),
        queryParams: { prompt: "select_account" }
      }
    });
    if (error) throw error;
    return data;
  }

  #authRedirectUrl() {
    const configured = String(APP_CONFIG.publicAppUrl || "").trim();
    const url = configured ? new URL(configured) : new URL(location.href);
    const current = new URL(location.href);
    const invite = current.searchParams.get("invite");
    if (invite) url.searchParams.set("invite", invite);
    url.hash = "";
    return url.toString();
  }

  async signOut() {
    if (!this.#client) return;
    this.stopRealtime();
    const { error } = await this.#client.auth.signOut();
    if (error) throw error;
    this.#session = null;
  }

  async changePassword(currentPassword, nextPassword) {
    const email = this.getUserEmail();
    if (!email) throw new Error("Nenhuma conta conectada.");
    const client = await this.initialize();
    const verification = await client.auth.signInWithPassword({ email, password: currentPassword });
    if (verification.error) throw new Error("A senha atual está incorreta ou esta conta utiliza somente o Google.");
    const { error } = await client.auth.updateUser({ password: nextPassword });
    if (error) throw error;
  }

  async #prepareWorkspace(force = false) {
    if (!this.#session) return;
    if (this.#activeSpaceId && this.#spaces.length && !force) return;
    await this.refreshSpaces();
    if (!this.#spaces.length) throw new Error("Nenhum espaço financeiro foi encontrado. Execute o arquivo supabase-upgrade-v3.sql.");
    const userId = this.#session.user.id;
    const stored = localStorage.getItem(`${ACTIVE_SPACE_KEY}:${userId}`);
    const selected = this.#spaces.find((space) => space.space_owner_id === stored)
      || this.#spaces.find((space) => space.space_owner_id === userId)
      || this.#spaces[0];
    this.#setActiveSpace(selected, { migrateLegacy: selected.space_owner_id === userId });
  }

  async refreshSpaces() {
    if (!this.#session) return [];
    const client = await this.initialize();
    const { data, error } = await client.rpc("list_finance_spaces");
    if (error) throw error;
    this.#spaces = (data || []).map((space) => ({
      ...space,
      space_owner_id: String(space.space_owner_id),
      role: String(space.role || "viewer")
    }));
    if (this.#activeSpaceId) {
      const active = this.#spaces.find((space) => space.space_owner_id === this.#activeSpaceId);
      if (active) this.#activeRole = active.role;
    }
    this.dispatchEvent(new CustomEvent("spaces:changed", { detail: { spaces: this.getSpaces() } }));
    return this.getSpaces();
  }

  #setActiveSpace(space, { migrateLegacy = false } = {}) {
    if (!space || !this.#session) return;
    this.stopRealtime();
    this.#activeSpaceId = space.space_owner_id;
    this.#activeRole = space.role;
    localStorage.setItem(`${ACTIVE_SPACE_KEY}:${this.#session.user.id}`, this.#activeSpaceId);
    storage.setScope({
      userId: this.#session.user.id,
      workspaceId: this.#activeSpaceId,
      migrateLegacy
    });
    if (migrateLegacy) {
      const migrationKey = `${SYNC_QUEUE_KEY}:legacy-migrated-to`;
      const migratedTo = localStorage.getItem(migrationKey);
      const scopedQueueKey = this.#queueKey();
      if ((!migratedTo || migratedTo === this.#session.user.id) && !localStorage.getItem(scopedQueueKey)) {
        const legacyQueue = localStorage.getItem(SYNC_QUEUE_KEY);
        const legacyMeta = localStorage.getItem(`${SYNC_QUEUE_KEY}:meta`);
        if (legacyQueue) localStorage.setItem(scopedQueueKey, legacyQueue);
        if (legacyMeta) localStorage.setItem(`${scopedQueueKey}:meta`, legacyMeta);
        if (legacyQueue || legacyMeta) localStorage.setItem(migrationKey, this.#session.user.id);
      }
    }
    this.dispatchEvent(new CustomEvent("workspace:changed", {
      detail: { workspace: this.getActiveWorkspace(), role: this.#activeRole }
    }));
  }

  async switchWorkspace(spaceOwnerId) {
    const space = this.#spaces.find((item) => item.space_owner_id === String(spaceOwnerId));
    if (!space) throw new Error("Você não possui acesso a este espaço financeiro.");
    if (space.space_owner_id === this.#activeSpaceId) return true;
    this.#setActiveSpace(space, { migrateLegacy: space.space_owner_id === this.#session.user.id });
    await this.syncNow({ initial: true });
    return true;
  }

  async createInvite({ email, role }) {
    if (!this.isOwner()) throw new Error("Somente o proprietário pode convidar pessoas.");
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) throw new Error("Informe o e-mail da pessoa convidada.");
    if (!["editor", "viewer"].includes(role)) throw new Error("Escolha uma permissão válida.");
    const client = await this.initialize();
    const { data, error } = await client.rpc("create_finance_invite", {
      p_space_owner_id: this.#activeSpaceId,
      p_email: normalizedEmail,
      p_role: role
    });
    if (error) throw error;
    const invitation = Array.isArray(data) ? data[0] : data;
    return {
      ...invitation,
      email: normalizedEmail,
      role,
      link: this.buildInviteLink(invitation?.token)
    };
  }

  buildInviteLink(token) {
    if (!token) return "";
    const configured = String(APP_CONFIG.publicAppUrl || "").trim();
    const url = configured ? new URL(configured) : new URL(location.href);
    url.searchParams.set("invite", token);
    url.hash = "";
    return url.toString();
  }

  async acceptInvite(token) {
    if (!this.#session) throw new Error("Entre com o e-mail que recebeu o convite.");
    const client = await this.initialize();
    const { data, error } = await client.rpc("accept_finance_invite", { p_token: token });
    if (error) throw error;
    const accepted = Array.isArray(data) ? data[0] : data;
    await this.refreshSpaces();
    if (accepted?.space_owner_id) await this.switchWorkspace(accepted.space_owner_id);
    return accepted;
  }

  async listMembers() {
    if (!this.#activeSpaceId || !this.isOwner()) return [];
    const client = await this.initialize();
    const { data, error } = await client.rpc("list_finance_space_members", { p_space_owner_id: this.#activeSpaceId });
    if (error) throw error;
    return data || [];
  }

  async listPendingInvites() {
    if (!this.#activeSpaceId || !this.isOwner()) return [];
    const client = await this.initialize();
    const { data, error } = await client.from("finance_space_invites")
      .select("id, token, email, role, status, expires_at, created_at")
      .eq("space_owner_id", this.#activeSpaceId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data || []).map((item) => ({ ...item, link: this.buildInviteLink(item.token) }));
  }

  async updateMemberRole(userId, role) {
    if (!this.isOwner()) throw new Error("Somente o proprietário pode alterar permissões.");
    const client = await this.initialize();
    const { error } = await client.rpc("update_finance_member_role", {
      p_space_owner_id: this.#activeSpaceId,
      p_member_user_id: userId,
      p_role: role
    });
    if (error) throw error;
  }

  async removeMember(userId) {
    if (!this.isOwner()) throw new Error("Somente o proprietário pode remover acessos.");
    const client = await this.initialize();
    const { error } = await client.rpc("remove_finance_member", {
      p_space_owner_id: this.#activeSpaceId,
      p_member_user_id: userId
    });
    if (error) throw error;
  }

  async cancelInvite(id) {
    if (!this.isOwner()) throw new Error("Somente o proprietário pode cancelar convites.");
    const client = await this.initialize();
    const { error } = await client.from("finance_space_invites")
      .delete().eq("space_owner_id", this.#activeSpaceId).eq("id", id);
    if (error) throw error;
  }

  bindStorage() {
    if (this.#bound) return;
    this.#bound = true;
    storage.addEventListener("settings:changed", () => {
      if (this.#applyingRemote || !this.isCloudMode() || !this.canEdit()) return;
      this.#queueOperation("profile", { type: "profile", clientUpdatedAt: isoNow() });
    });
    storage.addEventListener("data:changed", (event) => {
      if (this.#applyingRemote || !this.isCloudMode() || !this.canEdit()) return;
      const detail = event.detail || {};
      if (detail.collection && detail.id && ["add", "update"].includes(detail.action)) {
        const record = storage.getCollection(detail.collection).find((item) => item.id === detail.id);
        if (record) this.#queueOperation(`${detail.collection}:${detail.id}`, {
          type: "record", action: "upsert", collection: detail.collection, id: detail.id,
          payload: record, clientUpdatedAt: record.updatedAt || isoNow()
        });
      } else if (detail.collection && detail.id && detail.action === "remove") {
        this.#queueOperation(`${detail.collection}:${detail.id}`, {
          type: "record", action: "delete", collection: detail.collection, id: detail.id,
          clientUpdatedAt: isoNow()
        });
      } else {
        this.#queueOperation("full", { type: "full", reason: detail.action || "collection-replace", clientUpdatedAt: isoNow() });
      }
    });
    window.addEventListener("online", () => {
      if (this.#session) this.syncNow().catch(() => {});
    });
    window.addEventListener("offline", () => this.#setStatus("offline", "Alterações salvas neste dispositivo"));
  }

  async syncNow({ initial = false, quiet = false } = {}) {
    if (!this.isConfigured() || this.#syncing) return false;
    const client = await this.initialize();
    if (!this.#session) await this.getSession();
    if (!this.#session) return false;
    if (!this.#activeSpaceId) await this.#prepareWorkspace();
    if (!navigator.onLine) {
      this.#setStatus("offline", "Alterações salvas neste dispositivo");
      return false;
    }

    this.#syncing = true;
    if (!quiet) this.#setStatus("syncing", initial ? "Carregando seus dados" : "Sincronizando alterações");
    try {
      const spaceId = this.#activeSpaceId;
      const [{ data: profile, error: profileError }, { data: remoteRows, error: recordsError }] = await Promise.all([
        client.from("finance_profiles").select("settings, client_updated_at").eq("user_id", spaceId).maybeSingle(),
        client.from("finance_records").select("collection, record_id, payload, client_updated_at, deleted_at").eq("user_id", spaceId)
      ]);
      if (profileError) throw profileError;
      if (recordsError) throw recordsError;

      this.#mergeRemote(profile, remoteRows || []);
      if (this.canEdit()) await this.#flushQueue();
      this.#writeSyncMeta({ lastSyncAt: isoNow() });
      if (this.getPendingCount() && this.canEdit()) {
        this.#setStatus("pending", "Há alterações aguardando uma nova sincronização");
        this.#scheduleSync();
      } else {
        this.#setStatus("synced", this.canEdit() ? "Todos os dados estão atualizados" : "Acesso somente para visualização atualizado");
      }
      this.startRealtime();
      if (this.canEdit()) this.#scheduleWeeklyBackup();
      return true;
    } catch (error) {
      console.error("Falha de sincronização:", error);
      this.#setStatus("error", this.#friendlyError(error));
      this.dispatchEvent(new CustomEvent("error", { detail: { error } }));
      return false;
    } finally {
      this.#syncing = false;
    }
  }

  #mergeRemote(profile, remoteRows) {
    const local = storage.getData();
    const pending = this.#readQueue().operations;
    const collections = Object.fromEntries(COLLECTIONS.map((name) => [name, storage.getCollection(name)]));
    let changed = false;
    let settingsChanged = false;
    const changedCollections = new Set();

    if (profile?.settings && !pending.profile) {
      collections.__settings = { ...local.settings, ...profile.settings };
      settingsChanged = JSON.stringify(collections.__settings) !== JSON.stringify(local.settings);
      changed = settingsChanged;
    }

    const remoteKeys = new Set();
    for (const row of remoteRows) {
      const localCollection = DB_COLLECTION_NAMES[row.collection];
      if (!localCollection) continue;
      const key = `${localCollection}:${row.record_id}`;
      remoteKeys.add(key);
      if (pending[key] && this.canEdit()) continue;
      const list = collections[localCollection];
      const index = list.findIndex((item) => item.id === row.record_id);
      const current = index >= 0 ? list[index] : null;
      const remoteTime = timestamp(row.client_updated_at || row.deleted_at);
      const localTime = timestamp(current?.updatedAt || current?.createdAt);

      if (row.deleted_at) {
        if (current && (remoteTime >= localTime || !this.canEdit())) {
          list.splice(index, 1);
          changed = true;
          changedCollections.add(localCollection);
        } else if (current && localTime > remoteTime && this.canEdit()) {
          this.#queueOperation(key, {
            type: "record", action: "upsert", collection: localCollection, id: current.id,
            payload: current, clientUpdatedAt: current.updatedAt || current.createdAt || isoNow()
          }, false);
        }
        continue;
      }

      const payload = row.payload && typeof row.payload === "object"
        ? {
            ...row.payload,
            id: row.record_id,
            createdAt: row.payload.createdAt || row.client_updated_at || isoNow(),
            updatedAt: row.client_updated_at || row.payload.updatedAt || row.payload.createdAt || isoNow()
          }
        : null;
      if (!payload) continue;
      if (!current || remoteTime > localTime || !this.canEdit()) {
        if (index >= 0) list[index] = payload;
        else list.push(payload);
        changed = true;
        changedCollections.add(localCollection);
      } else if (localTime > remoteTime && this.canEdit()) {
        this.#queueOperation(key, {
          type: "record", action: "upsert", collection: localCollection, id: current.id,
          payload: current, clientUpdatedAt: current.updatedAt || current.createdAt || isoNow()
        }, false);
      }
    }

    for (const collection of COLLECTIONS) {
      for (let index = collections[collection].length - 1; index >= 0; index -= 1) {
        const record = collections[collection][index];
        const key = `${collection}:${record.id}`;
        if (!remoteKeys.has(key) && !pending[key]) {
          if (this.canEdit()) {
            this.#queueOperation(key, {
              type: "record", action: "upsert", collection, id: record.id,
              payload: record, clientUpdatedAt: record.updatedAt || record.createdAt || isoNow()
            }, false);
          } else {
            collections[collection].splice(index, 1);
            changed = true;
            changedCollections.add(collection);
          }
        }
      }
    }

    if (!profile && !pending.profile && this.canEdit()) {
      this.#queueOperation("profile", { type: "profile", clientUpdatedAt: isoNow() }, false);
    }

    if (changed) {
      this.#applyingRemote = true;
      try {
        storage.applyCloudState({
          settings: collections.__settings || local.settings,
          collections,
          updatedAt: isoNow()
        });
      } finally {
        this.#applyingRemote = false;
      }
      this.dispatchEvent(new CustomEvent("data:applied", {
        detail: { collections: [...changedCollections], settingsChanged }
      }));
    }
    if (this.getPendingCount() && this.canEdit()) this.#scheduleSync();
  }

  async #flushQueue() {
    if (!this.canEdit()) return;
    const snapshot = this.#readQueue();
    const operations = Object.entries(snapshot.operations);
    if (!operations.length) return;
    const full = operations.find(([, operation]) => operation.type === "full");
    if (full) {
      await this.#replaceCloudWithLocal();
      const currentQueue = this.#readQueue();
      for (const [key, capturedOperation] of operations) {
        const currentOperation = currentQueue.operations[key];
        if (currentOperation
          && currentOperation.type === capturedOperation.type
          && currentOperation.action === capturedOperation.action
          && currentOperation.clientUpdatedAt === capturedOperation.clientUpdatedAt) {
          delete currentQueue.operations[key];
        }
      }
      this.#writeQueue(currentQueue);
      return;
    }

    const client = await this.initialize();
    const spaceId = this.#activeSpaceId;
    const profileOp = snapshot.operations.profile;
    if (profileOp) {
      const { error } = await client.from("finance_profiles").upsert({
        user_id: spaceId,
        settings: storage.getSettings(),
        client_updated_at: profileOp.clientUpdatedAt || isoNow()
      }, { onConflict: "user_id" });
      if (error) throw error;
      this.#removeQueuedIfUnchanged("profile", profileOp);
    }

    const recordEntries = operations.filter(([, operation]) => operation.type === "record");
    if (recordEntries.length) {
      const rows = recordEntries.map(([, operation]) => ({
        user_id: spaceId,
        collection: COLLECTION_DB_NAMES[operation.collection],
        record_id: operation.id,
        payload: operation.action === "delete" ? {} : operation.payload,
        client_updated_at: operation.clientUpdatedAt || isoNow(),
        deleted_at: operation.action === "delete" ? (operation.clientUpdatedAt || isoNow()) : null
      }));
      const { error } = await client.from("finance_records").upsert(rows, { onConflict: "user_id,collection,record_id" });
      if (error) throw error;
      recordEntries.forEach(([key, operation]) => this.#removeQueuedIfUnchanged(key, operation));
    }
  }

  async #replaceCloudWithLocal() {
    if (!this.canEdit()) throw new Error("Este acesso é somente para visualização.");
    const client = await this.initialize();
    const spaceId = this.#activeSpaceId;
    const local = storage.getData();
    const { data: remoteRows, error: fetchError } = await client.from("finance_records")
      .select("collection, record_id, deleted_at").eq("user_id", spaceId);
    if (fetchError) throw fetchError;

    const activeKeys = new Set();
    const upserts = [];
    for (const collection of COLLECTIONS) {
      for (const record of local[collection] || []) {
        activeKeys.add(`${COLLECTION_DB_NAMES[collection]}:${record.id}`);
        upserts.push({
          user_id: spaceId, collection: COLLECTION_DB_NAMES[collection], record_id: record.id,
          payload: record, client_updated_at: record.updatedAt || record.createdAt || isoNow(), deleted_at: null
        });
      }
    }
    for (const row of remoteRows || []) {
      const key = `${row.collection}:${row.record_id}`;
      if (!activeKeys.has(key) && !row.deleted_at) {
        const deletedAt = isoNow();
        upserts.push({
          user_id: spaceId, collection: row.collection, record_id: row.record_id,
          payload: {}, client_updated_at: deletedAt, deleted_at: deletedAt
        });
      }
    }
    if (upserts.length) {
      const { error } = await client.from("finance_records").upsert(upserts, { onConflict: "user_id,collection,record_id" });
      if (error) throw error;
    }
    const { error: profileError } = await client.from("finance_profiles").upsert({
      user_id: spaceId, settings: local.settings, client_updated_at: local.updatedAt || isoNow()
    }, { onConflict: "user_id" });
    if (profileError) throw profileError;
  }

  startRealtime() {
    if (!this.#client || !this.#session || !this.#activeSpaceId || this.#realtimeChannel) return;
    const spaceId = this.#activeSpaceId;
    const memberId = this.#session.user.id;
    const schedulePull = () => {
      clearTimeout(this.#pullTimer);
      this.#pullTimer = setTimeout(() => this.syncNow({ quiet: true }).catch(() => {}), 450);
    };
    this.#realtimeChannel = this.#client.channel(`fluxo-${memberId}-${spaceId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "finance_records", filter: `user_id=eq.${spaceId}` }, schedulePull)
      .on("postgres_changes", { event: "*", schema: "public", table: "finance_profiles", filter: `user_id=eq.${spaceId}` }, schedulePull)
      .subscribe();
    this.#pollTimer = setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine) this.syncNow({ quiet: true }).catch(() => {});
    }, 60_000);
  }

  stopRealtime() {
    clearTimeout(this.#pullTimer);
    clearInterval(this.#pollTimer);
    this.#pollTimer = null;
    if (this.#client && this.#realtimeChannel) this.#client.removeChannel(this.#realtimeChannel);
    this.#realtimeChannel = null;
  }

  async createCloudBackup(reason = "manual") {
    if (!this.#session) throw new Error("Entre na sua conta antes de criar um backup na nuvem.");
    if (!this.canEdit()) throw new Error("Este acesso é somente para visualização.");
    const client = await this.initialize();
    const spaceId = this.#activeSpaceId;
    const { error } = await client.from("finance_backups").insert({
      user_id: spaceId, reason, snapshot: storage.exportData()
    });
    if (error) throw error;
    const { data: backups } = await client.from("finance_backups").select("id").eq("user_id", spaceId).order("created_at", { ascending: false });
    const excess = (backups || []).slice(10).map((item) => item.id);
    if (excess.length) await client.from("finance_backups").delete().in("id", excess);
    return true;
  }

  async listCloudBackups() {
    if (!this.#session) return [];
    const client = await this.initialize();
    const { data, error } = await client.from("finance_backups")
      .select("id, reason, created_at").eq("user_id", this.#activeSpaceId)
      .order("created_at", { ascending: false }).limit(10);
    if (error) throw error;
    return data || [];
  }

  async restoreCloudBackup(id) {
    if (!this.canEdit()) throw new Error("Este acesso é somente para visualização.");
    const client = await this.initialize();
    const { data, error } = await client.from("finance_backups")
      .select("snapshot").eq("user_id", this.#activeSpaceId).eq("id", id).single();
    if (error) throw error;
    storage.importData(data.snapshot);
    await this.syncNow();
  }

  getPendingCount() {
    return Object.keys(this.#readQueue().operations).length;
  }

  #queueKey() {
    const userId = this.#session?.user?.id || "guest";
    const spaceId = this.#activeSpaceId || "none";
    return `${SYNC_QUEUE_KEY}:${userId}:${spaceId}`;
  }

  #queueOperation(key, operation, schedule = true) {
    if (!this.canEdit()) return;
    const queue = this.#readQueue();
    queue.operations[key] = operation;
    this.#writeQueue(queue);
    if (navigator.onLine && this.#session) this.#setStatus("pending", "Há alterações para sincronizar");
    else if (!navigator.onLine) this.#setStatus("offline", "Alterações salvas neste dispositivo");
    if (schedule) this.#scheduleSync();
  }

  #scheduleSync() {
    clearTimeout(this.#syncTimer);
    if (!this.#session || !navigator.onLine || !this.getPendingCount() || !this.canEdit()) return;
    this.#syncTimer = setTimeout(() => this.syncNow().catch(() => {}), 700);
  }

  #readQueue() {
    const queue = safeParse(localStorage.getItem(this.#queueKey()), { version: 2, operations: {} });
    return queue?.operations && typeof queue.operations === "object" ? queue : { version: 2, operations: {} };
  }

  #writeQueue(queue) {
    localStorage.setItem(this.#queueKey(), JSON.stringify(queue));
    this.dispatchEvent(new CustomEvent("queue:changed", { detail: { pending: Object.keys(queue.operations).length } }));
  }

  #removeQueuedIfUnchanged(key, snapshotOperation) {
    const queue = this.#readQueue();
    const current = queue.operations[key];
    if (current && current.clientUpdatedAt === snapshotOperation.clientUpdatedAt && current.action === snapshotOperation.action) {
      delete queue.operations[key];
      this.#writeQueue(queue);
    }
  }

  #writeSyncMeta(patch) {
    const key = `${this.#queueKey()}:meta`;
    const current = safeParse(localStorage.getItem(key), {});
    localStorage.setItem(key, JSON.stringify({ ...current, ...patch }));
  }

  #scheduleWeeklyBackup() {
    const meta = safeParse(localStorage.getItem(`${this.#queueKey()}:meta`), {});
    if (timestamp(meta.lastCloudBackupAt) > Date.now() - 7 * 24 * 60 * 60 * 1000) return;
    setTimeout(async () => {
      try {
        await this.createCloudBackup("weekly-automatic");
        this.#writeSyncMeta({ lastCloudBackupAt: isoNow() });
      } catch (error) {
        console.warn("Backup semanal não criado:", error);
      }
    }, 1500);
  }

  #setStatus(status, message) {
    this.#status = status;
    this.#message = message;
    this.dispatchEvent(new CustomEvent("status", { detail: this.getState() }));
  }

  #friendlyError(error) {
    const message = String(error?.message || "Não foi possível sincronizar.");
    if (/list_finance_spaces|finance_space|function .* does not exist|relation .* does not exist/i.test(message)) {
      return "Execute o arquivo supabase-upgrade-v3.sql no SQL Editor";
    }
    if (/Invalid API key|Unauthorized|JWT/i.test(message)) return "Confira a URL e a chave pública do Supabase";
    if (/Failed to fetch|NetworkError/i.test(message)) return "Sem conexão com o Supabase";
    return message.slice(0, 140);
  }
}

export const cloud = new CloudService();
export { CLOUD_CONFIG_KEY, SYNC_QUEUE_KEY, SUPABASE_MODULE_URL };
