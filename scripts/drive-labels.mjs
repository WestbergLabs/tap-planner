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

  ws.close();
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
