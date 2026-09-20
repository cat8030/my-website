const { requestImageGeneration } = require("../../utils/api");

const DRAFT_KEY = "commerceStudioDrafts";
const HISTORY_KEY = "commerceStudioHistory";

const TEMPLATE_PRESETS = {
  taobao: [
    { id: "tb-search", name: "搜索主图", meta: "1:1 · 高点击", mode: "main", ratio: "square", style: "studio", prompt: "纯净背景，商品占画面约 75%，突出轮廓、材质与五金细节，适合淘宝搜索结果页。" },
    { id: "tb-new", name: "新品首发", meta: "3:4 · 上新", mode: "detail", ratio: "portrait", style: "launch", prompt: "新品首发氛围，精致陈列与高级灯光，留出上方标题安全区，适合淘宝逛逛和详情首屏。" },
    { id: "tb-oriental", name: "东方详情", meta: "3:4 · 品牌感", mode: "detail", ratio: "portrait", style: "oriental", prompt: "东方器物与宋锦纹样轻量点缀，突出原创设计和材质故事，画面克制，不喧宾夺主。" }
  ],
  douyin: [
    { id: "dy-feed", name: "信息流封面", meta: "9:16 · 强冲击", mode: "cover", ratio: "story", style: "launch", prompt: "竖版信息流封面，前三秒强视觉冲击，商品居中偏上，底部预留直播或短视频标题安全区。" },
    { id: "dy-scene", name: "场景种草", meta: "9:16 · 生活感", mode: "cover", ratio: "story", style: "lifestyle", prompt: "真实生活方式场景，自然光与轻微动态感，突出上身比例和日常搭配，适合抖音种草。" },
    { id: "dy-live", name: "直播间主视觉", meta: "3:4 · 转化", mode: "main", ratio: "portrait", style: "studio", prompt: "直播间商品展示视觉，主体清晰醒目，材质细节真实，背景简洁，四周保留贴片和价格信息空间。" }
  ]
};

const PLATFORM_NOTES = {
  taobao: "淘宝：优先突出商品主体、材质细节与搜索场景点击率。",
  douyin: "抖音电商：优先强化首屏冲击力、生活化场景与竖版信息节奏。"
};

const SIZE_MAP = {
  square: "1024x1024",
  portrait: "1024x1536",
  story: "1024x1536"
};

