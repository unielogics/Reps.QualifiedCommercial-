"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useMe } from "@/lib/useMe";
import {
  WORKSPACE_EVENT,
  clearAllWorkspaces,
  readWorkspace,
  removeWorkspaceTab,
  type ApplicationWorkspaceTab,
} from "@/lib/applicationWorkspace";

export default function ApplicationWorkspaceDock() {
  const router = useRouter();
  const pathname = usePathname();
  const { id: userId } = useMe();
  const { isSignedIn } = useAuth();
  const [tabs, setTabs] = useState<ApplicationWorkspaceTab[]>([]);

  const refresh = useCallback(() => {
    if (userId) setTabs(readWorkspace(userId));
  }, [userId]);

  useEffect(() => {
    refresh();
    window.addEventListener(WORKSPACE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(WORKSPACE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [refresh]);

  useEffect(() => {
    if (isSignedIn === false) clearAllWorkspaces();
  }, [isSignedIn]);

  if (!userId || !tabs.length) return null;
  return (
    <div className="workspaceDock" aria-label="Open applications">
      <div className="workspaceDockScroll">
        {tabs.map((tab) => {
          const active = pathname === `/applications/${tab.id}`;
          return (
            <div key={tab.id} className={`workspaceDockTab${active ? " active" : ""}`}>
              <button type="button" onClick={() => router.push(tab.href)} title={`Restore ${tab.name}`}>
                <span>{tab.name}</span>
              </button>
              <button
                type="button"
                className="workspaceDockClose"
                aria-label={`Close ${tab.name}`}
                title="Close tab"
                onClick={() => removeWorkspaceTab(userId, tab.id)}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
