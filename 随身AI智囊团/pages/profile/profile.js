const {
  fetchCurrentUser,
  fetchAuthConfig,
  fetchPlans,
  fetchSupport,
  loginWithPhoneNumber,
  loginWithDevPhoneNumber,
  redeemCreditCode,
  logout
} = require("../../utils/api");
const { getAgentCards } = require("../../utils/agents");
const { DEFAULT_PRIVACY_NAME, getPrivacySetting, openPrivacyContract } = require("../../utils/privacy");
const { APP_TITLE, enablePageShare, buildShareOptions, buildTimelineOptions } = require("../../utils/share");

const DEFAULT_PROFILE_NAME = "随身AI用户";
const DEFAULT_SUPPORT_QR = "/assets/app-logo.png";
const SUPPORT_BANNER = "/assets/customer-service-popup-bg.png";

const BASE_ACTIONS = [
  { key: "account", title: "账号信息", desc: "查看当前登录状态和账号资料" },
  { key: "plans", title: "会员与算力", desc: "查看当前套餐、额度和开通方式" },
  { key: "redeem", title: "卡密兑换", desc: "输入兑换码兑换 AI 提问次数" },
  { key: "favorites", title: "常用智能体", desc: "查看已收藏的常用智能体" },
  { key: "usage", title: "使用统计", desc: "查看当前智能体和对话数据" },
  { key: "service", title: "联系客服", desc: "查看人工客服、企微或服务时间" },
  { key: "logs", title: "最近对话", desc: "查看保存在本地的历史对话" },
  { key: "clearFavorites", title: "清空常用", desc: "只清空本地常用标记，不影响对话记录" }
];

function isGeneratedDisplayName(name) {
  return !name || name === "经营者" || name === "未知用户" || /^尾号\s*\d{4}\s*用户$/.test(name);
}

function getPhoneTail(user) {
  const text = user && (user.phoneMasked || user.phoneLabel || "");
  const digits = String(text).replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : "";
}

function getDisplayName(user) {
  const name = user && typeof user.nickName === "string" ? user.nickName.trim() : "";
  if (!isGeneratedDisplayName(name)) {
    return name;
  }
  const phoneTail = getPhoneTail(user);
  return phoneTail ? `用户${phoneTail}` : DEFAULT_PROFILE_NAME;
}

function normalizeUser(user) {
  if (!user) {
    return {
      nickName: "未登录",
      avatarUrl: "",
      initial: "人",
      meta: "登录后可同步个人权益和历史记录"
    };
  }
  const nickName = getDisplayName(user);
  const phoneText = getUserPhoneText(user);
  const creditText = getUserCreditText(user);
  return {
    ...user,
    nickName,
    avatarUrl: user.avatarUrl || "",
    initial: "人",
    meta: phoneText ? `${phoneText} · 剩余 ${creditText} 次` : `已登录 · 剩余 ${creditText} 次`
  };
}

function getUserPhoneText(user) {
  if (!user) {
    return "";
  }
  return user.phoneLabel || (user.isDevLogin ? "开发测试号" : user.phoneMasked || "");
}

function getUserCreditText(user) {
  if (!user) {
    return "0";
  }
  if (user.isAdmin) {
    return "不限";
  }
  return String(Math.max(0, Number(user.creditBalance || 0)));
}

function getRedeemErrorText(err) {
  const message = err && err.message;
  if (message === "UNAUTHORIZED") {
    return "请先登录后再兑换";
  }
  if (message === "REDEEM_CODE_REQUIRED") {
    return "请输入兑换码";
  }
  if (message === "REDEEM_CODE_INVALID") {
    return "兑换码无效";
  }
  if (message === "REDEEM_CODE_USED") {
    return "兑换码已被使用";
  }
  return "兑换失败，请稍后重试";
}

function normalizeLoginConfig(config) {
  const source = config && typeof config === "object" ? config : {};
  const isWechat = source.mode === "wechat" && source.canUseWechatPhoneNumber !== false;
  return {
    loading: false,
    mode: isWechat ? "wechat" : "dev",
    title: isWechat ? "手机号登录" : "开发测试登录",
    desc: isWechat
      ? "使用微信绑定手机号登录后，可同步个人权益、使用统计和历史记录。"
      : "当前后端未配置微信 AppSecret，先使用固定开发测试号登录；配置后会切换为真实手机号授权。",
    phoneButtonText: isWechat ? "使用微信绑定手机号登录" : `使用${source.devPhoneLabel || "开发测试号"}登录`,
    tip: isWechat ? "授权手机号仅用于账号登录与权益识别。" : "开发测试号只用于本地调试，不代表微信真实绑定手机号。"
  };
}

