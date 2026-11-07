import { create } from 'zustand';

interface UiStore {
  mobileNavOpen: boolean;
  setMobileNav: (open: boolean) => void;
}

export const useUi = create<UiStore>((set) => ({
  mobileNavOpen: false,
  setMobileNav: (open) => set({ mobileNavOpen: open }),
}));
