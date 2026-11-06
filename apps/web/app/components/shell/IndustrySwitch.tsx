import { PROFILE } from "@aihot/industry/profile";

/** A full document navigation loads the other industry's bundle and independent reader state. */
export function IndustrySwitch({ compact = false }: { compact?: boolean }) {
  if (!PROFILE.basePath) return null;
  return (
    <nav aria-label="行业切换" className={`flex shrink-0 gap-1 rounded-full border border-line bg-bg-sunk p-1 text-[12px] ${compact ? "mb-2 flex-col" : ""}`}>
      {([{ id: "ai", label: "AI" }, { id: "medical", label: "医疗" }] as const).map(industry => (
        <a key={industry.id} href={`/${industry.id}`} aria-current={PROFILE.id === industry.id ? "page" : undefined}
          className={`flex-1 whitespace-nowrap rounded-full ${compact ? "px-2" : "px-3"} py-1.5 text-center font-medium ${PROFILE.id === industry.id ? "bg-surface text-ink shadow-sm" : "text-ink-3 hover:text-ink"}`}>
          {industry.label}
        </a>
      ))}
    </nav>
  );
}
