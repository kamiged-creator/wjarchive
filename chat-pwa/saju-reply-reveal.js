/* Preview-only: reveal a newly received advisor reply after the typing indicator. */
(() => {
  const style = document.createElement("style");
  style.textContent = `
    .reply-soft-enter{animation:replySoftBubble .2s ease-out both}
    .reply-soft-enter .reply-soft-part{opacity:0;animation:replySoftPart .24s ease-out forwards;animation-delay:var(--part-delay,0ms)}
    @keyframes replySoftBubble{from{opacity:.65;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
    @keyframes replySoftPart{to{opacity:1}}
    @media(prefers-reduced-motion:reduce){.reply-soft-enter,.reply-soft-enter .reply-soft-part{animation:none;opacity:1}}
  `;
  document.head.append(style);
  const feed = document.getElementById("messages");
  if (!feed) return;
  let pending = false;
  const reveal = row => {
    const bubble = row?.querySelector(".bubble");
    if (!bubble || bubble.classList.contains("reply-soft-enter")) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const message = bubble.textContent;
    if (!message) return;
    const parts = message.match(/[^.!?。！？\n]+[.!?。！？]*[ \t]*|\n/g) || [message];
    bubble.replaceChildren();
    bubble.classList.add("reply-soft-enter");
    bubble.setAttribute("aria-label", message);
    let delay = 0;
    for (const part of parts) {
      const span = document.createElement("span");
      span.className = "reply-soft-part";
      span.textContent = part;
      span.setAttribute("aria-hidden", "true");
      span.style.setProperty("--part-delay", delay + "ms");
      bubble.append(span);
      if (part.trim()) delay = Math.min(680, delay + Math.min(140, Math.max(70, part.length * 3)));
    }
  };
  const observer = new MutationObserver(records => {
    let sawTyping = false;
    let removedTyping = false;
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType === 1 && node.matches?.(".typing-indicator")) sawTyping = true;
      }
      for (const node of record.removedNodes) {
        if (node.nodeType === 1 && node.matches?.(".typing-indicator")) removedTyping = true;
      }
    }
    if (sawTyping) pending = true;
    if (pending && removedTyping) {
      pending = false;
      const last = feed.lastElementChild;
      if (last?.matches(".message.bot:not(.typing-indicator)")) reveal(last);
    }
  });
  observer.observe(feed, {childList:true});
})();