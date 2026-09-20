const {
  fetchAdminUsers,
  updateAdminUserPlan,
  fetchAdminSupport,
  updateAdminSupport,
  fetchAdminAgents,
  createAdminAgent,
  updateAdminAgent,
  hideAdminAgent,
  fetchAdminRedeemConfig,
  createAdminRedeemCode,
  fetchAdminRedeemCodes,
  destroyAdminRedeemCode,
  importAdminAgents,
  resetAdminAgents
} = require("../../../utils/api");
const { getAgentCards } = require("../../../utils/agents");

function toForm(agent) {
  return {
    id: agent.id || "",
    name: agent.name || "",
    category: agent.category || "",
    accent: agent.accent || "",
    avatarSrc: agent.avatarSrc || "",
    badge: agent.badge || "",
    cardDesc: agent.cardDesc || "",
    intro: agent.intro || "",
    guide: agent.guide || "",
    saveGuide: agent.saveGuide || "",
    sample: agent.sample || "",
    coverLinesText: Array.isArray(agent.coverLines) ? agent.coverLines.join("\n") : "",
    coverLightSize: String(agent.coverLightSize || ""),
    coverLightLine: String(agent.coverLightLine || ""),
    coverHeavySize: String(agent.coverHeavySize || ""),
    coverHeavyLine: String(agent.coverHeavyLine || ""),
    coverBlockWidth: String(agent.coverBlockWidth || ""),
    avatarFontSize: String(agent.avatarFontSize || ""),
    avatarLineHeight: String(agent.avatarLineHeight || ""),
    avatarTop: String(agent.avatarTop || ""),
    avatarBlockWidth: String(agent.avatarBlockWidth || ""),
    avatarTextScale: String(agent.avatarTextScale || ""),
    avatarTextWidth: String(agent.avatarTextWidth || ""),
    frameworkText: Array.isArray(agent.framework) ? agent.framework.join("\n") : "",
    modulesText: Array.isArray(agent.modules)
      ? agent.modules.map((item) => [
        item.title || "",
        item.short || "",
        item.desc || "",
        item.prompt || ""
      ].join(" | ")).join("\n")
      : "",
    sortOrder: String(Number(agent.sortOrder || 0)),
    visible: agent.visible !== false
  };
}

function normalizeQuery(value) {
  return String(value || "").trim().toLowerCase();
}

function parseFrameworkText(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function parseModulesText(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("|").map((item) => item.trim());
      return {
        title: parts[0] || "",
        short: parts[1] || parts[0] || "",
        desc: parts[2] || "",
        prompt: parts.slice(3).join(" | ") || ""
      };
    })
    .filter((item) => item.title)
    .slice(0, 20);
}

function parseCoverLinesText(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 4);
}

function toNumberOrEmpty(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : "";
}

function toSupportForm(support) {
  const source = support && typeof support === "object" ? support : {};
  return {
    title: source.title || "",
    desc: source.desc || "",
    serviceHours: source.serviceHours || "",
    phone: source.phone || "",
    wechatId: source.wechatId || "",
    contactText: source.contactText || "",
    qrImageUrl: source.qrImageUrl || "",
    linkUrl: source.linkUrl || ""
  };
}

function decorateAdminUsers(users, plans) {
  const planList = Array.isArray(plans) ? plans : [];
  return (Array.isArray(users) ? users : []).map((user) => {
    const planIndex = Math.max(0, planList.findIndex((plan) => plan.id === user.planId));
    const phoneText = user.phoneLabel || (user.isDevLogin ? "开发测试号" : user.phoneMasked || "");
    return {
      ...user,
      planIndex,
      usageText: `剩余 ${user.isAdmin ? "不限" : Math.max(0, Number(user.creditBalance || 0))} / AI ${((user.usage && user.usage.chatCount) || 0)} / 上传 ${((user.usage && user.usage.uploadCount) || 0)}`,
      registeredText: formatDateTime(user.createdAt) || "未知",
      metaText: `${phoneText || "未绑定手机号"} · 最近 ${user.recentCount || 0} · 常用 ${user.favoriteCount || 0}`
    };
  });
}

