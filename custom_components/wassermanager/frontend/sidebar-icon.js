(() => {
  // A water drop above a three-digit meter display.
  const path = [
    "M12 1C10 4 8 6 8 8.5a4 4 0 0 0 8 0C16 6 14 4 12 1Z",
    "M4 14h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2Zm0 2v4h16v-4Z",
    "M6 17h2v2H6Zm5 0h2v2h-2Zm5 0h2v2h-2Z",
  ].join(" ");

  async function getIcon(name) {
    return name === "meter" ? { path, viewBox: "0 0 24 24" } : undefined;
  }

  window.customIcons ??= {};
  window.customIcons.wassermanager = { getIcon };
  window.customIconsets ??= {};
  window.customIconsets.wassermanager = getIcon;
})();
