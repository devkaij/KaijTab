/**
 * KaijTab service worker。
 * 设计约束：常驻逻辑为零。只处理安装初始化与版本迁移触发。
 */
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    console.info("[KaijTab] installed");
  }
});
