export type ApplicationWorkspaceTab = {
  id: string;
  name: string;
  href: string;
};

const PREFIX = "qc-field-workspace:";
export const WORKSPACE_EVENT = "qc-field-workspace-change";

function key(userId: string) {
  return `${PREFIX}${userId}`;
}

export function readWorkspace(userId: string): ApplicationWorkspaceTab[] {
  if (typeof window === "undefined" || !userId) return [];
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(key(userId)) || "[]");
    return Array.isArray(parsed)
      ? parsed.filter((item) => item?.id && item?.name && item?.href).slice(0, 12)
      : [];
  } catch {
    return [];
  }
}

function writeWorkspace(userId: string, tabs: ApplicationWorkspaceTab[]) {
  if (typeof window === "undefined" || !userId) return;
  window.sessionStorage.setItem(key(userId), JSON.stringify(tabs.slice(0, 12)));
  window.dispatchEvent(new CustomEvent(WORKSPACE_EVENT));
}

export function upsertWorkspaceTab(userId: string, tab: ApplicationWorkspaceTab) {
  const current = readWorkspace(userId);
  writeWorkspace(userId, [tab, ...current.filter((item) => item.id !== tab.id)]);
}

export function removeWorkspaceTab(userId: string, id: string) {
  writeWorkspace(userId, readWorkspace(userId).filter((item) => item.id !== id));
}

export function clearWorkspace(userId: string) {
  if (typeof window === "undefined" || !userId) return;
  window.sessionStorage.removeItem(key(userId));
  window.dispatchEvent(new CustomEvent(WORKSPACE_EVENT));
}

export function clearAllWorkspaces() {
  if (typeof window === "undefined") return;
  for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
    const storageKey = window.sessionStorage.key(index);
    if (storageKey?.startsWith(PREFIX)) window.sessionStorage.removeItem(storageKey);
  }
  window.dispatchEvent(new CustomEvent(WORKSPACE_EVENT));
}
