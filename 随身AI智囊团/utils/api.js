const { buildAgentReply } = require("./agents");

let AI_SECRET = {};
try {
  AI_SECRET = require("../config/ai-secret");
} catch (err) {
  AI_SECRET = {};
}

const API_CONFIG = {
  // Keep this empty in the teaching package. Students can use their own backend URL.
  baseUrl: "",
  chatPath: "/api/chat",
  timeout: 120000
};

const AI_CONFIG = {
  baseUrl: "https://xjjuhe.site/v1",
  chatPath: "/chat/completions",
  defaultModel: "gpt-5.6-sol",
  defaultTemperature: 0.7
};

const AUTH_TOKEN_KEY = "authToken";
const LEGACY_TOKEN_KEY = "token";
const AUTH_USER_KEY = "authUser";

function getApiBase() {
  return wx.getStorageSync("apiBaseUrl") || API_CONFIG.baseUrl;
}

function getAuthToken() {
  return wx.getStorageSync(AUTH_TOKEN_KEY) || wx.getStorageSync(LEGACY_TOKEN_KEY) || "";
}

function getStoredUser() {
  const user = wx.getStorageSync(AUTH_USER_KEY);
  return user && typeof user === "object" ? user : null;
}

function saveAuthSession(data) {
  const token = data && data.token;
  const user = data && data.user;
  if (token) {
    wx.setStorageSync(AUTH_TOKEN_KEY, token);
    wx.removeStorageSync(LEGACY_TOKEN_KEY);
  }
  if (user && typeof user === "object") {
    wx.setStorageSync(AUTH_USER_KEY, user);
  }
  return user || null;
}

function clearAuthSession() {
  wx.removeStorageSync(AUTH_TOKEN_KEY);
  wx.removeStorageSync(LEGACY_TOKEN_KEY);
  wx.removeStorageSync(AUTH_USER_KEY);
}

function localAgentReply(agent, message, moduleTitle) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        content: buildAgentReply(agent, message, moduleTitle),
        source: "local"
      });
    }, 450);
  });
}

function cleanBaseUrl(baseUrl) {
  return (baseUrl || "").trim().replace(/\/+$/, "");
}

function isFilledConfigValue(value) {
  const text = (value || "").trim();
  return Boolean(text && !text.includes("填写") && !text.includes("YOUR_") && !text.includes("REPLACE_"));
}

function getAiConfig() {
  const secret = AI_SECRET || {};
  const baseUrl = cleanBaseUrl(wx.getStorageSync("aiApiBaseUrl") || secret.baseUrl || AI_CONFIG.baseUrl);
  const apiKey = (wx.getStorageSync("aiApiKey") || secret.apiKey || "").trim();
  const model = (wx.getStorageSync("aiModel") || secret.model || AI_CONFIG.defaultModel).trim();
  const temperature = Number(secret.temperature);

  return {
    baseUrl,
    apiKey,
    model,
    temperature: Number.isFinite(temperature) ? temperature : AI_CONFIG.defaultTemperature
  };
}

function buildChatCompletionUrl(baseUrl) {
  if (/\/chat\/completions\/?$/.test(baseUrl)) {
    return baseUrl;
  }
  return `${baseUrl}${AI_CONFIG.chatPath}`;
}

function getImageConfig() {
  const secret = AI_SECRET || {};
  return {
    baseUrl: cleanBaseUrl(secret.baseUrl || AI_CONFIG.baseUrl),
    apiKey: (secret.imageApiKey || secret.apiKey || "").trim(),
    model: (secret.imageModel || "gpt-image-2.5").trim()
  };
}

function parseGeneratedImages(data) {
  if (!data) {
    return [];
  }
  const result = data.result || data.output || {};
  const items = Array.isArray(data.data) ? data.data :
    (Array.isArray(data.images) ? data.images :
      (Array.isArray(result.data) ? result.data :
        (Array.isArray(result.images) ? result.images :
          ((data.url || data.b64_json) ? [data] :
            ((result.url || result.b64_json) ? [result] : [])))));
  return items.map((item) => ({
    url: item.url || "",
    b64Json: item.b64_json || "",
    revisedPrompt: item.revised_prompt || ""
  })).filter((item) => item.url || item.b64Json);
}

