"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

const INTERVAL = 15_000;

/**
 * 화면을 보고 있는 동안 15초마다 새 데이터가 들어왔는지(버전)만 확인하고,
 * 바뀌었을 때만 서버에서 화면을 새로 받아 온다. 맥 캘린더·메모·알림이 몇 초 안에 반영된다.
 */
export function LiveUpdates({ version }: { version: string }) {
  const router = useRouter();
  const current = useRef(version);

  useEffect(() => {
    current.current = version;
  }, [version]);

  useEffect(() => {
    let busy = false;
    const check = async () => {
      if (busy || document.visibilityState !== "visible") return;
      busy = true;
      try {
        const res = await fetch("/api/live", { cache: "no-store" });
        if (!res.ok) return;
        const { v } = (await res.json()) as { v: string | null };
        if (v && v !== current.current) {
          current.current = v;
          router.refresh();
        }
      } catch {
        // 네트워크가 잠깐 끊겨도 다음 차례에 다시 확인한다.
      } finally {
        busy = false;
      }
    };
    const timer = window.setInterval(check, INTERVAL);
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  return null;
}
