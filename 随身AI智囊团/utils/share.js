const APP_TITLE = "\u968f\u8eabAI\u519b\u5e08\u56e2";
const APP_SLOGAN = "\u7528AI\u628a\u7ecf\u8425\u95ee\u9898\u62c6\u6210\u53ef\u6267\u884c\u65b9\u6848";
const SHARE_IMAGE = "/assets/app-logo.png";

function enablePageShare() {
  if (!wx || !wx.showShareMenu) {
    return;
  }
  const showMenu = () => {
    wx.showShareMenu({
      withShareTicket: true,
      menus: ["shareAppMessage", "shareTimeline"],
      fail() {
        wx.showShareMenu({
          withShareTicket: true
        });
      }
    });
  };
  showMenu();
  if (typeof setTimeout === "function") {
    setTimeout(showMenu, 0);
    setTimeout(showMenu, 300);
  }
}

function buildShareOptions(options = {}) {
  return {
    title: options.title || APP_TITLE,
    path: options.path || "/pages/index/index",
    imageUrl: options.imageUrl || SHARE_IMAGE
  };
}

function buildTimelineOptions(options = {}) {
  return {
    title: options.title || APP_TITLE,
    query: options.query || "",
    imageUrl: options.imageUrl || SHARE_IMAGE
  };
}

module.exports = {
  APP_TITLE,
  APP_SLOGAN,
  SHARE_IMAGE,
  enablePageShare,
  buildShareOptions,
  buildTimelineOptions
};