function buildImageError(statusCode, data) {
  const detail = getUpstreamErrorMessage(data) || (data && data.error) || "";
  if (/余额|balance|insufficient/i.test(detail)) {
    return new Error("IMAGE_BALANCE_LOW");
  }
  if (/请求较多|稍后重试|busy|overload|rate/i.test(detail) || statusCode === 429) {
    return new Error("AI_RATE_LIMITED");
  }
  if (statusCode === 401 || statusCode === 403) {
    return new Error("IMAGE_UNAUTHORIZED");
  }
  const err = new Error(statusCode ? `IMAGE_UPSTREAM_${statusCode}` : "IMAGE_GENERATION_FAILED");
  err.detail = typeof detail === "string" ? detail : "";
  return err;
}

function emitImageProgress(onProgress, payload) {
  if (typeof onProgress !== "function") {
    return;
  }
  try {
    onProgress(payload);
  } catch (err) {
    // Progress updates must not interrupt the generation request.
  }
}

function pollImageTask(config, taskId, attempt = 0, onProgress) {
  const maxAttempts = 30;
  if (attempt >= maxAttempts) {
    return Promise.reject(new Error("IMAGE_TASK_TIMEOUT"));
  }
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      wx.request({
        url: `${config.baseUrl}/images/generations/${encodeURIComponent(taskId)}`,
        method: "GET",
        header: {
          Authorization: `Bearer ${config.apiKey}`
        },
        timeout: API_CONFIG.timeout,
        success(res) {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(buildImageError(res.statusCode, res.data));
            return;
          }
          const images = parseGeneratedImages(res.data);
          if (images.length) {
            emitImageProgress(onProgress, { status: "completed", progress: 100, taskId });
            resolve({ images, raw: res.data });
            return;
          }
          const status = String((res.data && res.data.status) || "").toLowerCase();
          emitImageProgress(onProgress, {
            status: status || "processing",
            progress: Number((res.data && res.data.progress) || 0),
            taskId
          });
          if (["failed", "error", "cancelled", "canceled"].includes(status)) {
            reject(buildImageError(0, res.data));
            return;
          }
          if (["completed", "complete", "succeeded", "success"].includes(status)) {
            reject(new Error("EMPTY_IMAGE_RESPONSE"));
            return;
          }
          pollImageTask(config, taskId, attempt + 1, onProgress).then(resolve, reject);
        },
        fail(err) {
          reject(err);
        }
      });
    }, 2000);
  });
}

