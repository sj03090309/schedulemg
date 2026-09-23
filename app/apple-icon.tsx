import { ImageResponse } from "next/og";
import { IconArt } from "@/lib/icon-art";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// iOS는 아이콘 모서리를 스스로 둥글게 깎으므로 사각형으로 그린다.
export default function AppleIcon() {
  return new ImageResponse(<IconArt size={180} rounded={false} />, size);
}
