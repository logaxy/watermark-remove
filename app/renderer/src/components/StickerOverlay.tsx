import { getStickerStyle, stickerPreviewCss } from "../lib/sticker-styles";

type Props = {
  text: string;
  styleId: string;
  variant?: "canvas" | "card";
};

export function StickerOverlay({ text, styleId, variant = "canvas" }: Props) {
  const style = getStickerStyle(styleId);
  const label = text.trim() || "贴纸预览";
  const css = stickerPreviewCss(style);

  if (style.shape === "cloud") {
    return (
      <div className={`sticker-overlay sticker-overlay-${variant} sticker-cloud`}>
        <div className="sticker-cloud-bubble sticker-cloud-bubble-left" />
        <div className="sticker-cloud-bubble sticker-cloud-bubble-center" />
        <div className="sticker-cloud-bubble sticker-cloud-bubble-right" />
        <span className="sticker-cloud-text" style={{ color: style.fontColor, fontWeight: style.fontWeight }}>
          {label}
        </span>
      </div>
    );
  }

  return (
    <div className={`sticker-overlay sticker-overlay-${variant}`} style={css}>
      {label}
    </div>
  );
}