function requestImageGeneration({ prompt, size = "1024x1024", count = 1, onProgress }) {
  const config = getImageConfig();
  if (!config.baseUrl) {
    return Promise.reject(new Error("AI_API_BASE_EMPTY"));
  }
  if (!isFilledConfigValue(config.apiKey)) {
    return Promise.reject(new Error("IMAGE_API_KEY_EMPTY"));
  }

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${config.baseUrl}/images/generations`,
      method: "POST",
      data: {
        model: config.model,
        prompt,
        n: Math.max(1, Math.min(Number(count) || 1, 4)),
        size
      },
      header: {
        "Content-Type": "application/json;charset=UTF-8",
        Authorization: `Bearer ${config.apiKey}`
      },
      timeout: API_CONFIG.timeout,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const images = parseGeneratedImages(res.data);
          if (images.length) {
            emitImageProgress(onProgress, { status: "completed", progress: 100, taskId: "" });
            resolve({ images, raw: res.data });
            return;
          }
          const taskId = res.data && (res.data.task_id || res.data.id);
          const status = String((res.data && res.data.status) || "").toLowerCase();
          if (taskId && ["queued", "pending", "running", "processing", "submitted"].includes(status)) {
            emitImageProgress(onProgress, {
              status,
              progress: Number(res.data.progress || 0),
              taskId
            });
            pollImageTask(config, taskId, 0, onProgress).then(resolve, reject);
            return;
          }
          if (["failed", "error", "cancelled", "canceled"].includes(status)) {
            reject(buildImageError(0, res.data));
            return;
          }
          reject(new Error("EMPTY_IMAGE_RESPONSE"));
          return;
        }
        reject(buildImageError(res.statusCode, res.data));
      },
      fail(err) {
        reject(err);
      }
    });
  });
}

function stringifyMessageContent(content) {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content.map((item) => {
      if (typeof item === "string") {
        return item;
      }
      if (item && typeof item.text === "string") {
        return item.text;
      }
      if (item && item.type === "text" && typeof item.content === "string") {
        return item.content;
      }
      return "";
    }).filter(Boolean).join("\n");
  }
  return content == null ? "" : String(content);
}

function buildAttachmentContext(attachments) {
  if (!Array.isArray(attachments) || !attachments.length) {
    return "";
  }
  const lines = attachments.map((item, index) => {
    const label = item.type === "image" ? "图片" : "文件";
    const parts = [
      `${index + 1}. ${label}：${item.name || "未命名"}`
    ];
    if (item.textPreview) {
      parts.push(`内容摘录：${item.textPreview}`);
    }
    if (item.visionWarning) {
      parts.push(`图片提示：${item.visionWarning}`);
    }
    if (item.textExtractWarning) {
      parts.push(`文件提示：${item.textExtractWarning}`);
    }
    return parts.join("\n");
  });
  return [
    "用户同时提供了以下附件信息，可结合内容回答：",
    lines.join("\n")
  ].join("\n");
}

function buildSystemPrompt(agent, moduleTitle) {
  const framework = Array.isArray(agent.framework) && agent.framework.length
    ? agent.framework.map((item, index) => `${index + 1}. ${item}`).join("\n")
    : "";
  return [
    "你是微信小程序「随身AI军师团」里的专业智能体，请全程使用中文回答。",
    `当前智能体：${agent.name || ""}`,
    agent.parentName ? `所属智能体组：${agent.parentName}` : "",
    moduleTitle ? `当前功能模块：${moduleTitle}` : "",
    agent.intro ? `智能体介绍：${agent.intro}` : "",
    agent.guide ? `使用指引：${agent.guide}` : "",
    framework ? `建议输出框架：\n${framework}` : "",
    agent.sample ? `示例问题：${agent.sample}` : "",
    "回答要求：直接解决用户问题；结构清晰；给出可执行建议；不要编造不存在的事实；信息不足时先说明假设，再给出可落地的下一步。"
  ].filter(Boolean).join("\n\n");
}

function normalizeChatHistory(history, currentContent) {
  const source = Array.isArray(history) ? history : [];
  const messages = source.map((item) => {
    const role = item && item.role === "assistant" ? "assistant" : "user";
    const content = stringifyMessageContent(item && item.content).trim();
    return {
      role,
      content
    };
  }).filter((item) => item.content);

  const last = messages[messages.length - 1];
  if (!last || last.role !== "user" || last.content !== currentContent) {
    messages.push({
      role: "user",
      content: currentContent
    });
  } else {
    last.content = currentContent;
  }

  return messages.slice(-16);
}

function buildAiMessages({ agent, message, moduleTitle, history, attachments }) {
  const attachmentContext = buildAttachmentContext(attachments);
  const currentContent = [message, attachmentContext].filter(Boolean).join("\n\n");
  return [{
    role: "system",
    content: buildSystemPrompt(agent, moduleTitle)
  }].concat(normalizeChatHistory(history, currentContent));
}

function getUpstreamErrorMessage(data) {
  if (!data) {
    return "";
  }
  if (data.error && data.error.message) {
    return data.error.message;
  }
  return data.message || data.msg || "";
}

function extractChoiceContent(message) {
  if (!message) {
    return "";
  }
  if (typeof message === "string") {
    return message;
  }
  if (typeof message.content === "string") {
    return message.content;
  }
  if (Array.isArray(message.content)) {
    return message.content.map((item) => {
      if (typeof item === "string") {
        return item;
      }
      return (item && (item.text || item.content)) || "";
    }).filter(Boolean).join("\n");
  }
  return "";
}

function parseChatCompletion(data) {
  if (typeof data === "string") {
    return data;
  }
  if (!data) {
    return "";
  }
  if (data.output_text) {
    return data.output_text;
  }
  if (data.content || data.reply || data.message) {
    return data.content || data.reply || data.message;
  }
  const choice = data.choices && data.choices[0];
  if (choice) {
    return extractChoiceContent(choice.message) || extractChoiceContent(choice.delta) || choice.text || "";
  }
  return "";
}

function requestAiChatCompletion({ agent, message, moduleTitle, history = [], attachments = [] }) {
  const config = getAiConfig();
  if (!config.baseUrl) {
    return Promise.reject(new Error("AI_API_BASE_EMPTY"));
  }
  if (!isFilledConfigValue(config.apiKey)) {
    return Promise.reject(new Error("AI_API_KEY_EMPTY"));
  }
  if (!isFilledConfigValue(config.model)) {
    return Promise.reject(new Error("AI_MODEL_EMPTY"));
  }

  return new Promise((resolve, reject) => {
    wx.request({
      url: buildChatCompletionUrl(config.baseUrl),
      method: "POST",
      data: {
        model: config.model,
        messages: buildAiMessages({
          agent,
          message,
          moduleTitle,
          history,
          attachments
        }),
        temperature: config.temperature,
        stream: false
      },
      header: {
        "Content-Type": "application/json;charset=UTF-8",
        Authorization: `Bearer ${config.apiKey}`
      },
      timeout: API_CONFIG.timeout,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const content = parseChatCompletion(res.data).trim();
          if (!content) {
            reject(new Error("EMPTY_MODEL_RESPONSE"));
            return;
          }
          resolve({
            content,
            source: "ai",
            raw: res.data
          });
          return;
        }
        if (res.statusCode === 401 || res.statusCode === 403) {
          reject(new Error("AI_UNAUTHORIZED"));
          return;
        }
        if (res.statusCode === 429) {
          reject(new Error("AI_RATE_LIMITED"));
          return;
        }
        const upstreamMessage = getUpstreamErrorMessage(res.data);
        const err = new Error(`UPSTREAM_${res.statusCode}`);
        err.detail = upstreamMessage;
        reject(err);
      },
      fail(err) {
        reject(err);
      }
    });
  });
}

function request({ url, method = "GET", data = {}, header = {} }) {
  const baseUrl = getApiBase();
  if (!baseUrl) {
    return Promise.reject(new Error("API_BASE_EMPTY"));
  }

  const token = getAuthToken();
  const headers = {
    "Content-Type": "application/json;charset=UTF-8",
    ...header
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${baseUrl}${url}`,
      method,
      data,
      header: headers,
      timeout: API_CONFIG.timeout,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data && Object.prototype.hasOwnProperty.call(res.data, "data") ? res.data.data : res.data);
          return;
        }
        if (res.statusCode === 401) {
          clearAuthSession();
          reject(new Error("UNAUTHORIZED"));
          return;
        }
        reject(new Error((res.data && res.data.message) || "REQUEST_FAILED"));
      },
      fail(err) {
        reject(err);
      }
    });
  });
}

