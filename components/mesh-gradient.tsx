import { cn } from "@/lib/cn";

/*
  The brand's only decorative system: one multi-stop mesh built from the three
  gradient pairs (develop / preview / ship). Treated as a single object — the
  stops are never reordered, cropped to one colour, or rendered at icon scale.

  Painted as percentage-sized radial stops on one element so it scales fluidly
  with its container and never tiles.
*/

const MESH = [
  "radial-gradient(42% 62% at 14% 34%, var(--color-gradient-develop-start) 0%, transparent 70%)",
  "radial-gradient(38% 56% at 32% 68%, var(--color-gradient-develop-end) 0%, transparent 70%)",
  "radial-gradient(44% 64% at 48% 22%, var(--color-gradient-preview-start) 0%, transparent 70%)",
  "radial-gradient(40% 58% at 66% 62%, var(--color-gradient-preview-end) 0%, transparent 70%)",
  "radial-gradient(36% 54% at 84% 28%, var(--color-gradient-ship-start) 0%, transparent 70%)",
  "radial-gradient(38% 56% at 96% 66%, var(--color-gradient-ship-end) 0%, transparent 70%)",
].join(", ");

const FADE = "radial-gradient(68% 62% at 50% 24%, #000 0%, transparent 100%)";

export function MeshGradient({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
    >
      <div
        className="absolute -inset-x-[12%] -top-[35%] h-[135%] opacity-40 blur-[80px]"
        style={{
          backgroundImage: MESH,
          backgroundRepeat: "no-repeat",
          maskImage: FADE,
          WebkitMaskImage: FADE,
        }}
      />
    </div>
  );
}
