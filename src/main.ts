import Alpine from "alpinejs";
import * as tocbot from "tocbot";
import "./css/animate.css";
import "./css/ball-atom.min.css";
import "./css/iconfont.css";
import "./css/obsidian.styl";
import "./css/theme.styl";
import "./js/Meting.min.js";
import "./js/jquery.js";
import "./js/jquery.truncate.js";
import "./js/obsidian.js";
import "./js/plugin.js";

window.Alpine = Alpine;

Alpine.start();
export function generateToc() {
  const content = document.getElementById("content");
  const titles = content?.querySelectorAll("h1, h2, h3, h4");
  console.log("titles", titles);
  if (!titles || titles.length === 0) {
    const tocContainer = document.querySelector(".t");
    tocContainer?.remove();
    return;
  }
  tocbot.init({
    tocSelector: ".toc",
    contentSelector: "#content",
    headingSelector: "h1, h2, h3, h4",
    linkClass: "toc-link",
    listItemClass: "toc-item",
    // @ts-ignore
    activeListItemClass: "active",
  });
}
