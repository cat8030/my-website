const RECENT_STORAGE_KEY = "recentSessions";
const FAVORITE_STORAGE_KEY = "favoriteAgentIds";

function getApi() {
  try {
    return require("./utils/api");
  } catch (err) {
    console.error("[api load failed]", err);
    return {};
  }
}

function sortRecent(list) {
  return list.slice().sort((a, b) => {
    return Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || Number(b.updatedAt || 0) - Number(a.updatedAt || 0);
  });
}

function normalizeRecent(list) {
  return Array.isArray(list) ? sortRecent(list).slice(0, 30) : [];
}

function normalizeFavoriteIds(list) {
  if (!Array.isArray(list)) {
    return [];
  }
  return Array.from(new Set(list.filter((item) => typeof item === "string" && item)));
}

function mergeRecentLists(localList, remoteList) {
  const records = new Map();
  normalizeRecent(remoteList).concat(normalizeRecent(localList)).forEach((item) => {
    const existing = records.get(item.agentId);
    if (!existing || Number(item.updatedAt || 0) > Number(existing.updatedAt || 0)) {
      records.set(item.agentId, {
        ...existing,
        ...item,
        pinned: Boolean((existing && existing.pinned) || item.pinned)
      });
    } else if (item.pinned && existing) {
      records.set(item.agentId, {
        ...existing,
        pinned: true
      });
    }
  });
  return normalizeRecent(Array.from(records.values()));
}

