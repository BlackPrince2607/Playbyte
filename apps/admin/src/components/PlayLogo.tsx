export function PlayLogo({ size = "lg" }: { size?: "lg" | "sm" }) {
  return (
    <div className="flex items-baseline gap-1">
      <span
        className={`font-display font-bold tracking-tight text-pink ${size === "lg" ? "text-4xl" : "text-2xl"}`}
      >
        PLAY
      </span>
      {size === "lg" ? (
        <span className="font-mono text-xs uppercase tracking-widest text-lilac">CMS</span>
      ) : null}
    </div>
  );
}
