"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * 5분마다, 그리고 휴대폰·노트북을 다시 켜서 이 탭으로 돌아올 때 서버 데이터를 새로 받는다.
 * 아침에 밤새 열어 둔 탭을 봐도 오늘 기준으로 다시 그려진다.
 */
export function AutoRefresh({ intervalMs = 5 * 60_000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    let last = Date.now();
    const run = () => {
      last = Date.now();
      router.refresh();
    };
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") run();
    }, intervalMs);
    const onReturn = () => {
      if (document.visibilityState === "visible" && Date.now() - last > 60_000) run();
    };
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("focus", onReturn);
    window.addEventListener("online", onReturn);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("focus", onReturn);
      window.removeEventListener("online", onReturn);
    };
  }, [router, intervalMs]);
  return null;
}