Page({
  data: {
    platforms: [
      { id: "taobao", name: "淘宝", mark: "淘" },
      { id: "douyin", name: "抖音电商", mark: "抖" }
    ],
    activePlatform: "taobao",
    platformNote: PLATFORM_NOTES.taobao,
    templates: TEMPLATE_PRESETS.taobao,
    activeTemplate: "",
    modes: [
      { id: "main", name: "商品主图", desc: "搜索与商品卡", icon: "主" },
      { id: "detail", name: "详情视觉", desc: "卖点与场景图", icon: "详" },
      { id: "cover", name: "短视频封面", desc: "直播与内容流", icon: "封" }
    ],
    activeMode: "main",
    styles: [
      { id: "oriental", name: "国潮东方" },
      { id: "studio", name: "纯白棚拍" },
      { id: "launch", name: "新品发布" },
      { id: "lifestyle", name: "生活方式" }
    ],
    activeStyle: "oriental",
    ratios: [
      { id: "square", name: "1:1", use: "商品主图" },
      { id: "portrait", name: "3:4", use: "淘宝内容" },
      { id: "story", name: "9:16", use: "抖音竖版" }
    ],
    activeRatio: "square",
    productName: "",
    sellingPoint: "",
    prompt: "",
    referenceImage: "",
    generatedImages: [],
    generating: false,
    generationStage: "",
    drafts: [],
    draftCount: 0,
    showDraftPanel: false,
    history: []
  },

  onLoad() {
    const drafts = wx.getStorageSync(DRAFT_KEY) || [];
    const history = wx.getStorageSync(HISTORY_KEY) || [];
    this.setData({
      drafts: Array.isArray(drafts) ? drafts : [],
      draftCount: Array.isArray(drafts) ? drafts.length : 0,
      history: Array.isArray(history) ? history : []
    });
  },

  selectPlatform(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({
      activePlatform: id,
      platformNote: PLATFORM_NOTES[id],
      templates: TEMPLATE_PRESETS[id],
      activeTemplate: ""
    });
  },

  applyTemplate(e) {
    const id = e.currentTarget.dataset.id;
    const template = this.data.templates.find((item) => item.id === id);
    if (!template) {
      return;
    }
    this.setData({
      activeTemplate: id,
      activeMode: template.mode,
      activeRatio: template.ratio,
      activeStyle: template.style,
      prompt: template.prompt
    });
    wx.showToast({ title: `已应用${template.name}`, icon: "none" });
  },

  selectMode(e) {
    this.setData({ activeMode: e.currentTarget.dataset.id });
  },

  selectStyle(e) {
    this.setData({ activeStyle: e.currentTarget.dataset.id });
  },

  selectRatio(e) {
    this.setData({ activeRatio: e.currentTarget.dataset.id });
  },

  inputProductName(e) {
    this.setData({ productName: e.detail.value });
  },

  inputSellingPoint(e) {
    this.setData({ sellingPoint: e.detail.value });
  },

  inputPrompt(e) {
    this.setData({ prompt: e.detail.value });
  },

  chooseReferenceImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      sourceType: ["album", "camera"],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0];
        if (file) {
          this.setData({ referenceImage: file.tempFilePath });
        }
      }
    });
  },

  buildPrompt() {
    const platform = this.data.activePlatform === "taobao" ? "中国淘宝" : "中国抖音电商";
    const modeMap = { main: "商品主图", detail: "商品详情页场景视觉", cover: "短视频或直播封面" };
    const styleMap = {
      oriental: "现代国潮东方美学，克制高级，宋锦纹样与东方器物作为轻量点缀",
      studio: "纯白专业摄影棚，高级商业产品摄影，阴影干净",
      launch: "新品发布会视觉，聚焦产品，强对比灯光，精致商业质感",
      lifestyle: "真实生活方式场景，自然光，适合种草内容"
    };
    const ratioMap = { square: "1:1 方形构图", portrait: "3:4 竖版构图", story: "9:16 竖版构图" };
    return [
      `为${platform}制作${modeMap[this.data.activeMode]}。`,
      this.data.productName ? `商品：${this.data.productName}。` : "商品：原创小众女包。",
      this.data.sellingPoint ? `核心卖点：${this.data.sellingPoint}。` : "突出原创设计、精致材质和轻奢质感。",
      `视觉风格：${styleMap[this.data.activeStyle]}。`,
      `版式：${ratioMap[this.data.activeRatio]}，商品主体完整，预留安全留白。`,
      this.data.prompt ? `补充要求：${this.data.prompt}。` : "",
      "高端电商产品摄影，细节清晰，真实材质，不出现品牌 Logo，不出现文字，不出现水印，不出现多余商品。"
    ].filter(Boolean).join("\n");
  },

  saveDraft() {
    const drafts = wx.getStorageSync(DRAFT_KEY) || [];
    const next = [{
      id: Date.now(),
      productName: this.data.productName || "未命名商品",
      sellingPoint: this.data.sellingPoint,
      prompt: this.data.prompt,
      platform: this.data.activePlatform,
      mode: this.data.activeMode,
      style: this.data.activeStyle,
      ratio: this.data.activeRatio,
      template: this.data.activeTemplate,
      referenceImage: this.data.referenceImage,
      createdAt: new Date().toLocaleString()
    }].concat(Array.isArray(drafts) ? drafts : []).slice(0, 20);
    wx.setStorageSync(DRAFT_KEY, next);
    this.setData({ drafts: next, draftCount: next.length });
  },

  saveHistory(images) {
    const current = wx.getStorageSync(HISTORY_KEY) || [];
    const next = [{
      id: Date.now(),
      productName: this.data.productName || "未命名商品",
      platform: this.data.activePlatform,
      mode: this.data.activeMode,
      images,
      createdAt: new Date().toLocaleString()
    }].concat(Array.isArray(current) ? current : []).slice(0, 12);
    wx.setStorageSync(HISTORY_KEY, next);
    this.setData({ history: next });
  },

  generateImages() {
    if (!this.data.productName.trim() && !this.data.prompt.trim()) {
      wx.showToast({ title: "先填写商品名称或画面要求", icon: "none" });
      return;
    }
    this.setData({ generating: true, generationStage: "正在提交生成任务…" });
    this.saveDraft();
    requestImageGeneration({
      prompt: this.buildPrompt(),
      size: SIZE_MAP[this.data.activeRatio],
      count: 1,
      onProgress: ({ status, progress }) => {
        const labels = {
          queued: "任务已排队，等待生成…",
          pending: "任务已排队，等待生成…",
          submitted: "任务已提交…",
          running: "正在生成商品图…",
          processing: "正在处理商品图…",
          completed: "生成完成，正在加载图片…"
        };
        const suffix = progress > 0 && progress < 100 ? ` ${progress}%` : "";
        this.setData({ generationStage: `${labels[status] || "正在生成商品图…"}${suffix}` });
      }
    }).then((result) => {
      const generatedImages = result.images.map((item, index) => ({
        ...item,
        url: item.url || this.saveBase64Image(item.b64Json, index)
      })).filter((item) => item.url);
      this.setData({ generatedImages });
      this.saveHistory(generatedImages);
      wx.showToast({ title: "商品图已生成", icon: "success" });
    }).catch((err) => {
      const messages = {
        IMAGE_API_KEY_EMPTY: "请先配置作图接口密钥",
        IMAGE_BALANCE_LOW: "作图账户余额不足，请充值后再试",
        IMAGE_UNAUTHORIZED: "作图密钥无效或已失效",
        AI_RATE_LIMITED: "平台当前作图请求较多，请稍后再试",
        EMPTY_IMAGE_RESPONSE: "接口未返回图片，请稍后再试",
        IMAGE_TASK_TIMEOUT: "图片生成时间较长，请稍后重新生成"
      };
      wx.showModal({
        title: "生成失败",
        content: messages[err.message] || err.detail || "图片接口暂时不可用，请稍后再试。",
        showCancel: false
      });
    }).finally(() => {
      this.setData({ generating: false, generationStage: "" });
    });
  },

  saveBase64Image(base64, index) {
    if (!base64 || !wx.getFileSystemManager) {
      return "";
    }
    const path = `${wx.env.USER_DATA_PATH}/commerce-${Date.now()}-${index}.png`;
    try {
      wx.getFileSystemManager().writeFileSync(path, base64, "base64");
      return path;
    } catch (err) {
      return "";
    }
  },

  previewResult(e) {
    const current = e.currentTarget.dataset.url;
    wx.previewImage({
      current,
      urls: this.data.generatedImages.map((item) => item.url)
    });
  },

  saveResult(e) {
    const url = e.currentTarget.dataset.url;
    const save = (filePath) => wx.saveImageToPhotosAlbum({
      filePath,
      success: () => wx.showToast({ title: "已保存到相册", icon: "success" }),
      fail: () => wx.showToast({ title: "保存失败，请检查相册权限", icon: "none" })
    });
    if (/^https?:\/\//.test(url)) {
      wx.downloadFile({
        url,
        success: (res) => save(res.tempFilePath),
        fail: () => wx.showToast({ title: "图片下载失败", icon: "none" })
      });
      return;
    }
    save(url);
  },

  clearResults() {
    this.setData({ generatedImages: [] });
  },

  showDrafts() {
    this.setData({ showDraftPanel: true });
  },

  closeDrafts() {
    this.setData({ showDraftPanel: false });
  },

  stopTap() {},

  loadDraft(e) {
    const id = Number(e.currentTarget.dataset.id);
    const draft = this.data.drafts.find((item) => item.id === id);
    if (!draft) {
      return;
    }
    const platform = draft.platform || "taobao";
    this.setData({
      activePlatform: platform,
      platformNote: PLATFORM_NOTES[platform],
      templates: TEMPLATE_PRESETS[platform],
      activeTemplate: draft.template || "",
      activeMode: draft.mode || "main",
      activeStyle: draft.style || "oriental",
      activeRatio: draft.ratio || "square",
      productName: draft.productName === "未命名商品" ? "" : (draft.productName || ""),
      sellingPoint: draft.sellingPoint || "",
      prompt: draft.prompt || "",
      referenceImage: draft.referenceImage || "",
      showDraftPanel: false
    });
    wx.showToast({ title: "草稿已恢复", icon: "success" });
  },

  deleteDraft(e) {
    const id = Number(e.currentTarget.dataset.id);
    const drafts = this.data.drafts.filter((item) => item.id !== id);
    wx.setStorageSync(DRAFT_KEY, drafts);
    this.setData({ drafts, draftCount: drafts.length });
  },

  openHistory(e) {
    const id = Number(e.currentTarget.dataset.id);
    const record = this.data.history.find((item) => item.id === id);
    if (record && Array.isArray(record.images)) {
      this.setData({ generatedImages: record.images });
      wx.pageScrollTo({ selector: ".result-section", duration: 300 });
    }
  }
});
