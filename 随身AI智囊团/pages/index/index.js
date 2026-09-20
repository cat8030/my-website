const { getAgentCards } = require("../../utils/agents");
const { fetchAgents, fetchPlans, fetchSupport } = require("../../utils/api");
const { APP_TITLE, APP_SLOGAN, enablePageShare, buildShareOptions, buildTimelineOptions } = require("../../utils/share");

const DEFAULT_SUPPORT_QR = "/assets/app-logo.png";
const SUPPORT_BANNER = "/assets/customer-service-popup-bg.png";

function buildCategoryTabs(cards, favoriteIds) {
  const tabs = [
    { id: "all", name: "全部", count: cards.length },
    { id: "favorite", name: "常用", count: favoriteIds.length },
    { id: "main", name: "主模式", count: cards.filter((card) => card.badge === "主模式").length }
  ];
  ["战略", "增长", "运营", "成交"].forEach((category) => {
    tabs.push({
      id: category,
      name: category,
      count: cards.filter((card) => card.category === category).length
    });
  });
  return tabs;
}

Page({
  data: {
    cards: getAgentCards(),
    filteredCards: getAgentCards(),
    favoriteIds: [],
    categoryTabs: buildCategoryTabs(getAgentCards(), []),
    activeCategory: "all",
    query: "",
    recentCount: 0,
    showSupportPanel: false,
    supportPanel: {
      qrImageUrl: DEFAULT_SUPPORT_QR,
      bannerImageUrl: SUPPORT_BANNER
    }
  },

  onLoad(options) {
    enablePageShare();
    if (options.category) {
      this.setData({
        activeCategory: options.category
      });
    }
    this.loadAgents();
  },

  loadAgents() {
    fetchAgents()
      .then((cards) => {
        if (!Array.isArray(cards) || !cards.length) {
          return;
        }
        const favoriteIds = getApp().getFavoriteIds();
        this.setData({
          cards,
          categoryTabs: buildCategoryTabs(cards, favoriteIds)
        });
        this.filterCards();
      })
      .catch(() => null);
  },

  onShow() {
    enablePageShare();
    const recent = getApp().getRecentList();
    const favoriteIds = getApp().getFavoriteIds();
    this.setData({
      recentCount: recent.length,
      favoriteIds,
      categoryTabs: buildCategoryTabs(this.data.cards, favoriteIds)
    });
    this.filterCards();
  },

  onReady() {
    enablePageShare();
  },

  onSearch(e) {
    this.setData({
      query: e.detail.value
    });
    this.filterCards();
  },

  filterCards() {
    const query = this.data.query.trim();
    const activeCategory = this.data.activeCategory;
    const favoriteIds = this.data.favoriteIds;
    const filteredCards = this.data.cards.filter((card) => {
      const inCategory = activeCategory === "all" ||
        (activeCategory === "favorite" && favoriteIds.includes(card.id)) ||
        (activeCategory === "main" && card.badge === "主模式") ||
        card.category === activeCategory;
      const inQuery = !query ||
        card.name.includes(query) ||
        card.parentName.includes(query) ||
        card.summary.includes(query) ||
        card.cardDesc.includes(query);
      return inCategory && inQuery;
    });
    this.setData({
      filteredCards
    });
  },

  switchCategory(e) {
    this.setData({
      activeCategory: e.currentTarget.dataset.id
    });
    this.filterCards();
  },

  openAgent(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/agent/agent?id=${id}`
    });
  },

  toggleFavorite(e) {
    const id = e.currentTarget.dataset.id;
    const favoriteIds = getApp().toggleFavoriteAgent(id);
    this.setData({
      favoriteIds,
      categoryTabs: buildCategoryTabs(this.data.cards, favoriteIds)
    });
    this.filterCards();
    wx.showToast({
      title: favoriteIds.includes(id) ? "已加入常用" : "已取消常用",
      icon: "none"
    });
  },

  showFavorites() {
    this.setData({
      activeCategory: "favorite"
    });
    this.filterCards();
  },

  stopTap() {},

  closeSupportPanel() {
    this.setData({
      showSupportPanel: false
    });
  },

  showSupport() {
    fetchSupport()
      .then((support) => {
        this.setData({
          showSupportPanel: true,
          supportPanel: {
            qrImageUrl: (support && support.qrImageUrl) || DEFAULT_SUPPORT_QR,
            bannerImageUrl: SUPPORT_BANNER
          }
        });
      })
      .catch(() => {
        this.setData({
          showSupportPanel: true,
          supportPanel: {
            qrImageUrl: DEFAULT_SUPPORT_QR,
            bannerImageUrl: SUPPORT_BANNER
          }
        });
      });
  },

  resetSearch() {
    this.setData({
      query: "",
      activeCategory: "all"
    });
    this.filterCards();
  },

  goRecent() {
    wx.redirectTo({
      url: "/pages/recent/recent"
    });
  },

  goProfile() {
    wx.redirectTo({
      url: "/pages/profile/profile"
    });
  },

  goCommerceStudio() {
    wx.navigateTo({
      url: "/pages/commerce-studio/commerce-studio"
    });
  },

  showPlans() {
    fetchPlans()
      .then((data) => {
        const plans = data.plans || [];
        const currentPlan = data.currentPlan || plans[0] || {};
        const content = plans.map((plan) => {
          const current = plan.id === currentPlan.id ? "当前：" : "";
          return `${current}${plan.name} ${plan.priceText}\n${plan.quotaText}\n${plan.desc}`;
        }).join("\n\n");
        wx.showModal({
          title: "会员与算力",
          content: content || "暂无套餐信息",
          showCancel: false
        });
      })
      .catch(() => {
        wx.showToast({
          title: "套餐信息暂不可用",
          icon: "none"
        });
      });
  },

  onShareAppMessage() {
    return buildShareOptions({
      title: `${APP_TITLE} - ${APP_SLOGAN}`,
      path: "/pages/index/index"
    });
  },

  onShareTimeline() {
    return buildTimelineOptions({
      title: `${APP_TITLE} - ${APP_SLOGAN}`
    });
  }
});