function getUserLoadErrorMessage(err) {
  const message = err && err.message;
  if (message === "UNAUTHORIZED") {
    return "登录已失效，请重新登录管理员账号";
  }
  if (message === "ADMIN_REQUIRED") {
    return "当前账号没有用户管理权限";
  }
  if (message === "NOT_FOUND" || message === "REQUEST_FAILED") {
    return "用户接口不可用，请重启服务端后重试";
  }
  return "用户信息加载失败，请稍后重试";
}

function formatDateTime(value) {
  const time = Number(value || 0);
  if (!time) {
    return "";
  }
  const date = new Date(time);
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function decorateRedeemRecord(record) {
  const disabled = Boolean(record.disabled);
  const recordKey = record.recordId || record.id || "";
  const codeDisplay = record.codeDisplay || record.codeLabel || "完整卡密仅生成时显示";
  const redemptions = Array.isArray(record.redemptions) ? record.redemptions.map((item) => {
    const user = item.user || {};
    const accountText = [
      user.nickName || "未知用户",
      user.phoneLabel,
      user.id
    ].filter(Boolean).join(" · ");
    return {
      ...item,
      activatedText: formatDateTime(item.activatedAt || item.redeemedAt),
      accountText
    };
  }) : [];
  return {
    ...record,
    recordKey,
    codeDisplay,
    createdText: formatDateTime(record.createdAt),
    destroyedText: formatDateTime(record.destroyedAt),
    statusText: record.statusText || (disabled ? "已销毁" : record.isUsed ? "已使用" : "未使用"),
    statusClass: disabled ? "status-danger" : record.isUsed ? "status-hidden" : "",
    redemptions
  };
}

Page({
  data: {
    loading: false,
    saving: false,
    query: "",
    agents: [],
    filtered: [],
    showEditor: false,
    showUsers: false,
    showRedeemGenerator: false,
    showSupportSettings: false,
    editMode: "edit",
    form: toForm({}),
    users: [],
    plans: [],
    usersError: "",
    loadingUsers: false,
    savingUserPlanId: "",
    redeemCreditOptions: [20, 50, 100, 200, 500, 1000],
    redeemCreditIndex: 2,
    redeemNote: "",
    generatedRedeemCode: null,
    generatingRedeemCode: false,
    redeemQuery: "",
    redeemRecords: [],
    redeemRecordsLoading: false,
    redeemQueryResultText: "",
    destroyingRedeemId: "",
    savingSupport: false,
    supportForm: toSupportForm({}),
    stats: {
      total: 0,
      visible: 0,
      hidden: 0
    }
  },

  onShow() {
    this.loadAgents();
  },

  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
      return;
    }
    wx.redirectTo({
      url: "/pages/profile/profile"
    });
  },

  loadAgents() {
    this.setData({
      loading: true
    });
    fetchAdminAgents()
      .then((agents) => {
        if (Array.isArray(agents) && agents.length) {
          this.setAgents(agents);
          return;
        }
        return importAdminAgents(getAgentCards()).then((importedAgents) => {
          this.setAgents(importedAgents || []);
        });
      })
      .catch((err) => {
        const message = (err && err.message) || "";
        wx.showModal({
          title: "无法进入后台",
          content: message === "UNAUTHORIZED" ? "请先完成手机号登录。" : "当前账号没有随身AI军师团后台权限。",
          showCancel: false,
          success: () => {
            wx.redirectTo({
              url: "/pages/profile/profile"
            });
          }
        });
      })
      .finally(() => {
        this.setData({
          loading: false
        });
      });
  },

  setAgents(agents) {
    const stats = {
      total: agents.length,
      visible: agents.filter((item) => item.visible !== false).length,
      hidden: agents.filter((item) => item.visible === false).length
    };
    this.setData({
      agents,
      stats
    });
    this.filterAgents();
  },

  onSearch(e) {
    this.setData({
      query: e.detail.value
    });
    this.filterAgents();
  },

  filterAgents() {
    const query = normalizeQuery(this.data.query);
    const filtered = this.data.agents.filter((agent) => {
      if (!query) {
        return true;
      }
      return [agent.name, agent.parentName, agent.category, agent.cardDesc, agent.intro]
        .some((value) => String(value || "").toLowerCase().includes(query));
    });
    this.setData({
      filtered
    });
  },

  openCreate() {
    this.setData({
      showEditor: true,
      editMode: "create",
      form: toForm({
        sortOrder: this.data.agents.length,
        visible: true,
        category: "自定义",
        badge: ""
      })
    });
  },

  editAgent(e) {
    const id = e.currentTarget.dataset.id;
    const agent = this.data.agents.find((item) => item.id === id);
    if (!agent) {
      return;
    }
    this.setData({
      showEditor: true,
      editMode: "edit",
      form: toForm(agent)
    });
  },

  closeEditor() {
    if (this.data.saving) {
      return;
    }
    this.setData({
      showEditor: false,
      form: toForm({})
    });
  },

  stopTap() {},

  onFieldInput(e) {
    const field = e.currentTarget.dataset.field;
    if (!field) {
      return;
    }
    this.setData({
      [`form.${field}`]: e.detail.value
    });
  },

  onVisibleChange(e) {
    this.setData({
      "form.visible": Boolean(e.detail.value)
    });
  },

  openUsers() {
    this.setData({
      showUsers: true,
      loadingUsers: true,
      usersError: ""
    });
    fetchAdminUsers()
      .then((data) => {
        const plans = data.plans || [];
        this.setData({
          plans,
          users: decorateAdminUsers(data.users || [], plans)
        });
      })
      .catch((err) => {
        const message = getUserLoadErrorMessage(err);
        this.setData({
          usersError: message,
          users: []
        });
        wx.showToast({
          title: message,
          icon: "none"
        });
      })
      .finally(() => {
        this.setData({
          loadingUsers: false
        });
      });
  },

  closeUsers() {
    if (this.data.savingUserPlanId) {
      return;
    }
    this.setData({
      showUsers: false
    });
  },

  openRedeemGenerator() {
    this.setData({
      showRedeemGenerator: true,
      generatedRedeemCode: null,
      redeemNote: "",
      redeemQueryResultText: ""
    });
    fetchAdminRedeemConfig()
      .then((data) => {
        const options = Array.isArray(data.creditOptions) && data.creditOptions.length ? data.creditOptions : this.data.redeemCreditOptions;
        const currentCredits = this.data.redeemCreditOptions[this.data.redeemCreditIndex] || 100;
        const nextIndex = Math.max(0, options.findIndex((item) => Number(item) === Number(currentCredits)));
        this.setData({
          redeemCreditOptions: options,
          redeemCreditIndex: nextIndex
        });
      })
      .catch(() => {
        wx.showToast({
          title: "次数选项加载失败",
          icon: "none"
        });
      });
    this.loadRedeemRecords();
  },

  closeRedeemGenerator() {
    if (this.data.generatingRedeemCode || this.data.destroyingRedeemId) {
      return;
    }
    this.setData({
      showRedeemGenerator: false
    });
  },

  onRedeemCreditChange(e) {
    this.setData({
      redeemCreditIndex: Number(e.detail.value),
      generatedRedeemCode: null
    });
  },

  onRedeemNoteInput(e) {
    this.setData({
      redeemNote: e.detail.value
    });
  },

  onRedeemQueryInput(e) {
    this.setData({
      redeemQuery: e.detail.value
    });
  },

  loadRedeemRecords(code = "") {
    this.setData({
      redeemRecordsLoading: true,
      redeemQueryResultText: ""
    });
    fetchAdminRedeemCodes(code)
      .then((data) => {
        const records = (data.records || []).map(decorateRedeemRecord);
        this.setData({
          redeemRecords: records,
          redeemQueryResultText: code ? (data.found ? "已查到卡密记录" : "未找到该卡密") : ""
        });
      })
      .catch(() => {
        wx.showToast({
          title: "卡密记录加载失败",
          icon: "none"
        });
      })
      .finally(() => {
        this.setData({
          redeemRecordsLoading: false
        });
      });
  },

  queryRedeemCode() {
    const code = this.data.redeemQuery.trim();
    this.loadRedeemRecords(code);
  },

  generateRedeemCode() {
    if (this.data.generatingRedeemCode) {
      return;
    }
    const credits = Number(this.data.redeemCreditOptions[this.data.redeemCreditIndex] || 0);
    if (!credits) {
      wx.showToast({
        title: "请选择次数",
        icon: "none"
      });
      return;
    }
    this.setData({
      generatingRedeemCode: true,
      generatedRedeemCode: null
    });
    createAdminRedeemCode(credits, this.data.redeemNote)
      .then((data) => {
        this.setData({
          generatedRedeemCode: data
        });
        this.loadRedeemRecords();
        wx.showToast({
          title: "兑换码已生成",
          icon: "success"
        });
      })
      .catch((err) => {
        wx.showToast({
          title: err && err.message === "REDEEM_CREDITS_INVALID" ? "次数不可用" : "生成失败",
          icon: "none"
        });
      })
      .finally(() => {
        this.setData({
          generatingRedeemCode: false
        });
      });
  },

  copyGeneratedRedeemCode() {
    const code = this.data.generatedRedeemCode && this.data.generatedRedeemCode.code;
    if (!code) {
      return;
    }
    wx.setClipboardData({
      data: code
    });
  },

  copyRedeemRecord(e) {
    const code = e.currentTarget.dataset.code;
    if (!code) {
      wx.showToast({
        title: "暂无完整卡密",
        icon: "none"
      });
      return;
    }
    wx.setClipboardData({
      data: code,
      success: () => {
        wx.showToast({
          title: "完整卡密已复制",
          icon: "success"
        });
      }
    });
  },

  destroyRedeemRecord(e) {
    const recordId = e.currentTarget.dataset.id;
    const label = e.currentTarget.dataset.label || "这张卡密";
    if (!recordId || this.data.destroyingRedeemId) {
      return;
    }
    wx.showModal({
      title: "确认销毁卡密",
      content: `销毁后用户将无法再兑换。\n${label}`,
      confirmText: "销毁",
      confirmColor: "#dc2626",
      success: (res) => {
        if (!res.confirm) {
          return;
        }
        this.setData({
          destroyingRedeemId: recordId
        });
        destroyAdminRedeemCode(recordId)
          .then((data) => {
            const records = (data.records || []).map(decorateRedeemRecord);
            this.setData({
              redeemRecords: records
            });
            wx.showToast({
              title: "卡密已销毁",
              icon: "success"
            });
          })
          .catch((err) => {
            wx.showToast({
              title: err && err.message === "REDEEM_CODE_NOT_FOUND" ? "卡密不存在" : "销毁失败",
              icon: "none"
            });
          })
          .finally(() => {
            this.setData({
              destroyingRedeemId: ""
            });
          });
      }
    });
  },

  onUserPlanChange(e) {
    const userId = e.currentTarget.dataset.id;
    const index = Number(e.detail.value);
    const plan = this.data.plans[index];
    if (!userId || !plan || this.data.savingUserPlanId) {
      return;
    }
    this.setData({
      savingUserPlanId: userId
    });
    updateAdminUserPlan(userId, plan.id)
      .then((data) => {
        const users = (data && data.users) || this.data.users;
        this.setData({
          users: decorateAdminUsers(users, this.data.plans)
        });
        wx.showToast({
          title: "套餐已更新",
          icon: "success"
        });
      })
      .catch(() => {
        wx.showToast({
          title: "套餐更新失败",
          icon: "none"
        });
      })
      .finally(() => {
        this.setData({
          savingUserPlanId: ""
        });
      });
  },

  openSupportSettings() {
    this.setData({
      showSupportSettings: true,
      savingSupport: false
    });
    fetchAdminSupport()
      .then((support) => {
        this.setData({
          supportForm: toSupportForm(support)
        });
      })
      .catch(() => {
        wx.showToast({
          title: "客服配置加载失败",
          icon: "none"
        });
      });
  },

  closeSupportSettings() {
    if (this.data.savingSupport) {
      return;
    }
    this.setData({
      showSupportSettings: false
    });
  },

  onSupportFieldInput(e) {
    const field = e.currentTarget.dataset.field;
    if (!field) {
      return;
    }
    this.setData({
      [`supportForm.${field}`]: e.detail.value
    });
  },

  saveSupportSettings() {
    if (this.data.savingSupport) {
      return;
    }
    this.setData({
      savingSupport: true
    });
    updateAdminSupport(this.data.supportForm)
      .then((support) => {
        this.setData({
          supportForm: toSupportForm(support),
          showSupportSettings: false
        });
        wx.showToast({
          title: "客服配置已保存",
          icon: "success"
        });
      })
      .catch(() => {
        wx.showToast({
          title: "客服配置保存失败",
          icon: "none"
        });
      })
      .finally(() => {
        this.setData({
          savingSupport: false
        });
      });
  },

  saveAgent() {
    if (this.data.saving) {
      return;
    }
    const form = this.data.form;
    if (!form.name.trim()) {
      wx.showToast({
        title: "请填写智能体名称",
        icon: "none"
      });
      return;
    }

    const payload = {
      name: form.name,
      category: form.category,
      accent: form.accent,
      avatarSrc: form.avatarSrc,
      badge: form.badge,
      cardDesc: form.cardDesc,
      intro: form.intro,
      guide: form.guide,
      saveGuide: form.saveGuide,
      sample: form.sample,
      coverLines: parseCoverLinesText(form.coverLinesText),
      coverLightSize: toNumberOrEmpty(form.coverLightSize),
      coverLightLine: toNumberOrEmpty(form.coverLightLine),
      coverHeavySize: toNumberOrEmpty(form.coverHeavySize),
      coverHeavyLine: toNumberOrEmpty(form.coverHeavyLine),
      coverBlockWidth: toNumberOrEmpty(form.coverBlockWidth),
      avatarFontSize: toNumberOrEmpty(form.avatarFontSize),
      avatarLineHeight: toNumberOrEmpty(form.avatarLineHeight),
      avatarTop: toNumberOrEmpty(form.avatarTop),
      avatarBlockWidth: toNumberOrEmpty(form.avatarBlockWidth),
      avatarTextScale: toNumberOrEmpty(form.avatarTextScale),
      avatarTextWidth: toNumberOrEmpty(form.avatarTextWidth),
      framework: parseFrameworkText(form.frameworkText),
      modules: parseModulesText(form.modulesText),
      sortOrder: Number(form.sortOrder || 0),
      visible: form.visible
    };
    this.setData({
      saving: true
    });
    const request = this.data.editMode === "create"
      ? createAdminAgent(payload)
      : updateAdminAgent(form.id, payload);
    request
      .then((data) => {
        this.setAgents((data && data.agents) || this.data.agents);
        this.setData({
          showEditor: false,
          form: toForm({})
        });
        wx.showToast({
          title: "已保存",
          icon: "success"
        });
      })
      .catch(() => {
        wx.showToast({
          title: "保存失败",
          icon: "none"
        });
      })
      .finally(() => {
        this.setData({
          saving: false
        });
      });
  },

  toggleVisible(e) {
    const id = e.currentTarget.dataset.id;
    const agent = this.data.agents.find((item) => item.id === id);
    if (!agent) {
      return;
    }
    const request = agent.visible === false ? updateAdminAgent(id, { visible: true }) : hideAdminAgent(id);
    request
      .then((data) => {
        this.setAgents((data && data.agents) || this.data.agents);
      })
      .catch(() => {
        wx.showToast({
          title: "操作失败",
          icon: "none"
        });
      });
  },

  resetCatalog() {
    wx.showModal({
      title: "重置智能体目录",
      content: "会把后台智能体恢复为当前代码里的初始目录，已做的后台改动会被覆盖。",
      confirmText: "重置",
      confirmColor: "#d14343",
      success: (res) => {
        if (!res.confirm) {
          return;
        }
        resetAdminAgents()
          .then(() => importAdminAgents(getAgentCards()))
          .then((agents) => {
            this.setAgents(agents || []);
            wx.showToast({
              title: "已重置",
              icon: "success"
            });
          })
          .catch(() => {
            wx.showToast({
              title: "重置失败",
              icon: "none"
            });
          });
      }
    });
  }
});
