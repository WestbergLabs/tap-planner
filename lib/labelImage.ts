/**
 * Export a rendered LabelCard as a downloadable image file.
 *
 * The card is already one self-contained 400x600 SVG, so exporting is mostly a
 * matter of getting it out of the document intact. One thing has to happen
 * first: the Pinter pack shot is referenced by URL, and an SVG has no access to
 * external resources once it leaves the page -- a browser rasterising one via
 * `<img>` refuses to fetch them, and a relative path means nothing at all in a
 * file sitting in someone's Downloads folder. So the photo is inlined as a data
 * URI for both formats.
 */

/** The card's own coordinate space: 4x6in at 100 units per inch. */
const CARD_WIDTH = 400;
const CARD_HEIGHT = 600;

/**
 * PNG export size: 3x the card, i.e. 300dpi at 4x6. Enough headroom to print
 * the same file at 5x7 or 6x9 without it going soft. The `.svg` download is
 * there for anyone who wants to go bigger still.
 */
const PNG_SCALE = 3;

export const PNG_WIDTH = CARD_WIDTH * PNG_SCALE;
export const PNG_HEIGHT = CARD_HEIGHT * PNG_SCALE;

/** Read a same-origin asset back as a `data:` URI. */
async function toDataUri(url: string): Promise<string> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Could not read ${url} (${response.status})`);
  }

  const blob = await response.blob();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Read failed"));
    reader.readAsDataURL(blob);
  });
}

/**
 * Clone the live card into standalone SVG markup at a given pixel size, with
 * every referenced image inlined.
 */
async function buildStandaloneSvg(
  card: SVGSVGElement,
  width: number,
  height: number,
): Promise<string> {
  const clone = card.cloneNode(true) as SVGSVGElement;

  // The on-page card is sized by its container (100%/100%); a standalone file
  // needs real intrinsic dimensions or it has no natural size to print at.
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));

  await Promise.all(
    Array.from(clone.querySelectorAll("image")).map(async (node) => {
      // React renders SVG2 `href`; fall back to xlink for safety.
      const href = node.getAttribute("href") ?? node.getAttribute("xlink:href");

      if (href === null || href.startsWith("data:")) {
        return;
      }

      node.setAttribute("href", await toDataUri(href));
      node.removeAttribute("xlink:href");
    }),
  );

  return new XMLSerializer().serializeToString(clone);
}

/** Trigger a normal browser download of a blob. */
function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();

  // Revoking in the same tick can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function downloadLabelSvg(card: SVGSVGElement, fileName: string) {
  const markup = await buildStandaloneSvg(card, CARD_WIDTH, CARD_HEIGHT);

  triggerDownload(
    new Blob([markup], { type: "image/svg+xml;charset=utf-8" }),
    fileName,
  );
}

export async function downloadLabelPng(card: SVGSVGElement, fileName: string) {
  const markup = await buildStandaloneSvg(card, PNG_WIDTH, PNG_HEIGHT);
  const source = URL.createObjectURL(
    new Blob([markup], { type: "image/svg+xml;charset=utf-8" }),
  );

  try {
    const image = new Image();

    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("The card could not be rendered"));
      image.src = source;
    });

    const canvas = document.createElement("canvas");
    canvas.width = PNG_WIDTH;
    canvas.height = PNG_HEIGHT;

    const context = canvas.getContext("2d");

    if (context === null) {
      throw new Error("This browser has no 2D canvas");
    }

    context.drawImage(image, 0, 0, PNG_WIDTH, PNG_HEIGHT);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );

    if (blob === null) {
      throw new Error("The image could not be encoded");
    }

    triggerDownload(blob, fileName);
  } finally {
    URL.revokeObjectURL(source);
  }
}
