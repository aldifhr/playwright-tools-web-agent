"use client";

import { create } from "zustand";
import { Session, Settings, defaultSettings } from "./store";

type AppState = {
  settings: Settings;
  sessions: Session[];
  activeId: string | null;
  setSettings: (settings: Settings) => void;
  setSessions: (sessions: Session[] | ((previous: Session[]) => Session[])) => void;
  setActiveId: (activeId: string | null) => void;
};

export const useAppStore = create<AppState>((set) => ({
  settings: defaultSettings(),
  sessions: [],
  activeId: null,
  setSettings: (settings) => set({ settings }),
  setSessions: (sessions) =>
    set((state) => ({
      sessions: typeof sessions === "function" ? sessions(state.sessions) : sessions,
    })),
  setActiveId: (activeId) => set({ activeId }),
}));
