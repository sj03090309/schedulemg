import { Pin } from "lucide-react";
import { loadMac } from "@/lib/dashboard-data";
import { DAY, formatRelative } from "@/lib/time";
import { Section } from "./ui";

const MAX = 5;

/** 맥 메모 앱: 고정한 메모, 체크리스트가 남은 메모, 이틀 안에 고친 메모만 한 줄씩 */
export async function NotesSection({ demo }: { demo: boolean }) {
  const mac = await loadMac(demo);
  if (!mac?.notes?.available) return null;
  const now = new Date();
  const items = mac.notes.items
    .filter((n) => n.pinned || n.openItems.length > 0 || (n.modifiedAt && now.getTime() - Date.parse(n.modifiedAt) < 2 * DAY))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || (b.modifiedAt ?? "").localeCompare(a.modifiedAt ?? ""))
    .slice(0, MAX);
  if (!items.length) return null;

  return (
    <Section
      id="notes"
      title="맥 메모"
      aside={<span className="text-[13px] text-ink-3">{formatRelative(new Date(mac.collectedAt), now)} 동기화</span>}
    >
      <ul className="divide-y divide-line rounded-[20px] bg-surface px-4 sm:px-5">
        {items.map((n) => (
          <li key={n.id} className="py-3">
            <p className="flex items-center gap-1.5 text-[15px] font-medium leading-snug text-ink">
              {n.pinned && <Pin className="size-3.5 shrink-0 text-warning-ink" aria-label="고정한 메모" />}
              <span className="min-w-0 truncate">{n.title}</span>
              {n.openItems.length > 0 && (
                <span className="shrink-0 text-[12px] font-medium text-ink-3">남은 항목 {n.openItems.length}</span>
              )}
            </p>
            {(n.openItems.length > 0 || n.snippet) && (
              <p className="mt-0.5 line-clamp-1 text-[13px] text-ink-2">
                {n.openItems.length > 0 ? n.openItems.join(" · ") : n.snippet}
              </p>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}
