"use client";

import { Check, Copy, Eye, EyeOff } from "lucide-react";
import { useState } from "react";

/** 토큰처럼 옆 사람에게 보이면 안 되는 값을 가려 두고, 필요할 때만 보이거나 복사한다. */
export function SecretField({ value, label }: { value: string; label: string }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="flex items-center gap-1 rounded-xl bg-surface-2 py-1 pl-3 pr-1">
      <code className="min-w-0 flex-1 truncate text-[13px] text-ink" aria-label={label}>
        {shown ? value : "•".repeat(Math.min(value.length, 24))}
      </code>
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        aria-label={shown ? `${label} 가리기` : `${label} 보기`}
        className="grid size-9 place-items-center rounded-lg text-ink-2 hover:bg-surface"
      >
        {shown ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
      </button>
      <CopyButton value={value} label={label} />
    </div>
  );
}

export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        } catch {
          setCopied(false);
        }
      }}
      aria-label={`${label} 복사`}
      className="grid size-9 place-items-center rounded-lg text-ink-2 hover:bg-surface"
    >
      {copied ? <Check className="size-4 text-good-ink" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      <span className="sr-only" aria-live="polite">
        {copied ? "복사했어요" : ""}
      </span>
    </button>
  );
}
