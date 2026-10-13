/* eslint-disable @next/next/no-img-element -- static brand art; next/image adds nothing here */
export function MajaLogo({ size = "lg" }: { size?: "lg" | "sm" }) {
  return (
    <div className="flex items-end gap-2">
      <img src="/maja-wordmark.png" alt="Maja" className={size === "lg" ? "h-10 w-auto" : "h-7 w-auto"} />
      {size === "lg" ? (
        <span className="pb-1 font-mono text-xs uppercase tracking-widest text-lilac">CMS</span>
      ) : null}
    </div>
  );
}
