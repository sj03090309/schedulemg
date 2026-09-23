"use client";

import { RefreshCw } from "lucide-react";
import { useFormStatus } from "react-dom";
import { refreshNowAction } from "@/app/actions";

function Inner() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label="지금 새로고침"
      className="grid size-10 place-items-center rounded-full text-ink-2 hover:bg-surface"
    >
      <RefreshCw className={`size-[18px] ${pending ? "animate-spin" : ""}`} aria-hidden />
    </button>
  );
}

export function RefreshButton() {
  return (
    <form action={refreshNowAction}>
      <Inner />
    </form>
  );
}
