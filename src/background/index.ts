/**
 * KaijTab service worker。
 * 设计约束：常驻逻辑为零。只处理安装初始化、版本迁移触发，以及工具栏按钮（安卓入口）。
 */
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    console.info("[KaijTab] installed");
  }
});

/**
 * 工具栏按钮：打开 KaijTab 页面。
 * 安卓版 Edge 上 `newtab` 覆盖不生效，这是手机/平板上打开 KaijTab 的主要入口。
 */
chrome.action?.onClicked.addListener(() => {
  void chrome.tabs.create({ url: chrome.runtime.getURL("main.html") });
});
