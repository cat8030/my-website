const { getAgentById } = require("../../utils/agents");
const { sendAgentMessage, uploadAttachment, deleteAttachment, fetchAgentDetail } = require("../../utils/api");
const { DEFAULT_PRIVACY_NAME, getPrivacySetting, openPrivacyContract } = require("../../utils/privacy");
const { APP_TITLE, enablePageShare, buildShareOptions, buildTimelineOptions } = require("../../utils/share");

const DRAFT_STORAGE_PREFIX = "agentDraft:";

function isUserCancel(err) {
  const message = (err && err.errMsg) || "";
  return message.includes("cancel") || message.includes("取消");
}

function getRawErrorMessage(err) {
  return (err && (err.errMsg || err.message)) || "";
}

function getChooserErrorContent(err, actionName) {
  const message = getRawErrorMessage(err);
  const lower = message.toLowerCase();
  if (lower.includes("privacy agreement") || lower.includes("api scope is not declared") || lower.includes("privacy api banned")) {
    return [
      "微信隐私保护指引还没有声明或还没有生效这个能力。",
      "",
      "请到微信公众平台 -> 设置与开发 -> 服务内容声明 -> 用户隐私保护指引，补充并提交：",
      "上传图片/拍摄：收集你选中的照片或视频信息",
      "上传文件：收集你选中的文件",
      "",
      "提交后通常需要等待约 5 分钟生效，然后重新编译再测试。",
      "",
      `原始错误：${message || "无"}`
    ].join("\n");
  }
  if (lower.includes("auth deny") || lower.includes("authorize") || lower.includes("permission")) {
    return `${actionName}权限未开启，请在微信或系统权限里允许后重试。\n\n原始错误：${message || "无"}`;
  }
  if (lower.includes("not support") || lower.includes("not supported")) {
    return `当前微信环境不支持${actionName}，请升级微信后用真机测试。\n\n原始错误：${message || "无"}`;
  }
  return `${actionName}没有打开。\n\n原始错误：${message || "无"}`;
}

function showChooserError(err, actionName) {
  console.error(`[${actionName}失败]`, err);
  wx.showModal({
    title: `${actionName}失败`,
    content: getChooserErrorContent(err, actionName),
    showCancel: false,
    confirmText: "知道了"
  });
}

function getAgentRequestErrorText(err) {
  const message = err && err.message;
  if (message === "UNAUTHORIZED") {
    return "请先到“我的”页面登录后再提问";
  }
  if (message === "AI_API_KEY_EMPTY") {
    return "请先在 config/ai-secret.js 里填写接口密钥，然后重新编译";
  }
  if (message === "AI_MODEL_EMPTY") {
    return "请先在 config/ai-secret.js 里填写模型名称，然后重新编译";
  }
  if (message === "AI_UNAUTHORIZED") {
    return "接口密钥无效或没有模型权限，请检查密钥和模型名称";
  }
  if (message === "AI_RATE_LIMITED") {
    return "接口调用过于频繁或额度不足，请稍后重试";
  }
  if (message === "CREDITS_EXHAUSTED") {
    return "剩余次数不足，请到“我的”页面使用卡密兑换次数";
  }
  if (message === "CONTENT_NOT_ALLOWED") {
    return "内容可能不符合平台规范，请调整后再试";
  }
  if (message === "CONTENT_SECURITY_CHECK_FAILED") {
    return "内容安全校验暂时不可用，请稍后再试";
  }
  if (message === "EMPTY_MODEL_RESPONSE") {
    return "模型服务暂时没有返回内容，请稍后重试或联系客服";
  }
  if (/^UPSTREAM_\d+/.test(message) || message === "UPSTREAM_TIMEOUT") {
    return "模型服务暂时不可用，请稍后重试";
  }
  return message || "请求失败，请稍后重试";
}

function getAttachmentStatusText(remote) {
  if (remote.visionWarning) {
    return "图片过大";
  }
  if (remote.visionReady) {
    return "可识别";
  }
  if (remote.hasTextPreview) {
    return "已读取";
  }
  if (remote.textExtractStatus === "too-large") {
    return "文件过大";
  }
  if (remote.textExtractStatus === "parse-failed") {
    return "解析失败";
  }
  if (remote.textExtractStatus === "no-readable-text") {
    return "无可读文本";
  }
  return "已上传";
}

