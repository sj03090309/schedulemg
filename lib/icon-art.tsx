// 앱 아이콘: 새벽 하늘 위로 떠오르는 해. next/og ImageResponse(JSX → PNG)로 그린다.
export function IconArt({ size, rounded = true }: { size: number; rounded?: boolean }) {
  const sun = Math.round(size * 0.46);
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-end",
        background: "linear-gradient(180deg, #f6d8c4 0%, #cfe2fa 100%)",
        borderRadius: rounded ? size * 0.22 : 0,
        paddingBottom: size * 0.2,
      }}
    >
      <div
        style={{
          width: sun,
          height: sun / 2,
          background: "#e8950f",
          borderTopLeftRadius: sun,
          borderTopRightRadius: sun,
        }}
      />
      <div style={{ width: size * 0.68, height: Math.max(2, size * 0.055), background: "#17202b", borderRadius: size }} />
      <div
        style={{
          width: size * 0.4,
          height: Math.max(2, size * 0.055),
          background: "#17202b",
          opacity: 0.35,
          borderRadius: size,
          marginTop: size * 0.07,
        }}
      />
    </div>
  );
}
