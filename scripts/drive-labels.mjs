/**
 * Dev-only smoke driver for /labels. Uses the Chrome DevTools Protocol over a
 * plain WebSocket -- no Playwright dependency -- to do what a user does: pick a
 * BrewPack, switch to the two-label sheet, and screenshot the result.
 *
 * Run via `node scripts/drive-labels.mjs <cdp-json-url> <out.png>` after
 * starting Edge/Chrome with --remote-debugging-port.
 */
import fs from "node:fs";

const [, , cdpUrl, outFile] = process.argv;

let nextId = 1;
const pending = new Map();

function send(ws, method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));

  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => reject(new Error(`${method} timed out`)), 20_000);
  });
}

/** Evaluate an expression in the page and return its JSON value. */
async function evaluate(ws, expression) {
  const result = await send(ws, "Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });

  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text);
  }

  return result.result.value;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const targets = await (await fetch(`${cdpUrl}/json/list`)).json();
  const page = targets.find((t) => t.type === "page");

  if (!page) {
    throw new Error("no page target found");
  }

  const ws = new WebSocket(page.webSocketDebuggerUrl);

  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);

    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) {
        reject(new Error(message.error.message));
      } else {
        resolve(message.result);
      }
    }
  });

  await new Promise((resolve) => ws.addEventListener("open", resolve));

  await send(ws, "Page.enable");
  await send(ws, "Runtime.enable");
  await send(ws, "Page.navigate", { url: "http://localhost:3000/labels" });
  await sleep(6000);

  // 1) Type into the BrewPack combobox and pick the first result, the way a
  //    user would rather than by calling React directly.
  const typed = await evaluate(
    ws,
    `(() => {
      const input = document.querySelector('#brewpack-search');
      if (!input) return 'no input';
      input.focus();
      input.click();
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'Sport');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return 'typed';
    })()`,
  );
  await sleep(700);

  const picked = await evaluate(
    ws,
    `(() => {
      const option = document.querySelector('[role="option"]');
      if (!option) return 'no options';
      option.click();
      return option.textContent.trim().slice(0, 40);
    })()`,
  );
  await sleep(700);

  // 3) Switch to the two-label sheet.
  const switched = await evaluate(
    ws,
    `(() => {
      const radios = [...document.querySelectorAll('input[name="print-mode"]')];
      if (radios.length < 2) return 'no radios';
      radios[1].click();
      return 'switched';
    })()`,
  );
  await sleep(700);

  const cardCount = await evaluate(
    ws,
    `document.querySelectorAll('[aria-label^="Edit card"]').length`,
  );
  const tabCount = await evaluate(
    ws,
    `document.querySelectorAll('[role="tab"]').length`,
  );

  // 4) Put a different beer on card 2, proving the slots are independent.
  await evaluate(
    ws,
    `(() => {
      const tabs = [...document.querySelectorAll('[role="tab"]')];
      if (tabs[1]) tabs[1].click();
    })()`,
  );
  await sleep(500);

  await evaluate(
    ws,
    `(() => {
      const input = document.querySelector('#brewpack-search');
      input.focus();
      input.click();
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'Dark Matter');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`,
  );
  await sleep(700);

  await evaluate(
    ws,
    `(() => {
      const option = document.querySelector('[role="option"]');
      if (option) option.click();
    })()`,
  );
  await sleep(800);

  const names = await evaluate(
    ws,
    `[...document.querySelectorAll('[aria-label^="Edit card"] svg')]
       .map(s => s.getAttribute('aria-label')).join(' | ')`,
  );

  // Did selecting packs actually pull in the Pinter pack shots?
  const imageHref = await evaluate(
    ws,
    `[...document.querySelectorAll('svg image')]
       .map(i => i.getAttribute('href')).join(' | ') || 'none'`,
  );

  // 5) Download the card as a PNG. Headless has nowhere to put a file, so the
  //    anchor click is intercepted and the blob decoded in-page instead. This
  //    checks the part that cannot fail quietly: the pack shot has to be
  //    inlined as a data URI before rasterising, or the photo silently drops
  //    out of the export and the card comes back as a bare gradient.
  const exported = await evaluate(
    ws,
    `(async () => {
      let captured = null;
      const click = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {
        if (this.download) {
          // Start the read synchronously: the object URL is revoked on the
          // next tick, and blocking the click here does not stop that.
          captured = { name: this.download, bytes: fetch(this.href).then((r) => r.arrayBuffer()) };
          return;
        }
        return click.apply(this, arguments);
      };

      const button = [...document.querySelectorAll('button')]
        .find((b) => b.textContent.startsWith('Download PNG'));
      if (!button) return 'no download button';
      button.click();

      for (let i = 0; i < 60 && captured === null; i++) {
        await new Promise((r) => setTimeout(r, 100));
      }
      HTMLAnchorElement.prototype.click = click;
      if (captured === null) return 'no download fired';

      const bytes = new Uint8Array(await captured.bytes);
      const png = String.fromCharCode(...bytes.slice(1, 4)) === 'PNG';
      // Big-endian width/height from the IHDR chunk.
      const view = new DataView(bytes.buffer);
      const width = view.getUint32(16);
      const height = view.getUint32(20);

      // Sample the middle of the artwork panel. An empty or failed inline
      // leaves the style gradient showing; the pack shot does not.
      const bitmap = await createImageBitmap(new Blob([bytes]));
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);
      const [r, g, b, a] = ctx.getImageData(width / 2, height * 0.15, 1, 1).data;

      return [
        captured.name,
        png ? 'png' : 'NOT PNG',
        width + 'x' + height,
        Math.round(bytes.length / 1024) + 'kb',
        'art rgba(' + [r, g, b, a] + ')',
      ].join('  ');
    })()`,
  );

  const shot = await send(ws, "Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
  });
  fs.writeFileSync(outFile, Buffer.from(shot.data, "base64"));

  console.log(`typed:        ${typed}`);
  console.log(`picked:       ${picked}`);
  console.log(`pack shot:    ${imageHref}`);
  console.log(`mode switch:  ${switched}`);
  console.log(`preview cards:${cardCount}   tabs: ${tabCount}`);
  console.log(`card labels:  ${names}`);
  console.log(`png export:   ${exported}`);

  ws.close();
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
