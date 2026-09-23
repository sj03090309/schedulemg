import type { MetadataRoute } from "next";

// 휴대폰 홈 화면에 추가하면 앱처럼 전체 화면으로 열린다.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "오늘 브리핑",
    short_name: "오늘",
    description: "일정, 메일, 과제, 기억할 알림, AI 사용량을 한 화면에서",
    lang: "ko",
    start_url: "/",
    display: "standalone",
    background_color: "#eef1f0",
    theme_color: "#eef1f0",
    icons: [
      { src: "/icon/192", sizes: "192x192", type: "image/png" },
      { src: "/icon/512", sizes: "512x512", type: "image/png" },
      { src: "/icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
