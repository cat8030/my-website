const agents = [
  { name: "创始人思维分身", cover: "创始人\n思维\n分身", category: "战略", desc: "把创始人的愿景、判断和取舍整理成可执行决策。" },
  { name: "愿景定位", cover: "愿景\n定位", category: "战略", desc: "把模糊想法整理成一句清晰、长期的品牌方向。" },
  { name: "商业策划军师", cover: "商业\n策划", category: "战略", desc: "梳理商业模式、增长路径与阶段重点。" },
  { name: "产品增长军师", cover: "产品\n增长", category: "增长", desc: "从用户价值到增长实验，找到下一步突破口。" },
  { name: "私域运营军师", cover: "私域\n运营", category: "运营", desc: "设计内容节奏、用户分层与复购动作。" },
  { name: "成交转化军师", cover: "成交\n转化", category: "成交", desc: "优化销售表达、异议处理和成交路径。" },
  { name: "IP流量军师", cover: "IP\n流量", category: "增长", desc: "规划选题、内容钩子与平台分发策略。" },
  { name: "项目交付军师", cover: "项目\n交付", category: "运营", desc: "拆解里程碑、责任边界和风险清单。" },
  { name: "AI产品搭建军师", cover: "AI\n搭建", category: "增长", desc: "把业务想法整理成可落地的 AI 产品方案。" }
];

const templates = {
  taobao: [
    { name: "搜索主图", meta: "1:1 · 高点击", mode: "main", ratio: "square", style: "studio", prompt: "纯净背景，商品占画面约 75%，突出轮廓、材质与五金细节。" },
    { name: "新品首发", meta: "3:4 · 上新", mode: "detail", ratio: "portrait", style: "launch", prompt: "新品首发氛围，精致陈列与高级灯光，留出标题安全区。" },
    { name: "东方详情", meta: "3:4 · 品牌感", mode: "detail", ratio: "portrait", style: "oriental", prompt: "东方器物与宋锦纹样轻量点缀，突出原创设计和材质故事。" }
  ],
  douyin: [
    { name: "信息流封面", meta: "9:16 · 强冲击", mode: "cover", ratio: "story", style: "launch", prompt: "竖版信息流封面，商品居中偏上，底部预留标题安全区。" },
    { name: "场景种草", meta: "9:16 · 生活感", mode: "cover", ratio: "story", style: "lifestyle", prompt: "真实生活方式场景，自然光，突出上身比例和日常搭配。" },
    { name: "直播主视觉", meta: "3:4 · 转化", mode: "main", ratio: "portrait", style: "studio", prompt: "直播间商品展示视觉，主体清晰，四周保留价格信息空间。" }
  ]
};

const state = { category: "all", query: "", platform: "taobao", mode: "main", ratio: "square", style: "oriental" };
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2200);
}

function renderAgents() {
  const filtered = agents.filter(agent => {
    const inCategory = state.category === "all" || agent.category === state.category;
    const q = state.query.trim().toLowerCase();
    return inCategory && (!q || `${agent.name}${agent.desc}`.toLowerCase().includes(q));
  });
  $("#agentGrid").innerHTML = filtered.map(agent => `
    <button class="agent-card" type="button" data-agent="${agent.name}">
      <div class="agent-cover"><img src="./assets/card-cover-guochao-bag-atelier.jpg" alt=""><strong>${agent.cover.replaceAll("\n", "<br>")}</strong></div>
      <h3>${agent.name}</h3><p>${agent.desc}</p>
    </button>`).join("");
  $("#emptyState").hidden = filtered.length > 0;
  $$(".agent-card").forEach(card => card.addEventListener("click", () => showToast(`${card.dataset.agent}：网页版对话接口待服务端接入`)));
}

function route() {
  const id = location.hash.slice(1) || "home";
  const valid = ["home", "studio", "recent"].includes(id) ? id : "home";
  $$(".view").forEach(view => view.classList.toggle("active", view.id === valid));
  $$('nav a').forEach(link => link.classList.toggle("active", link.dataset.route === valid));
  $("nav").classList.remove("open");
  $("#menuButton").setAttribute("aria-expanded", "false");
  if (valid === "recent") renderRecent();
  window.scrollTo(0, 0);
}

function setActive(group, key, value) {
  state[key] = value;
  $$(`button[data-${key}]`, group).forEach(button => button.classList.toggle("active", button.dataset[key] === value));
  updatePreview();
}

