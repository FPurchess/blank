import { path, textContent } from "./state";

export const bootUI = () => {
  const uiTop = document.querySelector<HTMLDivElement>("#ui-top")!;
  path.subscribe(
    (path) => {
      uiTop.innerHTML = "&raquo; " + (path || "Untitled");
    },
    { immediate: true }
  );

  const uiBottom = document.querySelector<HTMLDivElement>("#ui-bottom")!;
  textContent.subscribe(
    (content) => {
      const charCount = content.length;
      const wordCount = content.length ? content.split(/\s/).length : 0;
      uiBottom.innerHTML = `${wordCount} words ${charCount} chars`;
    },
    { immediate: true }
  );
};
