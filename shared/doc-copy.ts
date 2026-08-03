// Adds a copy button to every command block on the guide pages.
const RESET_DELAY = 1600;

function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);

  // Fallback for browsers without the async clipboard API, and for insecure
  // origins where it is not exposed at all.
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.top = "0";
  field.style.opacity = "0";
  document.body.append(field);
  field.select();
  const copied = document.execCommand("copy");
  field.remove();
  return copied ? Promise.resolve() : Promise.reject(new Error("copy rejected"));
}

for (const block of document.querySelectorAll<HTMLPreElement>(".doc pre")) {
  const wrapper = document.createElement("div");
  wrapper.className = "doc-code";
  block.replaceWith(wrapper);
  wrapper.append(block);

  const button = document.createElement("button");
  button.type = "button";
  button.className = "doc-copy";
  button.textContent = "Copy";
  button.setAttribute("aria-label", "Copy this command to the clipboard");
  // The label doubles as the result message, so announce it when it changes.
  button.setAttribute("aria-live", "polite");

  // The button sits in its own bar above the code: a long command line that
  // overflows the scroll box would otherwise run underneath an overlaid button.
  const bar = document.createElement("div");
  bar.className = "doc-code-bar";
  bar.append(button);
  wrapper.prepend(bar);

  let reset = 0;
  button.addEventListener("click", async () => {
    const source = block.querySelector("code") ?? block;
    try {
      await copyText((source.textContent ?? "").replace(/\n+$/, ""));
      button.textContent = "Copied";
      button.classList.add("is-copied");
    } catch {
      button.textContent = "Copy failed";
    }
    window.clearTimeout(reset);
    reset = window.setTimeout(() => {
      button.textContent = "Copy";
      button.classList.remove("is-copied");
    }, RESET_DELAY);
  });
}
