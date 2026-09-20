const agents = window.AGENT_CARDS || [];

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

const state = { category: "all", query: "", platform: "taobao", mode: "main", ratio: "square", style: "oriental", selectedAgent: null };
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
    const inCategory = state.category === "all" ||
      (state.category === "main" && agent.badge === "主模式") ||
      agent.category === state.category;
    const q = state.query.trim().toLowerCase();
    return inCategory && (!q || `${agent.name}${agent.desc}`.toLowerCase().includes(q));
  });
  $("#agentGrid").innerHTML = filtered.map(agent => `
    <button class="agent-card" type="button" data-agent="${agent.id}">
      <div class="agent-cover"><img src="./assets/card-cover-guochao-bag-atelier.jpg" alt=""><strong>${agent.cover.replaceAll("\n", "<br>")}</strong></div>
      <h3>${agent.name}</h3><p>${agent.desc}</p>${agent.badge ? `<span class="card-badge">${agent.badge}</span>` : ""}
    </button>`).join("");
  $("#emptyState").hidden = filtered.length > 0;
  $$(".agent-card").forEach(card => card.addEventListener("click", () => openAgent(card.dataset.agent)));
}

const agentStarters = {
  "战略": ["帮我梳理目前最重要的三个决策", "如何找到品牌差异化定位？", "帮我制定未来30天行动重点"],
  "增长": ["帮我找三个低成本增长机会", "如何设计一次增长实验？", "分析我的内容为什么没有流量"],
  "运营": ["帮我制定一周运营计划", "如何提高老客户复购？", "帮我拆解项目交付流程"],
  "成交": ["帮我优化产品成交话术", "客户说太贵了该怎么回应？", "如何提升咨询到下单转化率？"]
};

function conversationKey() {
  return `agent-chat-${state.selectedAgent?.name || "default"}`;
}

function readMessages() {
  try { return JSON.parse(localStorage.getItem(conversationKey()) || "[]"); } catch { return []; }
}

function writeMessages(messages) {
  localStorage.setItem(conversationKey(), JSON.stringify(messages.slice(-30)));
  const conversations = JSON.parse(localStorage.getItem("agent-conversations") || "{}");
  conversations[state.selectedAgent.name] = { time: new Date().toLocaleString("zh-CN"), preview: messages.at(-1)?.text || "" };
  localStorage.setItem("agent-conversations", JSON.stringify(conversations));
}

function escapeHtml(value) {
  const node = document.createElement("div");
  node.textContent = value;
  return node.innerHTML;
}

function renderMessages() {
  const list = $("#messageList");
  const messages = readMessages();
  if (!messages.length) {
    list.innerHTML = `<div class="welcome-message"><b>你好，我是${state.selectedAgent.name}</b><p>${state.selectedAgent.desc} 说说你现在最想解决的问题，我会帮你拆成清晰的行动建议。</p></div>`;
  } else {
    list.innerHTML = messages.map(item => `<div class="message ${item.role}"><span>${item.role === "user" ? "你" : state.selectedAgent.name}</span><p>${escapeHtml(item.text)}</p></div>`).join("");
  }
  list.scrollTop = list.scrollHeight;
}

function openAgent(name) {
  state.selectedAgent = agents.find(agent => agent.id === name || agent.name === name) || agents[0];
  sessionStorage.setItem("selected-agent", state.selectedAgent.id);
  $("#agentCoverText").innerHTML = state.selectedAgent.cover.replaceAll("\n", "<br>");
  $("#agentCategory").textContent = state.selectedAgent.category;
  $("#agentTitle").textContent = state.selectedAgent.name;
  $("#chatAgentName").textContent = state.selectedAgent.name;
  $("#agentDescription").textContent = state.selectedAgent.desc;
  const starters = [state.selectedAgent.sample].concat(agentStarters[state.selectedAgent.category]).filter(Boolean).slice(0, 3);
  $("#starterPrompts").innerHTML = starters.map(text => `<button type="button">${text}</button>`).join("");
  $$("button", $("#starterPrompts")).forEach(button => button.addEventListener("click", () => sendMessage(button.textContent)));
  renderMessages();
  location.hash = "agent";
}

function createLocalReply(question) {
  const agent = state.selectedAgent;
  const categoryAdvice = {
    "战略": "先明确目标与边界，再比较可选路径。建议你今天完成：1. 写下一句核心目标；2. 列出三个不做事项；3. 选择一个可在7天内验证的动作。",
    "增长": "先找到转化漏斗中损失最大的一环。建议选一个指标作为本周唯一目标，设计一个变量清晰的小实验，并在7天后按数据决定保留或停止。",
    "运营": "把工作拆成内容、用户和复盘三条线。先确定本周节奏与负责人，每天记录关键数据，周末只复盘有效动作和阻塞点。",
    "成交": "先确认客户真正顾虑的是价格、信任还是适配度。用提问定位顾虑，再用具体使用场景、证据和低门槛下一步推动决定。"
  };
  return `关于“${question.slice(0, 45)}”，${agent.name}的建议是：${categoryAdvice[agent.category]}\n\n下一步：把你的产品、目标客户和当前难点再告诉我，我可以继续帮你细化。`;
}

function sendMessage(text) {
  const question = text.trim();
  if (!question || !state.selectedAgent) return;
  const messages = readMessages();
  messages.push({ role: "user", text: question }, { role: "assistant", text: createLocalReply(question) });
  writeMessages(messages);
  renderMessages();
  $("#chatInput").value = "";
}

function route() {
  const id = location.hash.slice(1) || "home";
  const valid = ["home", "agent", "studio", "recent"].includes(id) ? id : "home";
  if (valid === "agent" && !state.selectedAgent) {
    const savedId = sessionStorage.getItem("selected-agent");
    state.selectedAgent = agents.find(agent => agent.id === savedId) || agents[0];
    openAgent(state.selectedAgent.id);
  }
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
  const conversations = Object.entries(JSON.parse(localStorage.getItem("agent-conversations") || "{}"));
  const items = conversations.map(([name, item]) => `<button class="recent-item conversation-item" data-conversation="${name}"><img src="./assets/card-cover-guochao-bag-atelier.jpg" alt=""><div><h3>${name}</h3><p>智能体对话 · ${item.time}</p></div></button>`).join("") + drafts.map(item => `
    <div class="recent-item"><img src="./assets/card-cover-guochao-bag-atelier.jpg" alt=""><div><h3>${item.name}</h3><p>${item.platform === "taobao" ? "淘宝" : "抖音电商"} · ${item.time}</p></div></div>`).join("");
  $("#recentList").innerHTML = items || '<div class="empty-state">还没有项目，请先体验智能体或保存设计草稿。</div>';
  $$("[data-conversation]").forEach(button => button.addEventListener("click", () => openAgent(button.dataset.conversation)));
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
$("#agentBack").addEventListener("click", () => { location.hash = "home"; });
$("#chatForm").addEventListener("submit", event => {
  event.preventDefault();
  sendMessage($("#chatInput").value);
});
$("#clearChat").addEventListener("click", () => {
  localStorage.removeItem(conversationKey());
  renderMessages();
  showToast("对话已清空");
});

$("#draftCount").textContent = readDrafts().length;
renderAgents();
renderTemplates();
updatePreview();
route();