function renderTemplates() {
  const row = $("#templateRow");
  row.innerHTML = templates[state.platform].map((item, index) => `<button data-template="${index}"><b>${item.name}</b><small>${item.meta}</small></button>`).join("");
  $$('[data-template]', row).forEach(button => button.addEventListener("click", () => {
    $$('[data-template]', row).forEach(item => item.classList.remove("active"));
    button.classList.add("active");
    const item = templates[state.platform][Number(button.dataset.template)];
    setActive($("#modeControl"), "mode", item.mode);
    setActive($("#ratioControl"), "ratio", item.ratio);
    setActive($("#styleControl"), "style", item.style);
    $("#prompt").value = item.prompt;
    showToast(`已应用${item.name}模板`);
  }));
}

function updatePreview() {
  const platform = state.platform === "taobao" ? "淘宝" : "抖音电商";
  const modes = { main: "商品主图", detail: "详情视觉", cover: "短视频封面" };
  $("#previewPlatform").textContent = `${platform} · ${modes[state.mode]}`;
  $("#previewTitle").textContent = $("#productName").value.trim() || "原创东方女包";
  $("#previewSubtitle").textContent = $("#sellingPoint").value.trim() || "小众设计 · 精致材质";
  $("#previewCanvas").dataset.style = state.style;
}

function readDrafts() {
  try { return JSON.parse(localStorage.getItem("commerce-web-drafts") || "[]"); } catch { return []; }
}

function saveDraft() {
  const drafts = readDrafts();
  drafts.unshift({
    id: Date.now(),
    name: $("#productName").value.trim() || "未命名商品",
    platform: state.platform,
    mode: state.mode,
    style: state.style,
    ratio: state.ratio,
    sellingPoint: $("#sellingPoint").value,
    prompt: $("#prompt").value,
    time: new Date().toLocaleString("zh-CN")
  });
  localStorage.setItem("commerce-web-drafts", JSON.stringify(drafts.slice(0, 20)));
  $("#draftCount").textContent = readDrafts().length;
  showToast("草稿已保存在当前浏览器");
}

function renderRecent() {
  const drafts = readDrafts();
  $("#recentList").innerHTML = drafts.length ? drafts.map(item => `
    <div class="recent-item"><img src="./assets/card-cover-guochao-bag-atelier.jpg" alt=""><div><h3>${item.name}</h3><p>${item.platform === "taobao" ? "淘宝" : "抖音电商"} · ${item.time}</p></div></div>`).join("") : '<div class="empty-state">还没有项目，请先到电商设计台保存草稿。</div>';
}

window.addEventListener("hashchange", route);
$("#menuButton").addEventListener("click", () => {
  const nav = $("nav");
  nav.classList.toggle("open");
  $("#menuButton").setAttribute("aria-expanded", String(nav.classList.contains("open")));
});
$$("[data-open-studio]").forEach(button => button.addEventListener("click", () => { location.hash = "studio"; }));
$("#agentSearch").addEventListener("input", event => { state.query = event.target.value; renderAgents(); });
$("#resetSearch").addEventListener("click", () => { state.query = ""; $("#agentSearch").value = ""; renderAgents(); });
$$('[data-category]').forEach(button => button.addEventListener("click", () => {
  state.category = button.dataset.category;
  $$('[data-category]').forEach(item => item.classList.toggle("active", item === button));
  renderAgents();
}));
$$('[data-platform]').forEach(button => button.addEventListener("click", () => {
  setActive($("#platformControl"), "platform", button.dataset.platform);
  $("#platformNote").textContent = state.platform === "taobao" ? "淘宝：优先突出商品主体、材质细节与搜索点击率。" : "抖音电商：优先强化首屏冲击力、生活场景与竖版节奏。";
  renderTemplates();
}));
$$('[data-mode]').forEach(button => button.addEventListener("click", () => setActive($("#modeControl"), "mode", button.dataset.mode)));
$$('[data-style]').forEach(button => button.addEventListener("click", () => setActive($("#styleControl"), "style", button.dataset.style)));
$$('[data-ratio]').forEach(button => button.addEventListener("click", () => setActive($("#ratioControl"), "ratio", button.dataset.ratio)));
$("#productName").addEventListener("input", updatePreview);
$("#sellingPoint").addEventListener("input", updatePreview);
$("#generateButton").addEventListener("click", () => {
  updatePreview();
  showToast("静态预览已更新；在线生成需接入服务端密钥代理");
});
$("#saveDraft").addEventListener("click", saveDraft);
$("#draftButton").addEventListener("click", () => { location.hash = "recent"; });
$("#downloadPreview").addEventListener("click", () => showToast("公开预览站暂不提供合成下载"));

$("#draftCount").textContent = readDrafts().length;
renderAgents();
renderTemplates();
updatePreview();
route();
