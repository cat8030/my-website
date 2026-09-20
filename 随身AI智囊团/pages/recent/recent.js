const { getAgentById } = require("../../utils/agents");
const { APP_TITLE, enablePageShare, buildShareOptions, buildTimelineOptions } = require("../../utils/share");

function formatTime(timestamp) {
  if (!timestamp) {
    return "";
  }
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  if (isToday) {
    return `今天 ${hour}:${minute}`;
  }
  if (isYesterday) {
    return `昨天 ${hour}:${minute}`;
  }
  return `${date.getMonth() + 1}月${date.getDate()}日 ${hour}:${minute}`;
}

function getSourceLabel(source) {
  if (source === "local") {
    return "本地模拟";
  }
  if (source === "relay") {
    return "模型接口";
  }
  return "自有接口";
}

Page({
  data: {
    query: "",
    recent: [],
    filtered: [],
    favoriteIds: []
  },

  onLoad() {
    enablePageShare();
  },

  onShow() {
    enablePageShare();
    const recent = getApp().getRecentList();
    const favoriteIds = getApp().getFavoriteIds();
    const sortedRecent = this.sortRecent(recent);
    this.setData({
      favoriteIds,
      recent: this.decorateRecent(sortedRecent, favoriteIds),
      filtered: this.filterRecent(this.decorateRecent(sortedRecent, favoriteIds), this.data.query)
    });
  },

  onReady() {
    enablePageShare();
  },

  sortRecent(list) {
    return list.slice().sort((a, b) => {
      return Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.updatedAt - a.updatedAt;
    });
  },

  filterRecent(list, query) {
    const keyword = query.trim();
    return list.filter((item) => {
      return !keyword ||
        (item.agentName || "").includes(keyword) ||
        (item.parentName || "").includes(keyword) ||
        (item.activeModule || "").includes(keyword) ||
        (item.preview || "").includes(keyword) ||
        (item.reply || "").includes(keyword);
    });
  },

  decorateRecent(list, favoriteIds) {
    return list.map((item) => {
      const agent = getAgentById(item.agentId);
      return {
        ...item,
        avatarSrc: agent.avatarSrc,
        parentName: item.parentName || agent.parentName,
        displayTime: formatTime(item.updatedAt),
        sourceLabel: getSourceLabel(item.source),
        isFavorite: favoriteIds.includes(item.agentId)
      };
    });
  },

  saveRecent(list) {
    const sortedRecent = getApp().saveRecent(list);
    const favoriteIds = getApp().getFavoriteIds();
    const decorated = this.decorateRecent(sortedRecent, favoriteIds);
    this.setData({
      favoriteIds,
      recent: decorated,
      filtered: this.filterRecent(decorated, this.data.query)
    });
  },

  goBack() {
    this.goHome();
  },

  goHome() {
    wx.redirectTo({
      url: "/pages/index/index"
    });
  },

  goProfile() {
    wx.redirectTo({
      url: "/pages/profile/profile"
    });
  },

  onSearch(e) {
    const query = e.detail.value.trim();
    this.setData({
      query,
      filtered: this.filterRecent(this.data.recent, query)
    });
  },

  openAgent(e) {
    wx.navigateTo({
      url: `/pages/agent/agent?id=${e.currentTarget.dataset.id}&restore=1`
    });
  },

  clearRecent() {
    if (!this.data.recent.length) {
      return;
    }
    wx.showModal({
      title: "清空最近对话",
      content: "清空后本地历史记录会被删除，智能体卡片不会受影响。",
      confirmText: "清空",
      confirmColor: "#d14343",
      success: (res) => {
        if (!res.confirm) {
          return;
        }
        getApp().clearRecent();
        this.setData({
          recent: [],
          filtered: []
        });
      }
    });
  },

  toggleTop(e) {
    const id = e.currentTarget.dataset.id;
    this.saveRecent(getApp().toggleRecentPinned(id));
  },

  deleteRecent(e) {
    const id = e.currentTarget.dataset.id;
    this.saveRecent(getApp().deleteRecent(id));
  },

  toggleFavorite(e) {
    const id = e.currentTarget.dataset.id;
    const favoriteIds = getApp().toggleFavoriteAgent(id);
    const decorated = this.decorateRecent(this.data.recent, favoriteIds);
    this.setData({
      favoriteIds,
      recent: decorated,
      filtered: this.filterRecent(decorated, this.data.query)
    });
    wx.showToast({
      title: favoriteIds.includes(id) ? "已加入常用" : "已取消常用",
      icon: "none"
    });
  },

  copyQuestion(e) {
    const id = e.currentTarget.dataset.id;
    const item = this.data.recent.find((record) => record.agentId === id);
    if (!item || !item.preview) {
      return;
    }
    wx.setClipboardData({
      data: item.preview,
      success() {
        wx.showToast({
          title: "已复制问题",
          icon: "none"
        });
      }
    });
  },

  copyReply(e) {
    const id = e.currentTarget.dataset.id;
    const item = this.data.recent.find((record) => record.agentId === id);
    if (!item || !item.reply) {
      return;
    }
    wx.setClipboardData({
      data: item.reply,
      success() {
        wx.showToast({
          title: "已复制回复",
          icon: "none"
        });
      }
    });
  },

  onShareAppMessage() {
    return buildShareOptions({
      title: `最近对话 - ${APP_TITLE}`,
      path: "/pages/recent/recent"
    });
  },

  onShareTimeline() {
    return buildTimelineOptions({
      title: `最近对话 - ${APP_TITLE}`
    });
  }
});
