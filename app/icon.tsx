import { ImageResponse } from "next/og";
import { IconArt } from "@/lib/icon-art";

// /icon/32 (파비콘), /icon/192, /icon/512 (홈 화면 앱 아이콘)
const SIZES = [32, 192, 512];

export function generateImageMetadata() {
  return SIZES.map((s) => ({ id: String(s), size: { width: s, height: s }, contentType: "image/png" }));
}

export default async function Icon({ id }: { id: Promise<string | number> }) {
  const size = Number(await id) || 192;
  return new ImageResponse(<IconArt size={size} rounded={size <= 64} />, { width: size, height: size });
}
