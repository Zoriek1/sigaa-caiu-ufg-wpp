"use client";

import { useTheme } from "@/lib/ThemeContext";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="fixed top-4 right-4 z-50 px-3 py-1.5 text-xs font-medium border rounded-md transition-colors shadow-sm bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50"
    >
      {theme === "default" ? "🎓 Modo SIGAA" : "✨ Modo Moderno"}
    </button>
  );
}
