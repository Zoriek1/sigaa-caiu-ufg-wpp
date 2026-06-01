"use client";

import { useTheme } from "@/lib/ThemeContext";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isSigaa = theme === "sigaa";

  return (
    <button
      onClick={toggleTheme}
      aria-label="Trocar tema"
      className={`fixed top-4 right-4 z-50 flex items-center gap-2 pl-2.5 pr-3.5 h-9 rounded-full border cursor-pointer transition-all duration-300 ${
        isSigaa
          ? "bg-[#1A3B6C] text-white border-[#B0C4DE] shadow-md hover:bg-[#28549C]"
          : "bg-white text-neutral-800 border-neutral-200 shadow-sm hover:bg-neutral-50"
      }`}
      style={{ minWidth: "10rem" }}
    >
      {/* Emoji — rola junto com o texto */}
      <span className="relative h-5 w-5 flex-shrink-0 overflow-hidden">
        <span
          className="absolute inset-0 flex items-center justify-center text-sm transition-transform duration-300 ease-in-out"
          style={{ transform: isSigaa ? "translateY(-110%)" : "translateY(0%)" }}
        >
          ✨
        </span>
        <span
          className="absolute inset-0 flex items-center justify-center text-sm transition-transform duration-300 ease-in-out"
          style={{ transform: isSigaa ? "translateY(0%)" : "translateY(110%)" }}
        >
          🎓
        </span>
      </span>

      {/* Texto em rolo */}
      <span className="relative h-4 flex-1 overflow-hidden">
        <span
          className="absolute inset-0 flex items-center text-xs font-medium tracking-wide transition-transform duration-300 ease-in-out"
          style={{ transform: isSigaa ? "translateY(-110%)" : "translateY(0%)" }}
        >
          Tema Moderno
        </span>
        <span
          className="absolute inset-0 flex items-center text-xs font-medium tracking-wide transition-transform duration-300 ease-in-out"
          style={{ transform: isSigaa ? "translateY(0%)" : "translateY(110%)" }}
        >
          Tema SIGAA
        </span>
      </span>
    </button>
  );
}
