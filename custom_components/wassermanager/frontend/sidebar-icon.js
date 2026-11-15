(() => {
  // Monochrome version of the brand. Home Assistant supplies the color.
  const path = [
    "M48 146 124 83q7-6 14 0l30 25V91q0-8 8-8h13q9 0 9 8v41l23 19q9 8 2 17-7 8-16 1l-4-4v51q0 20-20 20H80q-20 0-20-20v-51l-3 3q-9 7-16-1-7-9 7-21Z",
    "M137 117q-6-8-12 0c-8 11-25 28-25 44a31 31 0 1 0 62 0c0-16-17-33-25-44Z",
    "M111 208v8h40v-8Z",
    "M29 106q24-24 51-9l-8 13q-17-9-33 7Z",
    "M24 87q24-24 54-12l-5 14q-21-8-39 9Z",
    "M38 60q24-16 49-3l-7 14q-17-9-33 3Z",
  ].join(" ");

  async function getIcon(name) {
    return name === "meter" ? { path, viewBox: "0 0 256 256" } : undefined;
  }

  window.customIcons ??= {};
  window.customIcons.wassermanager = { getIcon };
  window.customIconsets ??= {};
  window.customIconsets.wassermanager = getIcon;
})();
