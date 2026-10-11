import { ImageResponse } from "next/og";

// the picture shown when the website is shared (WhatsApp, X, LinkedIn…)
export const alt = "ViPlay Studio: AI video editor for Reels, Shorts and YouTube";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "72px",
          background: "linear-gradient(135deg, #060111 0%, #1e1035 55%, #0e7490 100%)",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: -1, color: "#67e8f9" }}>ViPlay Studio</div>
        <div style={{ fontSize: 76, fontWeight: 900, lineHeight: 1.05, marginTop: 24, maxWidth: 1000 }}>
          Edit Reels, Shorts & YouTube videos with AI
        </div>
        <div style={{ fontSize: 32, marginTop: 28, color: "#cbd5e1", maxWidth: 1000 }}>
          Word-by-word captions in Hindi, Hinglish & English · Hindi ↔ English dubbing · every size in one export
        </div>
        <div style={{ display: "flex", marginTop: 40, fontSize: 28, fontWeight: 700 }}>
          <div style={{ background: "#9333ea", borderRadius: 999, padding: "12px 28px" }}>Start free</div>
        </div>
      </div>
    ),
    size,
  );
}
