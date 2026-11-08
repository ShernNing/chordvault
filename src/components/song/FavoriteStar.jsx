import { Star } from "lucide-react";

/**
 * Star toggle for favouriting a song. Safe inside a <Link> card: it stops the
 * click from navigating.
 */
export default function FavoriteStar({ active, onToggle, className = "" }) {
  const handleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onToggle?.();
  };
  return (
    <button
      type='button'
      onClick={handleClick}
      aria-pressed={active}
      aria-label={active ? "Remove from favourites" : "Add to favourites"}
      title={active ? "Remove from favourites" : "Add to favourites"}
      className={`w-6 h-6 rounded flex items-center justify-center transition-colors duration-150 hover:bg-[var(--color-bg-warm)]
        ${active ? "text-[var(--color-accent-text)]" : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"}
        ${className}`}
    >
      <Star size={13} fill={active ? "currentColor" : "none"} />
    </button>
  );
}