App({
  globalData: {
    recent: [],
    favoriteAgentIds: [],
    user: null,
    syncing: false
  },

  onLaunch() {
    this.globalData.recent = normalizeRecent(wx.getStorageSync(RECENT_STORAGE_KEY));
    this.globalData.favoriteAgentIds = normalizeFavoriteIds(wx.getStorageSync(FAVORITE_STORAGE_KEY));
    const { getStoredUser } = getApi();
    this.globalData.user = typeof getStoredUser === "function" ? getStoredUser() : null;
    if (this.globalData.user) {
      this.syncRemoteState();
    }
  },

  setUser(user) {
    this.globalData.user = user || null;
    if (this.globalData.user) {
      this.syncRemoteState();
    }
    return this.globalData.user;
  },

  getUser() {
    if (!this.globalData.user) {
      const { getStoredUser } = getApi();
      this.globalData.user = typeof getStoredUser === "function" ? getStoredUser() : null;
    }
    return this.globalData.user;
  },

  clearUser() {
    const { clearAuthSession } = getApi();
    if (typeof clearAuthSession === "function") {
      clearAuthSession();
    }
    this.globalData.user = null;
    return null;
  },

  saveRecent(list) {
    const recent = normalizeRecent(list);
    this.globalData.recent = recent;
    wx.setStorageSync(RECENT_STORAGE_KEY, recent);
    this.pushRecentToRemote(recent);
    return recent;
  },

  getRecentList() {
    if (!this.globalData.recent.length) {
      this.globalData.recent = normalizeRecent(wx.getStorageSync(RECENT_STORAGE_KEY));
    }
    return this.globalData.recent;
  },

  getRecentByAgentId(agentId) {
    return this.getRecentList().find((item) => item.agentId === agentId) || null;
  },

  addRecent(record) {
    const current = this.getRecentList();
    const existing = current.find((item) => item.agentId === record.agentId);
    const nextRecord = {
      ...(existing || {}),
      ...record,
      pinned: existing ? Boolean(existing.pinned) : Boolean(record.pinned),
      messages: Array.isArray(record.messages) ? record.messages : (existing && existing.messages) || [],
      activeModule: record.activeModule || (existing && existing.activeModule) || "",
      source: record.source || (existing && existing.source) || "local",
      updatedAt: Date.now()
    };
    const list = [nextRecord].concat(current.filter((item) => item.agentId !== record.agentId)).slice(0, 30);
    return this.saveRecent(list);
  },

  toggleRecentPinned(agentId) {
    const recent = this.getRecentList().map((item) => {
      if (item.agentId !== agentId) {
        return item;
      }
      return {
        ...item,
        pinned: !item.pinned
      };
    });
    return this.saveRecent(recent);
  },

  deleteRecent(agentId) {
    return this.saveRecent(this.getRecentList().filter((item) => item.agentId !== agentId));
  },

  clearRecent() {
    this.globalData.recent = [];
    wx.removeStorageSync(RECENT_STORAGE_KEY);
    this.pushRecentToRemote([]);
    return [];
  },

  saveFavoriteIds(list) {
    const favoriteAgentIds = normalizeFavoriteIds(list);
    this.globalData.favoriteAgentIds = favoriteAgentIds;
    wx.setStorageSync(FAVORITE_STORAGE_KEY, favoriteAgentIds);
    this.pushFavoriteIdsToRemote(favoriteAgentIds);
    return favoriteAgentIds;
  },

  getFavoriteIds() {
    if (!this.globalData.favoriteAgentIds.length) {
      this.globalData.favoriteAgentIds = normalizeFavoriteIds(wx.getStorageSync(FAVORITE_STORAGE_KEY));
    }
    return this.globalData.favoriteAgentIds;
  },

  isFavoriteAgent(agentId) {
    return this.getFavoriteIds().includes(agentId);
  },

  toggleFavoriteAgent(agentId) {
    const favoriteAgentIds = this.getFavoriteIds();
    if (favoriteAgentIds.includes(agentId)) {
      return this.saveFavoriteIds(favoriteAgentIds.filter((id) => id !== agentId));
    }
    return this.saveFavoriteIds([agentId].concat(favoriteAgentIds));
  },

  clearFavorites() {
    this.globalData.favoriteAgentIds = [];
    wx.removeStorageSync(FAVORITE_STORAGE_KEY);
    this.pushFavoriteIdsToRemote([]);
    return [];
  },

  syncRemoteState() {
    if (!this.globalData.user || this.globalData.syncing) {
      return Promise.resolve(false);
    }
    const {
      fetchRemoteRecent,
      syncRemoteRecent,
      fetchRemoteFavoriteIds,
      syncRemoteFavoriteIds
    } = getApi();
    this.globalData.syncing = true;
    return Promise.all([
      typeof fetchRemoteRecent === "function" ? fetchRemoteRecent().catch(() => null) : Promise.resolve(null),
      typeof fetchRemoteFavoriteIds === "function" ? fetchRemoteFavoriteIds().catch(() => null) : Promise.resolve(null)
    ]).then(([remoteRecent, remoteFavoriteIds]) => {
      if (Array.isArray(remoteRecent)) {
        const latestLocalRecent = normalizeRecent(wx.getStorageSync(RECENT_STORAGE_KEY)).concat(normalizeRecent(this.globalData.recent));
        const recent = mergeRecentLists(latestLocalRecent, remoteRecent);
        this.globalData.recent = recent;
        wx.setStorageSync(RECENT_STORAGE_KEY, recent);
        if (typeof syncRemoteRecent === "function") {
          syncRemoteRecent(recent).catch(() => null);
        }
      }
      if (Array.isArray(remoteFavoriteIds)) {
        const localFavoriteIds = normalizeFavoriteIds(normalizeFavoriteIds(wx.getStorageSync(FAVORITE_STORAGE_KEY)).concat(this.globalData.favoriteAgentIds));
        const favoriteAgentIds = normalizeFavoriteIds(remoteFavoriteIds.concat(localFavoriteIds));
        this.globalData.favoriteAgentIds = favoriteAgentIds;
        wx.setStorageSync(FAVORITE_STORAGE_KEY, favoriteAgentIds);
        if (typeof syncRemoteFavoriteIds === "function") {
          syncRemoteFavoriteIds(favoriteAgentIds).catch(() => null);
        }
      }
      return true;
    }).finally(() => {
      this.globalData.syncing = false;
    });
  },

  pushRecentToRemote(recent) {
    if (!this.globalData.user || this.globalData.syncing) {
      return;
    }
    const { syncRemoteRecent } = getApi();
    if (typeof syncRemoteRecent === "function") {
      syncRemoteRecent(recent).catch(() => null);
    }
  },

  pushFavoriteIdsToRemote(favoriteAgentIds) {
    if (!this.globalData.user || this.globalData.syncing) {
      return;
    }
    const { syncRemoteFavoriteIds } = getApi();
    if (typeof syncRemoteFavoriteIds === "function") {
      syncRemoteFavoriteIds(favoriteAgentIds).catch(() => null);
    }
  }
});