function buildStats(user) {
  const cards = getAgentCards();
  const recent = getApp().getRecentList();
  const favoriteIds = getApp().getFavoriteIds();
  return [
    { label: "智能体数", value: String(cards.length) },
    { label: "常用智能体", value: String(favoriteIds.length) },
    { label: user ? "剩余次数" : "最近对话", value: user ? getUserCreditText(user) : String(recent.length) }
  ];
}

Page({
  data: {
    user: normalizeUser(null),
    isLoggedIn: false,
    loginLoading: false,
    showPrivacy: false,
    privacyContractName: DEFAULT_PRIVACY_NAME,
    privacyActionText: "",
    showRedeemPanel: false,
    showSupportPanel: false,
    supportPanel: {
      qrImageUrl: DEFAULT_SUPPORT_QR,
      bannerImageUrl: SUPPORT_BANNER
    },
    redeemCode: "",
    redeemLoading: false,
    loginConfig: {
      loading: true,
      mode: "wechat",
      title: "手机号登录",
      desc: "正在检测登录方式...",
      phoneButtonText: "使用微信绑定手机号登录",
      tip: "授权手机号仅用于账号登录与权益识别。"
    },
    stats: [],
    actions: BASE_ACTIONS.filter((item) => item.key !== "account")
  },

  onLoad() {
    enablePageShare();
  },

  onShow() {
    enablePageShare();
    const user = getApp().getUser();
    this.updateUserState(user);
    if (user) {
      this.refreshCurrentUser();
      return;
    }
    this.refreshLoginConfig();
  },

  onReady() {
    enablePageShare();
  },

  goBack() {
    this.goHome();
  },

  goHome() {
    wx.redirectTo({
      url: "/pages/index/index"
    });
  },

  goRecent() {
    wx.redirectTo({
      url: "/pages/recent/recent"
    });
  },

  openAccountPanel() {
    if (this.data.loginLoading) {
      return;
    }
    const user = getApp().getUser();
    if (!user) {
      if (this.data.loginConfig.loading) {
        this.refreshLoginConfig();
      }
      wx.showToast({
        title: "请点击未登录卡片授权登录",
        icon: "none"
      });
      return;
    }

    wx.showModal({
      title: "账号信息",
      content: `当前账号：${getDisplayName(user)}\n手机号：${getUserPhoneText(user) || "已绑定"}\n剩余次数：${getUserCreditText(user)}\n登录次数：${user.loginCount || 1} 次\nAI提问：${(user.usage && user.usage.chatCount) || 0} 次\n上传资料：${(user.usage && user.usage.uploadCount) || 0} 次`,
      confirmText: "退出登录",
      cancelText: "关闭",
      confirmColor: "#d14343",
      success: (res) => {
        if (res.confirm) {
          this.logoutAccount(true);
        }
      }
    });
  },

  openRedeemPanel() {
    const user = getApp().getUser();
    if (!user) {
      wx.showToast({
        title: "请先登录",
        icon: "none"
      });
      this.openAccountPanel();
      return;
    }
    this.setData({
      showRedeemPanel: true,
      redeemCode: ""
    });
  },

  closeRedeemPanel() {
    if (this.data.redeemLoading) {
      return;
    }
    this.setData({
      showRedeemPanel: false,
      redeemCode: ""
    });
  },

  closeSupportPanel() {
    this.setData({
      showSupportPanel: false
    });
  },

  onRedeemCodeInput(e) {
    this.setData({
      redeemCode: e.detail.value
    });
  },

  submitRedeemCode() {
    const code = this.data.redeemCode.trim();
    if (!code || this.data.redeemLoading) {
      wx.showToast({
        title: code ? "正在兑换" : "请输入兑换码",
        icon: "none"
      });
      return;
    }
    this.setData({
      redeemLoading: true
    });
    redeemCreditCode(code)
      .then((data) => {
        const user = data && data.user;
        if (user) {
          getApp().setUser(user);
          this.updateUserState(user);
        }
        wx.showToast({
          title: `已兑换 ${data.credits || 0} 次`,
          icon: "success"
        });
        this.setData({
          showRedeemPanel: false,
          redeemCode: ""
        });
      })
      .catch((err) => {
        wx.showToast({
          title: getRedeemErrorText(err),
          icon: "none"
        });
      })
      .finally(() => {
        this.setData({
          redeemLoading: false
        });
      });
  },

  stopTap() {},

  preparePrivacyAuthorization(actionText) {
    getPrivacySetting().then((setting) => {
      if (!setting.needAuthorization) {
        return;
      }
      this.setData({
        showPrivacy: true,
        privacyContractName: setting.privacyContractName || DEFAULT_PRIVACY_NAME,
        privacyActionText: actionText || "继续使用前请先阅读并同意用户隐私保护指引"
      });
    });
  },

  ensurePrivacyAuthorization(action, actionText) {
    if (typeof action !== "function") {
      return;
    }

    getPrivacySetting().then((setting) => {
      if (!setting.needAuthorization) {
        action();
        return;
      }

      this.pendingPrivacyAction = action;
      this.setData({
        showPrivacy: true,
        privacyContractName: setting.privacyContractName || DEFAULT_PRIVACY_NAME,
        privacyActionText: actionText || "继续使用前请先阅读并同意用户隐私保护指引"
      });
    });
  },

  handleAgreePrivacyAuthorization() {
    const action = this.pendingPrivacyAction;
    this.pendingPrivacyAction = null;
    this.setData({
      showPrivacy: false
    });
    if (typeof action === "function") {
      action();
    }
  },

  closePrivacyDialog() {
    this.pendingPrivacyAction = null;
    this.setData({
      showPrivacy: false
    });
    wx.showToast({
      title: "需同意后继续使用",
      icon: "none"
    });
  },

  openPrivacyContract() {
    openPrivacyContract();
  },

  refreshLoginConfig() {
    this.setData({
      "loginConfig.loading": true,
      "loginConfig.desc": "正在检测登录方式...",
      "loginConfig.phoneButtonText": "使用微信绑定手机号登录"
    });
    fetchAuthConfig()
      .then((config) => {
        this.setData({
          loginConfig: normalizeLoginConfig(config)
        });
      })
      .catch(() => {
        this.setData({
          loginConfig: normalizeLoginConfig({
            mode: "dev",
            canUseWechatPhoneNumber: false,
            devPhoneLabel: "开发测试号"
          })
        });
      });
  },

  updateUserState(user) {
    const actions = BASE_ACTIONS.filter((item) => user || item.key !== "account");
    if (user && user.isAdmin) {
      actions.unshift({
        key: "adminAgents",
        title: "随身AI军师团后台",
        desc: "管理智能体文案、排序和显示状态"
      });
    }
    this.setData({
      user: normalizeUser(user),
      isLoggedIn: Boolean(user),
      stats: buildStats(user),
      actions
    });
  },

  refreshCurrentUser() {
    fetchCurrentUser()
      .then((user) => {
        getApp().setUser(user);
        this.updateUserState(user);
      })
      .catch((err) => {
        if (err && err.message === "UNAUTHORIZED") {
          getApp().clearUser();
          this.updateUserState(null);
        }
      });
  },

  handlePhoneNumberLogin(e) {
    if (this.data.loginLoading) {
      return;
    }
    const detail = (e && e.detail) || {};
    if (detail.errMsg && detail.errMsg !== "getPhoneNumber:ok") {
      wx.showToast({
        title: "已取消手机号授权",
        icon: "none"
      });
      return;
    }
    if (!detail.code) {
      wx.showToast({
        title: "手机号授权失败",
        icon: "none"
      });
      return;
    }

    this.loginWithPhoneCode(detail.code);
  },

  loginWithPhoneCode(phoneCode) {
    this.setData({
      loginLoading: true
    });
    loginWithPhoneNumber(phoneCode)
      .then((data) => {
        const user = data && data.user;
        getApp().setUser(user);
        this.updateUserState(user);
        wx.showToast({
          title: "登录成功",
          icon: "success"
        });
      })
      .catch((err) => {
        wx.showToast({
          title: this.getLoginErrorText(err),
          icon: "none"
        });
      })
      .finally(() => {
        this.setData({
          loginLoading: false
        });
      });
  },

  handleDevPhoneLogin() {
    if (this.data.loginLoading || this.data.loginConfig.loading) {
      return;
    }
    this.ensurePrivacyAuthorization(() => {
      this.loginWithDevPhone();
    }, "登录前请先阅读并同意用户隐私保护指引");
  },

  loginWithDevPhone() {
    this.setData({
      loginLoading: true
    });
    loginWithDevPhoneNumber()
      .then((data) => {
        const user = data && data.user;
        getApp().setUser(user);
        this.updateUserState(user);
        wx.showToast({
          title: "登录成功",
          icon: "success"
        });
      })
      .catch((err) => {
        wx.showToast({
          title: this.getLoginErrorText(err),
          icon: "none"
        });
      })
      .finally(() => {
        this.setData({
          loginLoading: false
        });
      });
  },

  getLoginErrorText(err) {
    const message = (err && (err.message || err.errMsg)) || "";
    if (message === "ADMIN_LOGIN_DISABLED") {
      return "管理员登录未开启";
    }
    if (message === "ADMIN_LOGIN_FAILED") {
      return "管理员账号或密码错误";
    }
    if (message === "WECHAT_LOGIN_NOT_CONFIGURED") {
      return "登录暂未配置";
    }
    if (message === "WX_LOGIN_CODE_EMPTY" || message === "WX_LOGIN_NOT_SUPPORTED") {
      return "微信登录不可用";
    }
    if (message === "PHONE_CODE_REQUIRED" || message === "PHONE_LOGIN_FAILED") {
      return "手机号校验失败";
    }
    if (message === "WECHAT_ACCESS_TOKEN_FAILED") {
      return "手机号接口未配置";
    }
    if (message === "LOGIN_CODE_REQUIRED" || message === "WECHAT_LOGIN_FAILED") {
      return "微信登录校验失败";
    }
    if (message.includes("request:fail") || message.includes("timeout") || message.includes("ECONNREFUSED")) {
      return "服务未连接";
    }
    return "登录失败，请重试";
  },

  logoutAccount(skipConfirm) {
    if (skipConfirm) {
      logout().then(() => {
        getApp().clearUser();
        this.updateUserState(null);
        wx.showToast({
          title: "已退出登录",
          icon: "none"
        });
      });
      return;
    }
    wx.showModal({
      title: "退出登录",
      content: "退出后会清除本机登录状态，不会删除你的本地对话记录。",
      confirmText: "退出",
      confirmColor: "#d14343",
      success: (res) => {
        if (!res.confirm) {
          return;
        }
        logout().then(() => {
          getApp().clearUser();
          this.updateUserState(null);
          wx.showToast({
            title: "已退出登录",
            icon: "none"
          });
        });
      }
    });
  },

  handleAction(e) {
    const action = e.currentTarget.dataset.action;
    if (action === "adminAgents") {
      wx.navigateTo({
        url: "/pages/admin/agents/agents"
      });
      return;
    }
    if (action === "account") {
      this.openAccountPanel();
      return;
    }
    if (action === "favorites") {
      wx.redirectTo({
        url: "/pages/index/index?category=favorite"
      });
      return;
    }
    if (action === "logs") {
      this.goRecent();
      return;
    }
    if (action === "usage") {
      wx.showModal({
        title: "使用统计",
        content: this.data.isLoggedIn
          ? `智能体总数：${getAgentCards().length} 个\n常用智能体：${getApp().getFavoriteIds().length} 个\n最近对话：${getApp().getRecentList().length} 条\n剩余次数：${getUserCreditText(this.data.user)}\nAI提问：${(this.data.user.usage && this.data.user.usage.chatCount) || 0} 次\n上传资料：${(this.data.user.usage && this.data.user.usage.uploadCount) || 0} 次`
          : `智能体总数：${getAgentCards().length} 个\n常用智能体：${getApp().getFavoriteIds().length} 个\n最近对话：${getApp().getRecentList().length} 条`,
        showCancel: false
      });
      return;
    }
    if (action === "plans") {
      this.showPlans();
      return;
    }
    if (action === "redeem") {
      this.openRedeemPanel();
      return;
    }
    if (action === "clearFavorites") {
      if (!getApp().getFavoriteIds().length) {
        wx.showToast({
          title: "暂无常用智能体",
          icon: "none"
        });
        return;
      }
      wx.showModal({
        title: "清空常用",
        content: "只会清空本地常用标记，不会删除智能体卡片和最近对话。",
        confirmText: "清空",
        confirmColor: "#d14343",
        success: (res) => {
          if (!res.confirm) {
            return;
          }
          getApp().clearFavorites();
          this.setData({
            stats: buildStats(getApp().getUser())
          });
          wx.showToast({
            title: "已清空常用",
            icon: "none"
          });
        }
      });
      return;
    }
    if (action === "service") {
      this.showSupport();
    }
  },

  showPlans() {
    fetchPlans()
      .then((data) => {
        const plans = data.plans || [];
        const currentPlan = data.currentPlan || plans[0] || {};
        const credits = data.credits || {};
        const currentCreditText = this.data.isLoggedIn
          ? getUserCreditText(this.data.user)
          : `${credits.initialCredits || 20} 次注册赠送`;
        const currentPlanText = currentPlan && currentPlan.name
          ? `当前套餐：${currentPlan.name} ${currentPlan.priceText || ""}\n${currentPlan.quotaText || ""}\n${currentPlan.desc || ""}`
          : "暂无套餐信息";
        wx.showModal({
          title: "会员与算力",
          content: `当前剩余次数：${currentCreditText}\n\n${currentPlanText}`,
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

  onShareAppMessage() {
    return buildShareOptions({
      title: `我的 - ${APP_TITLE}`,
      path: "/pages/profile/profile"
    });
  },

  onShareTimeline() {
    return buildTimelineOptions({
      title: `我的 - ${APP_TITLE}`
    });
  }
});
