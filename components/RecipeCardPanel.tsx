"use client";

// Preview, share and download for a recipe card. Used on a saved brew (My brews)
// and straight under a freshly built custom schedule. The card is drawn as an
// SVG, so what is shown here is exactly what gets exported.

import { useRef, useState } from "react";

import RecipeCard from "@/components/RecipeCard";
import { cardPngBlob, triggerDownload } from "@/lib/labelImage";
import {
  CARD_H,
  CARD_W,
  layoutRecipeCard,
  recipeToText,
  type RecipeCardData,
} from "@/lib/recipeCard";
import { safeFileName } from "@/lib/calendar";

const buttonClass =
  "rounded-lg border border-border-strong bg-field px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-foreground transition hover:border-accent hover:text-accent focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-50";

export default function RecipeCardPanel({ data }: { data: RecipeCardData }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const frameRef = useRef<HTMLDivElement>(null);

  const fileName = `${safeFileName(data.name)}-recipe.png`;
  const truncated = open ? layoutRecipeCard(data).truncated : false;

  async function makePng(): Promise<Blob | null> {
    const svg = frameRef.current?.querySelector("svg");

    if (!svg) {
      return null;
    }

    // Twice the drawing size: sharp on a phone screen, small enough to send.
    return cardPngBlob(svg, CARD_W * 2, CARD_H * 2);
  }

  async function handleDownload() {
    setBusy(true);
    setMessage("");

    try {
      const blob = await makePng();

      if (blob) {
        triggerDownload(blob, fileName);
        setMessage("Image saved. Look in your downloads.");
      }
    } catch {
      setMessage("Could not make the image in this browser.");
    } finally {
      setBusy(false);
    }
  }

  // One button for "send this somewhere". On a phone the share sheet lists
  // Facebook, Messages, WhatsApp and so on, and takes the image together with
  // the recipe text. Where files cannot be shared it sends the text alone, and
  // where nothing can be shared it copies the text.
  async function handleShare() {
    setBusy(true);
    setMessage("");

    const title = `${data.name} recipe`;
    const text = recipeToText(data);

    try {
      const blob = await makePng();

      if (blob && typeof navigator.canShare === "function") {
        const file = new File([blob], fileName, { type: "image/png" });

        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title, text });
          return;
        }
      }

      if (typeof navigator.share === "function") {
        await navigator.share({ title, text });
        return;
      }

      await navigator.clipboard.writeText(text);
      setMessage("Recipe copied. Paste it into a post or message, or use Download image.");
    } catch (error) {
      // Closing the share sheet is not a failure.
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setMessage("Could not share from this browser. Try Copy text or Download image.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy() {
    setMessage("");

    try {
      await navigator.clipboard.writeText(recipeToText(data));
      setMessage("Recipe copied. Paste it anywhere.");
    } catch {
      setMessage("Could not copy from this browser.");
    }
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={buttonClass}
      >
        {open ? "Hide recipe card" : "Recipe card"}
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          <div
            ref={frameRef}
            className="mx-auto w-full max-w-sm overflow-hidden rounded-xl border border-border bg-white shadow-card"
            style={{ aspectRatio: `${CARD_W} / ${CARD_H}` }}
          >
            <RecipeCard data={data} />
          </div>

          {truncated && (
            <p className="text-xs leading-5 text-muted">
              This recipe is long, so the card shows the first part. The full
              text stays in My brews.
            </p>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleShare}
              disabled={busy}
              className="rounded-xl bg-accent px-5 py-3 text-sm font-bold uppercase tracking-[0.14em] text-white transition hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-50"
            >
              Share
            </button>
            <button type="button" onClick={handleCopy} className={buttonClass}>
              Copy text
            </button>
            <button type="button" onClick={handleDownload} disabled={busy} className={buttonClass}>
              Download image
            </button>
          </div>

          <p aria-live="polite" className="text-xs leading-5 text-stage-brew">
            {message}
          </p>
        </div>
      )}
    </div>
  );
}