Page({
  data: {
    agent: null,
    message: "",
    messages: [],
    activeModule: "",
    quickPrompts: [],
    isFavorite: false,
    sending: false,
    lastError: "",
    scrollIntoView: "",
    showUploadMenu: false,
    attachments: [],
    navTop: 44,
    navHeight: 32,
    topbarHeight: 88,
    navRightReserve: 116,
    showPrivacy: false,
    privacyContractName: DEFAULT_PRIVACY_NAME,
    privacyActionText: ""
  },

  onLoad(options) {
    enablePageShare();
    this.setNavigationMetrics();
    this.refreshPrivacySetting();
    const agent = getAgentById(options.id);
    const recent = options.restore ? getApp().getRecentByAgentId(agent.id) : null;
    const messages = recent && Array.isArray(recent.messages) ? recent.messages : [];
    const draft = wx.getStorageSync(`${DRAFT_STORAGE_PREFIX}${agent.id}`) || "";
    this.setData({
      agent,
      activeModule: (recent && recent.activeModule) || agent.activeModule || "",
      message: draft,
      messages,
      quickPrompts: this.buildQuickPrompts(agent),
      isFavorite: getApp().isFavoriteAgent(agent.id)
    });
    this.loadAgentDetail(agent.id);
    this.scrollToBottom();
  },

  loadAgentDetail(id) {
    fetchAgentDetail(id)
      .then((remoteAgent) => {
        if (!remoteAgent) {
          return;
        }
        const recent = getApp().getRecentByAgentId(remoteAgent.id);
        this.setData({
          agent: remoteAgent,
          activeModule: this.data.activeModule || (recent && recent.activeModule) || remoteAgent.activeModule || "",
          quickPrompts: this.buildQuickPrompts(remoteAgent),
          isFavorite: getApp().isFavoriteAgent(remoteAgent.id)
        });
      })
      .catch(() => null);
  },

  onShow() {
    enablePageShare();
  },

  onReady() {
    enablePageShare();
  },

  setNavigationMetrics() {
    let systemInfo = {};
    let menuButton = null;
    try {
      systemInfo = wx.getSystemInfoSync ? wx.getSystemInfoSync() : {};
      menuButton = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null;
    } catch (err) {
      systemInfo = {};
      menuButton = null;
    }

    const statusBarHeight = systemInfo.statusBarHeight || 44;
    const windowWidth = systemInfo.windowWidth || 375;
    const navTop = menuButton && menuButton.top ? menuButton.top : statusBarHeight + 6;
    const navHeight = menuButton && menuButton.height ? menuButton.height : 32;
    const bottomGap = Math.max(navTop - statusBarHeight, 6);
    const topbarHeight = navTop + navHeight + bottomGap + 8;
    const navRightReserve = menuButton && menuButton.left ? Math.ceil(windowWidth - menuButton.left + 10) : 116;

    this.setData({
      navTop,
      navHeight,
      topbarHeight,
      navRightReserve
    });
  },

  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
      return;
    }
    wx.redirectTo({
      url: "/pages/index/index"
    });
  },

  buildQuickPrompts(agent) {
    return [{
      label: "主问题",
      prompt: agent.sample,
      moduleTitle: ""
    }].concat(agent.modules.map((moduleItem) => ({
      label: moduleItem.short,
      prompt: moduleItem.prompt,
      moduleTitle: moduleItem.title
    })));
  },

  useModule(e) {
    const index = e.currentTarget.dataset.index;
    const moduleItem = this.data.agent.modules[index];
    this.setData({
      activeModule: moduleItem.title,
      message: moduleItem.prompt
    });
  },

  usePrompt(e) {
    const index = e.currentTarget.dataset.index;
    const prompt = this.data.quickPrompts[index];
    if (!prompt) {
      return;
    }
    this.setData({
      activeModule: prompt.moduleTitle,
      message: prompt.prompt,
      showUploadMenu: false
    });
    this.saveDraft(prompt.prompt);
  },

  onInput(e) {
    const message = e.detail.value;
    this.setData({
      message
    });
    this.saveDraft(message);
  },

  saveDraft(message) {
    if (!this.data.agent) {
      return;
    }
    const key = `${DRAFT_STORAGE_PREFIX}${this.data.agent.id}`;
    if (message && message.trim()) {
      wx.setStorageSync(key, message);
      return;
    }
    wx.removeStorageSync(key);
  },

  scrollToBottom() {
    this.setData({
      scrollIntoView: ""
    });
    setTimeout(() => {
      this.setData({
        scrollIntoView: "bottom-anchor"
      });
    }, 50);
  },

  toggleUploadMenu() {
    if (this.data.sending) {
      return;
    }
    this.setData({
      showUploadMenu: !this.data.showUploadMenu
    });
  },

  closeUploadMenu() {
    if (!this.data.showUploadMenu) {
      return;
    }
    this.setData({
      showUploadMenu: false
    });
  },

  chooseUploadImage() {
    this.pickImage(["album"], "上传图片");
  },

  takePhoto() {
    this.pickImage(["camera"], "拍摄图片");
  },

  refreshPrivacySetting() {
    getPrivacySetting().then((setting) => {
      this.privacyChecked = true;
      this.needPrivacyAuthorization = Boolean(setting.needAuthorization);
      this.setData({
        privacyContractName: setting.privacyContractName || DEFAULT_PRIVACY_NAME
      });
    }).catch(() => {
      this.privacyChecked = true;
      this.needPrivacyAuthorization = false;
    });
  },

  runWithPrivacyAuthorization(action, actionText) {
    if (typeof action !== "function") {
      return;
    }
    if (!this.privacyChecked) {
      wx.showToast({
        title: "正在准备上传，请再点一次",
        icon: "none"
      });
      this.refreshPrivacySetting();
      return;
    }
    if (this.needPrivacyAuthorization) {
      this.pendingPrivacyAction = action;
      this.setData({
        showUploadMenu: false,
        showPrivacy: true,
        privacyActionText: actionText || "继续使用前请先阅读并同意用户隐私保护指引"
      });
      return;
    }
    action();
  },

  handleAgreePrivacyAuthorization() {
    const action = this.pendingPrivacyAction;
    this.pendingPrivacyAction = null;
    this.needPrivacyAuthorization = false;
    this.privacyChecked = true;
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

  stopTap() {},

  pickImage(sourceType, fallbackName) {
    this.closeUploadMenu();
    const addImage = (file) => {
      const path = file && (file.tempFilePath || file.path);
      if (!path) {
        wx.showToast({
          title: "未获取到图片",
          icon: "none"
        });
        this.closeUploadMenu();
        return;
      }
      this.addAttachment({
        type: "image",
        name: fallbackName || "上传图片",
        path,
        size: file.size || 0
      });
    };

    const handleFail = (err) => {
      this.closeUploadMenu();
      if (isUserCancel(err)) {
        return;
      }
      showChooserError(err, sourceType.includes("camera") ? "拍摄" : "上传图片");
    };

    if (wx.chooseImage) {
      wx.chooseImage({
        count: 1,
        sourceType,
        sizeType: ["compressed"],
        success: (res) => {
          const file = (res.tempFiles && res.tempFiles[0]) || {
            path: res.tempFilePaths && res.tempFilePaths[0],
            size: 0
          };
          addImage(file);
        },
        fail: handleFail
      });
      return;
    }

    if (wx.chooseMedia) {
      wx.chooseMedia({
        count: 1,
        mediaType: ["image"],
        sourceType,
        sizeType: ["compressed"],
        success: (res) => {
          addImage(res.tempFiles && res.tempFiles[0]);
        },
        fail: handleFail
      });
      return;
    }

    wx.showToast({
      title: "当前微信版本不支持",
      icon: "none"
    });
    this.closeUploadMenu();
  },

  chooseUploadFile() {
    this.doChooseUploadFile();
  },

  doChooseUploadFile() {
    this.closeUploadMenu();
    if (!wx.chooseMessageFile) {
      wx.showToast({
        title: "当前微信版本不支持",
        icon: "none"
      });
      this.closeUploadMenu();
      return;
    }

    wx.chooseMessageFile({
      count: 1,
      type: "file",
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0];
        if (!file) {
          return;
        }
        this.addAttachment({
          type: "file",
          name: file.name || "上传文件",
          path: file.path,
          size: file.size || 0
        });
      },
      fail: (err) => {
        this.closeUploadMenu();
        if (!isUserCancel(err)) {
          showChooserError(err, "上传文件");
        }
      }
    });
  },

  addAttachment(attachment) {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const nextAttachment = {
      ...attachment,
      id,
      status: "uploading",
      statusText: "上传中"
    };
    this.setData({
      attachments: [nextAttachment],
      showUploadMenu: false
    });
    this.uploadSelectedAttachment(nextAttachment);
  },

  uploadSelectedAttachment(attachment) {
    uploadAttachment(attachment).then((remote) => {
      this.updateAttachment(attachment.id, {
        ...remote,
        id: attachment.id,
        path: attachment.path,
        status: "uploaded",
        statusText: getAttachmentStatusText(remote)
      });
    }).catch((err) => {
      this.updateAttachment(attachment.id, {
        status: "failed",
        statusText: err && err.message ? "上传失败" : "上传失败"
      });
      wx.showToast({
        title: "附件上传失败",
        icon: "none"
      });
    });
  },

  updateAttachment(id, patch) {
    this.setData({
      attachments: this.data.attachments.map((item) => {
        if (item.id !== id) {
          return item;
        }
        return {
          ...item,
          ...patch
        };
      })
    });
  },

  retryAttachment(e) {
    const id = e.currentTarget.dataset.id;
    const attachment = this.data.attachments.find((item) => item.id === id);
    if (!attachment || attachment.status === "uploading") {
      return;
    }
    this.updateAttachment(id, {
      status: "uploading",
      statusText: "上传中"
    });
    this.uploadSelectedAttachment(attachment);
  },

  removeAttachment(e) {
    const id = e.currentTarget.dataset.id;
    const attachment = this.data.attachments.find((item) => item.id === id);
    this.setData({
      attachments: id ? this.data.attachments.filter((item) => item.id !== id) : []
    });
    if (attachment && attachment.serverId) {
      deleteAttachment(attachment.serverId).catch(() => null);
    }
  },

  previewAttachment(e) {
    const src = e.currentTarget.dataset.src;
    if (!src) {
      return;
    }
    wx.previewImage({
      urls: [src],
      current: src
    });
  },

  startNewChat() {
    if (!this.data.messages.length || this.data.sending) {
      return;
    }
    wx.showModal({
      title: "新对话",
      content: "会清空当前页面里的临时对话内容，最近对话记录仍然保留。",
      confirmText: "开始新的",
      success: (res) => {
        if (!res.confirm) {
          return;
        }
        this.setData({
          messages: [],
          message: "",
          activeModule: this.data.agent.activeModule || "",
          lastError: ""
        });
        this.saveDraft("");
      }
    });
  },

  copyLastReply() {
    const lastReply = this.data.messages.slice().reverse().find((item) => item.role === "assistant");
    if (!lastReply) {
      wx.showToast({
        title: "暂无可复制内容",
        icon: "none"
      });
      return;
    }
    wx.setClipboardData({
      data: lastReply.content,
      success() {
        wx.showToast({
          title: "已复制回复",
          icon: "none"
        });
      }
    });
  },

  copyMessage(e) {
    const index = e.currentTarget.dataset.index;
    const message = this.data.messages[index];
    if (!message || !message.content) {
      return;
    }
    wx.setClipboardData({
      data: message.content,
      success() {
        wx.showToast({
          title: "已复制",
          icon: "none"
        });
      }
    });
  },

  toggleFavorite() {
    const favoriteIds = getApp().toggleFavoriteAgent(this.data.agent.id);
    const isFavorite = favoriteIds.includes(this.data.agent.id);
    this.setData({
      isFavorite
    });
    wx.showToast({
      title: isFavorite ? "已加入常用" : "已取消常用",
      icon: "none"
    });
  },

  retryLastMessage() {
    if (!this.lastFailedRequest || this.data.sending) {
      return;
    }
    const { content, messages, moduleTitle, attachments } = this.lastFailedRequest;
    this.requestAgentReply({
      content,
      messages,
      moduleTitle,
      attachments
    });
  },

  regenerateLastReply() {
    if (this.data.sending || !this.data.messages.length) {
      return;
    }
    const messages = this.data.messages.slice();
    let lastUserIndex = -1;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index].role === "user") {
        lastUserIndex = index;
        break;
      }
    }
    if (lastUserIndex < 0) {
      wx.showToast({
        title: "暂无可重新生成的问题",
        icon: "none"
      });
      return;
    }
    const nextMessages = messages.slice(0, lastUserIndex + 1);
    const userMessage = nextMessages[lastUserIndex];
    this.setData({
      messages: nextMessages,
      lastError: ""
    });
    this.requestAgentReply({
      content: userMessage.content,
      messages: nextMessages,
      moduleTitle: this.data.activeModule,
      attachments: userMessage.attachments || []
    });
  },

  sendMessage() {
    const message = this.data.message.trim();
    const attachments = this.data.attachments || [];
    const agent = this.data.agent;
    if ((!message && !attachments.length) || this.data.sending) {
      return;
    }
    if (attachments.some((item) => item.status === "uploading")) {
      wx.showToast({
        title: "附件还在上传中",
        icon: "none"
      });
      return;
    }
    if (attachments.some((item) => item.status === "failed")) {
      wx.showToast({
        title: "请先重试或删除失败附件",
        icon: "none"
      });
      return;
    }
    const cleanAttachments = attachments.map((item) => ({
      serverId: item.serverId,
      type: item.type,
      name: item.name,
      size: item.size,
      mimeType: item.mimeType,
      textPreview: item.textPreview || "",
      hasTextPreview: Boolean(item.hasTextPreview),
      textExtractStatus: item.textExtractStatus || "",
      textExtractWarning: item.textExtractWarning || "",
      visionReady: Boolean(item.visionReady),
      visionWarning: item.visionWarning || "",
      visionDataUrl: item.visionDataUrl || ""
    }));
    const messageAttachments = attachments.map((item) => ({
      serverId: item.serverId,
      type: item.type,
      name: item.name,
      size: item.size,
      path: item.path,
      mimeType: item.mimeType,
      status: item.status,
      statusText: item.statusText,
      visionReady: Boolean(item.visionReady),
      hasTextPreview: Boolean(item.hasTextPreview),
      textExtractStatus: item.textExtractStatus || "",
      textExtractWarning: item.textExtractWarning || ""
    }));
    const attachmentText = cleanAttachments.map((item) => `已上传${item.type === "image" ? "图片" : "文件"}：${item.name}`).join("\n");
    const content = [message, attachmentText].filter(Boolean).join("\n");

    const userMessage = {
      role: "user",
      content,
      attachments: messageAttachments
    };
    const messages = this.data.messages.concat(userMessage);
    this.setData({
      messages,
      message: "",
      attachments: [],
      showUploadMenu: false,
      lastError: "",
      sending: true
    });
    this.saveDraft("");
    this.scrollToBottom();

    this.requestAgentReply({
      content,
      messages,
      moduleTitle: this.data.activeModule,
      attachments: cleanAttachments
    });
  },

  requestAgentReply({ content, messages, moduleTitle, attachments = [] }) {
    const agent = this.data.agent;
    this.lastFailedRequest = null;
    this.setData({
      sending: true,
      lastError: ""
    });
    sendAgentMessage({
      agent,
      message: content,
      moduleTitle,
      history: messages,
      attachments
    }).then((reply) => {
      if (reply.raw && reply.raw.user) {
        getApp().setUser(reply.raw.user);
      }
      const assistantMessage = {
        role: "assistant",
        content: reply.content
      };
      const nextMessages = this.data.messages.concat(assistantMessage);
      this.setData({
        messages: nextMessages,
        sending: false
      });
      this.scrollToBottom();
      getApp().addRecent({
        agentId: agent.id,
        agentName: agent.name,
        parentId: agent.parentId,
        parentName: agent.parentName,
        activeModule: moduleTitle,
        preview: content,
        reply: reply.content,
        source: reply.source,
        messages: nextMessages
      });
    }).catch((err) => {
      this.lastFailedRequest = {
        content,
        messages,
        moduleTitle,
        attachments
      };
      const errorText = getAgentRequestErrorText(err);
      wx.showToast({
        title: errorText === "剩余次数不足，请到“我的”页面使用卡密兑换次数" ? "次数不足" : errorText === "请先到“我的”页面登录后再提问" ? "请先登录" : "请求失败",
        icon: "none"
      });
      this.setData({
        sending: false,
        lastError: errorText
      });
      this.scrollToBottom();
    });
  },

  onShareAppMessage() {
    const agent = this.data.agent || {};
    const id = agent.id || "";
    return buildShareOptions({
      title: agent.name ? `${agent.name} - ${APP_TITLE}` : APP_TITLE,
      path: id ? `/pages/agent/agent?id=${encodeURIComponent(id)}` : "/pages/index/index"
    });
  },

  onShareTimeline() {
    const agent = this.data.agent || {};
    const id = agent.id || "";
    return buildTimelineOptions({
      title: agent.name ? `${agent.name} - ${APP_TITLE}` : APP_TITLE,
      query: id ? `id=${encodeURIComponent(id)}` : ""
    });
  }
});
