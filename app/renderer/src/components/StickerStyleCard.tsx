import { StickerOverlay } from "./StickerOverlay";
import type { StickerStyleConfig } from "../lib/sticker-styles";

type Props = {
  style: StickerStyleConfig;
  selected: boolean;
  previewText: string;
  onSelect: () => void;
};

export function StickerStyleCard({ style, selected, previewText, onSelect }: Props) {
  return (
    <button
      className={`style-card ${selected ? "selected" : ""}`}
      type="button"
      onClick={onSelect}
      title={style.tag}
    >
      <div className="style-card-preview">
        <StickerOverlay text={previewText || "示例"} styleId={style.id} variant="card" />
      </div>
      <div className="style-card-meta">
        <strong>{style.name}</strong>
        <span className={`style-tag style-tag-${style.category}`}>{style.tag}</span>
      </div>
    </button>
  );
}
