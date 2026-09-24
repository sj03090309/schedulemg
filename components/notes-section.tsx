import { Pin, Square } from "lucide-react";
import { loadMac } from "@/lib/dashboard-data";
import { formatRelative } from "@/lib/time";
import { Empty, Notice, Section } from "./ui";

/** 맥 메모 앱의 고정 메모, 체크리스트가 남은 메모, 최근 메모 (읽기 전용) */
export async function NotesSection({ demo }: { demo: boolean }) {
  const mac = await loadMac(demo);
  const now = new Date();

  if (!mac?.notes) {
    return (
      <Section id="notes" title="맥 메모">
        <Notice
          message="맥 에이전트가 메모 앱의 고정 메모, 체크리스트, 최근 메모를 보내면 여기에 나와요."
          action={{ href: "/settings#agent", label: "에이전트 연결 방법" }}
        />
      </Section>
    );
  }
  if (!mac.notes.available) {
    return (
      <Section id="notes" title="맥 메모">
        <Notice tone="error" message={mac.notes.error ?? "메모를 읽지 못했어요."} />
      </Section>
    );
  }

  const items = mac.notes.items;
  return (
    <Section
      id="notes"
      title="맥 메모"
      count={items.length}
      aside={<span className="text-[13px] text-ink-3">{formatRelative(new Date(mac.collectedAt), now)} 동기화</span>}
    >
      {items.length === 0 ? (
        <Empty>최근 7일 동안 고친 메모가 없어요.</Empty>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((n) => (
            <li key={n.id} className="py-3">
              <p className="flex items-center gap-1.5 text-[15px] font-medium leading-snug text-ink">
                {n.pinned && <Pin className="size-3.5 shrink-0 text-warning-ink" aria-label="고정한 메모" />}
                <span className="min-w-0 break-words">{n.title}</span>
              </p>
              <p className="mt-0.5 flex flex-wrap gap-x-2.5 text-[12px] text-ink-3">
                {n.folder && <span>{n.folder}</span>}
                {n.modifiedAt && <span>{formatRelative(new Date(n.modifiedAt), now)} 고침</span>}
                {n.openItems.length > 0 && <span className="font-medium text-ink-2">남은 항목 {n.openItems.length}개</span>}
              </p>
              {n.openItems.length > 0 ? (
                <ul className="mt-1.5 space-y-1">
                  {n.openItems.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-[14px] leading-snug text-ink-2">
                      <Square className="mt-[3px] size-3.5 shrink-0 text-ink-3" aria-hidden />
                      <span className="min-w-0 break-words">{item}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                n.snippet && <p className="mt-1 line-clamp-2 text-[14px] leading-relaxed text-ink-2">{n.snippet}</p>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 px-1 text-[12px] text-ink-3">맥 메모 앱에서 고치거나 체크하면 몇 초 안에 여기에도 반영돼요.</p>
    </Section>
  );
}
