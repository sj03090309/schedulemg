"use client";

import { Square, Volume2 } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";

const noop = () => () => {};

/** 브라우저 음성 합성으로 브리핑을 읽어 준다. 지원하지 않는 브라우저에서는 버튼을 숨긴다. */
export function SpeakButton({ text }: { text: string }) {
  // 요즘 브라우저는 거의 다 지원하므로 서버에서는 버튼을 그려 두고, 지원하지 않으면 그때 숨긴다.
  const supported = useSyncExternalStore(
    noop,
    () => "speechSynthesis" in window,
    () => true,
  );
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  if (!supported) return null;

  const toggle = () => {
    const synth = window.speechSynthesis;
    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ko-KR";
    utterance.rate = 1.03;
    const voice = synth.getVoices().find((v) => v.lang?.toLowerCase().startsWith("ko"));
    if (voice) utterance.voice = voice;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    synth.cancel();
    synth.speak(utterance);
    setSpeaking(true);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={speaking}
      className="inline-flex shrink-0 items-center gap-2 self-start rounded-full bg-hero-ink px-4 py-2.5 text-[14px] font-semibold text-[var(--sky-bottom)] hover:opacity-90"
    >
      {speaking ? <Square className="size-4" aria-hidden /> : <Volume2 className="size-4" aria-hidden />}
      <span>{speaking ? "그만 듣기" : "브리핑 듣기"}</span>
    </button>
  );
}
