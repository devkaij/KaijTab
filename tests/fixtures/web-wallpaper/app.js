// 外链脚本：验证相对路径的 JS 资源能被虚拟文件服务正确提供
document.body.dataset.external = "yes";

// 相对路径 fetch：验证子资源请求也走虚拟文件服务
fetch("./data.json")
  .then((response) => response.json())
  .then((data) => {
    document.body.dataset.fetch = data.value;
  })
  .catch(() => {
    document.body.dataset.fetch = "failed";
  });
