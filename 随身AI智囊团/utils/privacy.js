const DEFAULT_PRIVACY_NAME = "用户隐私保护指引";

function getPrivacySetting() {
  return new Promise((resolve) => {
    if (!wx.getPrivacySetting) {
      resolve({
        needAuthorization: false,
        privacyContractName: DEFAULT_PRIVACY_NAME
      });
      return;
    }

    wx.getPrivacySetting({
      success(res) {
        resolve({
          needAuthorization: Boolean(res.needAuthorization),
          privacyContractName: res.privacyContractName || DEFAULT_PRIVACY_NAME
        });
      },
      fail() {
        resolve({
          needAuthorization: false,
          privacyContractName: DEFAULT_PRIVACY_NAME
        });
      }
    });
  });
}

function openPrivacyContract() {
  if (!wx.openPrivacyContract) {
    wx.showToast({
      title: "当前微信版本不支持查看",
      icon: "none"
    });
    return;
  }

  wx.openPrivacyContract({
    fail() {
      wx.showToast({
        title: "暂时无法打开指引",
        icon: "none"
      });
    }
  });
}

module.exports = {
  DEFAULT_PRIVACY_NAME,
  getPrivacySetting,
  openPrivacyContract
};
