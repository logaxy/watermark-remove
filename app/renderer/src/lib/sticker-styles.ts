import type { CSSProperties } from "react";

export type StickerCategory = "block" | "overlay";

export interface StickerStyleConfig {
  id: string;
  name: string;
  category: StickerCategory;
  tag: string;
  background: string | null;
  backgroundGradient?: [string, string];
  fontColor: string;
  borderColor?: string;
  shadowColor?: string;
  opacity: number;
  borderRadius: number;
  borderWidth: number;
  fontWeight: number;
  shape: "rect" | "cloud" | "pill";
}

export const STICKER_STYLES: StickerStyleConfig[] = [
  {
    id: "solid-white",
    name: "纯白遮挡",
    category: "block",
    tag: "不透明",
    background: "#ffffff",
    fontColor: "#1d2433",
    opacity: 1,
    borderRadius: 4,
    borderWidth: 0,
    fontWeight: 600,
    shape: "rect"
  },
  {
    id: "solid-black",
    name: "纯黑遮挡",
    category: "block",
    tag: "不透明",
    background: "#111827",
    fontColor: "#ffffff",
    opacity: 1,
    borderRadius: 4,
    borderWidth: 0,
    fontWeight: 600,
    shape: "rect"
  },
  {
    id: "promo-red",
    name: "促销爆款",
    category: "block",
    tag: "不透明",
    background: "#e11d48",
    fontColor: "#ffffff",
    opacity: 1,
    borderRadius: 6,
    borderWidth: 0,
    fontWeight: 700,
    shape: "pill"
  },
  {
    id: "promo-orange",
    name: "限时特惠",
    category: "block",
    tag: "不透明",
    background: null,
    backgroundGradient: ["#f97316", "#ea580c"],
    fontColor: "#ffffff",
    opacity: 1,
    borderRadius: 8,
    borderWidth: 0,
    fontWeight: 700,
    shape: "pill"
  },
  {
    id: "business-navy",
    name: "商务深蓝",
    category: "block",
    tag: "不透明",
    background: "#1e3a5f",
    fontColor: "#f8fafc",
    opacity: 1,
    borderRadius: 4,
    borderWidth: 0,
    fontWeight: 600,
    shape: "rect"
  },
  {
    id: "business-silver",
    name: "商务银灰",
    category: "block",
    tag: "不透明",
    background: "#e2e8f0",
    fontColor: "#334155",
    borderColor: "#94a3b8",
    opacity: 1,
    borderRadius: 4,
    borderWidth: 2,
    fontWeight: 600,
    shape: "rect"
  },
  {
    id: "cloud-cute",
    name: "云朵可爱",
    category: "block",
    tag: "不透明",
    background: "#f0f9ff",
    fontColor: "#0369a1",
    borderColor: "#bae6fd",
    opacity: 1,
    borderRadius: 24,
    borderWidth: 2,
    fontWeight: 700,
    shape: "cloud"
  },
  {
    id: "candy-pink",
    name: "甜美粉糖",
    category: "block",
    tag: "不透明",
    background: "#fce7f3",
    fontColor: "#be185d",
    opacity: 1,
    borderRadius: 16,
    borderWidth: 0,
    fontWeight: 700,
    shape: "pill"
  },
  {
    id: "fresh-mint",
    name: "清新薄荷",
    category: "block",
    tag: "不透明",
    background: "#6ee7b7",
    fontColor: "#064e3b",
    opacity: 1,
    borderRadius: 8,
    borderWidth: 0,
    fontWeight: 700,
    shape: "rect"
  },
  {
    id: "ocean-block",
    name: "海洋蓝",
    category: "block",
    tag: "不透明",
    background: "#1769aa",
    fontColor: "#ffffff",
    opacity: 1,
    borderRadius: 6,
    borderWidth: 0,
    fontWeight: 600,
    shape: "rect"
  },
  {
    id: "classic",
    name: "经典半透明",
    category: "overlay",
    tag: "半透明",
    background: "#000000",
    fontColor: "#ffffff",
    opacity: 0.72,
    borderRadius: 6,
    borderWidth: 0,
    fontWeight: 600,
    shape: "rect"
  },
  {
    id: "variety",
    name: "综艺描边",
    category: "overlay",
    tag: "透明底",
    background: null,
    fontColor: "#ffdc00",
    shadowColor: "#000000",
    opacity: 1,
    borderRadius: 0,
    borderWidth: 0,
    fontWeight: 800,
    shape: "rect"
  },
  {
    id: "subtitle",
    name: "透明字幕",
    category: "overlay",
    tag: "透明底",
    background: null,
    fontColor: "#ffffff",
    shadowColor: "#000000",
    opacity: 1,
    borderRadius: 0,
    borderWidth: 0,
    fontWeight: 600,
    shape: "rect"
  },
  {
    id: "warning",
    name: "警示红字",
    category: "overlay",
    tag: "透明底",
    background: null,
    fontColor: "#dc2626",
    opacity: 1,
    borderRadius: 0,
    borderWidth: 0,
    fontWeight: 700,
    shape: "rect"
  }
];

const styleMap = new Map(STICKER_STYLES.map((style) => [style.id, style]));

export function getStickerStyle(styleId: string): StickerStyleConfig {
  return styleMap.get(styleId) ?? STICKER_STYLES[0];
}

export function stickerPreviewCss(style: StickerStyleConfig): CSSProperties {
  const backgroundImage = style.backgroundGradient
    ? `linear-gradient(135deg, ${style.backgroundGradient[0]}, ${style.backgroundGradient[1]})`
    : undefined;

  const backgroundColor =
    style.background && !style.backgroundGradient
      ? hexToRgba(style.background, style.opacity)
      : style.backgroundGradient
        ? undefined
        : "transparent";

  const textShadow = style.shadowColor
    ? `2px 2px 0 ${style.shadowColor}, -1px -1px 0 ${style.shadowColor}, 1px -1px 0 ${style.shadowColor}, -1px 1px 0 ${style.shadowColor}`
    : undefined;

  const borderRadius =
    style.shape === "pill" ? 9999 : style.shape === "cloud" ? `${style.borderRadius}px` : `${style.borderRadius}px`;

  return {
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "4px 8px",
    boxSizing: "border-box",
    backgroundColor,
    backgroundImage,
    color: style.fontColor,
    fontWeight: style.fontWeight,
    fontSize: "inherit",
    lineHeight: 1.2,
    textAlign: "center",
    wordBreak: "break-all",
    border:
      style.borderWidth > 0 && style.borderColor
        ? `${style.borderWidth}px solid ${style.borderColor}`
        : undefined,
    borderRadius,
    textShadow,
    overflow: "hidden"
  };
}

function hexToRgba(hex: string, opacity: number): string {
  const value = hex.replace("#", "");
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}