function uploadAttachment(attachment) {
  const baseUrl = getApiBase();
  if (!baseUrl) {
    return Promise.reject(new Error("API_BASE_EMPTY"));
  }
  if (!wx.uploadFile) {
    return Promise.reject(new Error("UPLOAD_NOT_SUPPORTED"));
  }

  const token = getAuthToken();
  const header = {};
  if (token) {
    header.Authorization = `Bearer ${token}`;
  }

  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${baseUrl}/api/upload`,
      filePath: attachment.path,
      name: "file",
      formData: {
        type: attachment.type,
        name: attachment.name
      },
      header,
      timeout: API_CONFIG.timeout,
      success(res) {
        let body = {};
        try {
          body = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
        } catch (err) {
          reject(new Error("UPLOAD_INVALID_RESPONSE"));
          return;
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(body && Object.prototype.hasOwnProperty.call(body, "data") ? body.data : body);
          return;
        }
        reject(new Error((body && body.message) || "UPLOAD_FAILED"));
      },
      fail(err) {
        reject(err);
      }
    });
  });
}

function getWechatLoginCode() {
  return new Promise((resolve, reject) => {
    if (!wx.login) {
      reject(new Error("WX_LOGIN_NOT_SUPPORTED"));
      return;
    }
    wx.login({
      success(res) {
        if (res.code) {
          resolve(res.code);
          return;
        }
        reject(new Error("WX_LOGIN_CODE_EMPTY"));
      },
      fail(err) {
        reject(err);
      }
    });
  });
}

function loginWithWechat(profile = {}) {
  return getWechatLoginCode()
    .then((code) => request({
      url: "/api/login/wechat",
      method: "POST",
      data: {
        code,
        profile
      }
    }))
    .then((data) => {
      saveAuthSession(data);
      return data;
    });
}

function loginWithPhoneNumber(phoneCode, profile = {}) {
  return getWechatLoginCode()
    .then((code) => request({
      url: "/api/login/phone",
      method: "POST",
      data: {
        code,
        phoneCode,
        profile
      }
    }))
    .then((data) => {
      saveAuthSession(data);
      return data;
    });
}

function loginWithDevPhoneNumber(profile = {}) {
  return getWechatLoginCode()
    .then((code) => request({
      url: "/api/login/phone",
      method: "POST",
      data: {
        code,
        phoneCode: "dev-phone-code",
        profile
      }
    }))
    .then((data) => {
      saveAuthSession(data);
      return data;
    });
}

function fetchCurrentUser() {
  return request({
    url: "/api/me"
  }).then((data) => {
    if (data && data.user) {
      saveAuthSession({
        user: data.user
      });
      return data.user;
    }
    return null;
  });
}

function fetchAuthConfig() {
  return request({
    url: "/api/auth/config"
  }).then((data) => data || {
    mode: "dev",
    canUseWechatPhoneNumber: false,
    devPhoneLabel: "开发测试号"
  });
}

function fetchPlans() {
  return request({
    url: "/api/plans"
  }).then((data) => data || {
    plans: [],
    currentPlan: null
  });
}

function fetchSupport() {
  return request({
    url: "/api/support"
  }).then((data) => data.support || null);
}

function redeemCreditCode(code) {
  return request({
    url: "/api/redeem",
    method: "POST",
    data: {
      code
    }
  }).then((data) => {
    if (data && data.user) {
      saveAuthSession({
        user: data.user
      });
    }
    return data;
  });
}

function logout() {
  return request({
    url: "/api/logout",
    method: "POST"
  }).catch(() => null).then(() => {
    clearAuthSession();
  });
}

function fetchAgents() {
  return request({
    url: "/api/agents"
  }).then((data) => data.agents || []);
}

function fetchRemoteRecent() {
  return request({
    url: "/api/recent"
  }).then((data) => data.recent || []);
}

function syncRemoteRecent(recent) {
  return request({
    url: "/api/recent",
    method: "PUT",
    data: {
      recent
    }
  }).then((data) => data.recent || []);
}

function fetchRemoteFavoriteIds() {
  return request({
    url: "/api/favorites"
  }).then((data) => data.favoriteAgentIds || []);
}

function syncRemoteFavoriteIds(favoriteAgentIds) {
  return request({
    url: "/api/favorites",
    method: "PUT",
    data: {
      favoriteAgentIds
    }
  }).then((data) => data.favoriteAgentIds || []);
}

function fetchAgentDetail(id) {
  return request({
    url: `/api/agents/${encodeURIComponent(id)}`
  }).then((data) => data.agent || null);
}

function fetchAdminAgents() {
  return request({
    url: "/api/admin/agents"
  }).then((data) => data.agents || []);
}

function fetchAdminUsers() {
  return request({
    url: "/api/admin/users"
  }).then((data) => data || {
    users: [],
    plans: []
  });
}

function updateAdminUserPlan(userId, planId) {
  return request({
    url: `/api/admin/users/${encodeURIComponent(userId)}`,
    method: "PATCH",
    data: {
      planId
    }
  }).then((data) => data);
}

function fetchAdminRedeemConfig() {
  return request({
    url: "/api/admin/redeem-codes/config"
  }).then((data) => data || {
    creditOptions: []
  });
}

function createAdminRedeemCode(credits, note = "") {
  return request({
    url: "/api/admin/redeem-codes",
    method: "POST",
    data: {
      credits,
      note
    }
  }).then((data) => data);
}

function fetchAdminRedeemCodes(code = "") {
  const query = code ? `?code=${encodeURIComponent(code)}` : "";
  return request({
    url: `/api/admin/redeem-codes${query}`
  }).then((data) => data || {
    records: []
  });
}

function destroyAdminRedeemCode(recordId) {
  return request({
    url: `/api/admin/redeem-codes/${encodeURIComponent(recordId)}`,
    method: "DELETE"
  }).then((data) => data || {
    records: []
  });
}

function fetchAdminSupport() {
  return request({
    url: "/api/admin/support"
  }).then((data) => data.support || null);
}

function updateAdminSupport(support) {
  return request({
    url: "/api/admin/support",
    method: "PATCH",
    data: {
      support
    }
  }).then((data) => data.support || null);
}

function createAdminAgent(agent) {
  return request({
    url: "/api/admin/agents",
    method: "POST",
    data: agent
  }).then((data) => data);
}

function updateAdminAgent(agentId, patch) {
  return request({
    url: `/api/admin/agents/${encodeURIComponent(agentId)}`,
    method: "PATCH",
    data: patch
  }).then((data) => data);
}

function hideAdminAgent(agentId) {
  return request({
    url: `/api/admin/agents/${encodeURIComponent(agentId)}`,
    method: "DELETE"
  }).then((data) => data);
}

function importAdminAgents(agents) {
  return request({
    url: "/api/admin/agents/import",
    method: "POST",
    data: {
      agents
    }
  }).then((data) => data.agents || []);
}

function resetAdminAgents() {
  return request({
    url: "/api/admin/agents/reset",
    method: "POST"
  }).then((data) => data.agents || []);
}

function deleteAttachment(serverId) {
  if (!serverId) {
    return Promise.resolve({
      deleted: false
    });
  }
  return request({
    url: `/api/upload/${encodeURIComponent(serverId)}`,
    method: "DELETE"
  });
}

function sendAgentMessage({ agent, message, moduleTitle, history = [], attachments = [] }) {
  const aiConfig = getAiConfig();
  if (aiConfig.baseUrl) {
    return requestAiChatCompletion({
      agent,
      message,
      moduleTitle,
      history,
      attachments
    });
  }

  if (!getApiBase()) {
    return localAgentReply(agent, message, moduleTitle);
  }

  return request({
    url: API_CONFIG.chatPath,
    method: "POST",
    data: {
      agentId: agent.id,
      agentName: agent.name,
      parentId: agent.parentId,
      parentName: agent.parentName,
      moduleTitle,
      message,
      messages: history,
      attachments,
      prompt: {
        intro: agent.intro,
        guide: agent.guide,
        framework: agent.framework,
        sample: agent.sample
      }
    }
  }).then((data) => {
    if (data && data.user) {
      saveAuthSession({
        user: data.user
      });
    }
    if (typeof data === "string") {
      return {
        content: data,
        source: "remote"
      };
    }
    return {
      content: data.content || data.reply || data.message || "",
      source: data.source || "remote",
      raw: data
    };
  }).catch((err) => {
    if (err.message === "API_BASE_EMPTY") {
      return localAgentReply(agent, message, moduleTitle);
    }
    throw err;
  });
}

function saveApiBaseUrl(baseUrl) {
  const cleanUrl = baseUrl.trim().replace(/\/$/, "");
  wx.setStorageSync("apiBaseUrl", cleanUrl);
  return cleanUrl;
}

function clearApiBaseUrl() {
  wx.removeStorageSync("apiBaseUrl");
}

function getRuntimeConfig() {
  const aiConfig = getAiConfig();
  return {
    baseUrl: getApiBase(),
    chatPath: API_CONFIG.chatPath,
    hasToken: Boolean(getAuthToken()),
    aiBaseUrl: aiConfig.baseUrl,
    aiModel: aiConfig.model,
    hasAiApiKey: isFilledConfigValue(aiConfig.apiKey)
  };
}

function getLegacySendAgentMessage({ agent, message, moduleTitle }) {
  if (!getApiBase()) {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          content: buildAgentReply(agent, message, moduleTitle)
        });
      }, 450);
    });
  }

  return sendAgentMessage({ agent, message, moduleTitle });
}

module.exports = {
  request,
  uploadAttachment,
  loginWithWechat,
  loginWithPhoneNumber,
  loginWithDevPhoneNumber,
  fetchCurrentUser,
  fetchAuthConfig,
  fetchPlans,
  fetchSupport,
  redeemCreditCode,
  logout,
  fetchAgents,
  fetchAgentDetail,
  fetchRemoteRecent,
  syncRemoteRecent,
  fetchRemoteFavoriteIds,
  syncRemoteFavoriteIds,
  fetchAdminUsers,
  updateAdminUserPlan,
  fetchAdminRedeemConfig,
  createAdminRedeemCode,
  fetchAdminRedeemCodes,
  destroyAdminRedeemCode,
  fetchAdminSupport,
  updateAdminSupport,
  fetchAdminAgents,
  createAdminAgent,
  updateAdminAgent,
  hideAdminAgent,
  importAdminAgents,
  resetAdminAgents,
  deleteAttachment,
  getStoredUser,
  saveAuthSession,
  clearAuthSession,
  sendAgentMessage,
  saveApiBaseUrl,
  clearApiBaseUrl,
  getRuntimeConfig,
  getLegacySendAgentMessage,
  requestImageGeneration
};
