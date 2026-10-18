import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const extensionPath = join(dirname(fileURLToPath(import.meta.url)), "..", "extension");
const port = 9334;
const profile = await mkdtemp(join(tmpdir(), "dcp-smoke-"));

function createClient(ws) {
  let nextId = 0;
  const pending = new Map();
  const events = [];
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data.toString());
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolve(message.result || {});
      return;
    }
    events.push(message);
  });
  return {
    events,
    send(method, params = {}, sessionId) {
      const id = ++nextId;
      const payload = { id, method, params };
      if (sessionId) payload.sessionId = sessionId;
      ws.send(JSON.stringify(payload));
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    }
  };
}

async function waitForDebugger() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return await response.json();
    } catch {
      // Chrome is still starting.
    }
    await delay(250);
  }
  throw new Error("remote debugging port did not open");
}

const chrome = spawn(chromePath, [
  `--user-data-dir=${profile}`,
  `--remote-debugging-port=${port}`,
  "--remote-allow-origins=*",
  "--enable-unsafe-extension-debugging",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-sync",
  "--disable-extensions-except=" + extensionPath,
  "--load-extension=" + extensionPath,
  "about:blank"
], { stdio: "ignore" });

const report = {
  chromePid: chrome.pid,
  profile,
  loadExtensionFlag: "attempted",
  loadUnpacked: null,
  pages: [],
  extensionNetwork: [],
  console: []
};

try {
  const version = await waitForDebugger();
  report.browser = version.Browser;
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve);
    ws.addEventListener("error", reject);
  });
  const browser = createClient(ws);
  try {
    report.loadUnpacked = await browser.send("Extensions.loadUnpacked", { path: extensionPath });
  } catch (error) {
    report.loadUnpacked = { error: String(error.message || error) };
  }

  async function inspect(url) {
    const created = await browser.send("Target.createTarget", { url: "about:blank" });
    const attached = await browser.send("Target.attachToTarget", { targetId: created.targetId, flatten: true });
    const sessionId = attached.sessionId;
    await browser.send("Page.enable", {}, sessionId);
    await browser.send("Runtime.enable", {}, sessionId);
    await browser.send("Network.enable", {}, sessionId);
    await browser.send("Page.navigate", { url }, sessionId);
    const started = Date.now();
    let last = null;
    while (Date.now() - started < 20000) {
      last = await browser.send("Runtime.evaluate", {
        expression: `({
          href: location.href,
          ready: document.readyState,
          title: document.title,
          extensionUi: document.querySelectorAll("[data-dcp-ui]").length,
          extensionNameSeen: (document.body && document.body.innerText || "").includes("Dot Copy Paste"),
          textLength: (document.body && document.body.innerText || "").length,
          snippet: (document.body && document.body.innerText || "").replace(/\\s+/g, " ").slice(0, 240),
          textareaCount: document.querySelectorAll("textarea").length,
          editableCount: document.querySelectorAll("[contenteditable='true']").length
        })`,
        returnByValue: true
      }, sessionId);
      const value = last.result?.value;
      if (value?.href?.startsWith("chrome-error://")) break;
      if (value?.href?.startsWith("chrome://extensions") && value.ready === "complete") break;
      if (value?.ready === "complete" && value.href.startsWith(url.slice(0, 16)) && value.textLength > 0) break;
      await delay(500);
    }
    await delay(1000);
    if (url.startsWith("chrome://extensions")) {
      const shadow = await browser.send("Runtime.evaluate", {
        expression: `(() => {
          const found = [];
          const walk = (node) => {
            if (!node) return;
            if (node.nodeType === 1) {
              const text = (node.innerText || "").trim();
              if (text && text.length < 180 && node.children.length === 0) found.push(text);
              if (node.shadowRoot) walk(node.shadowRoot);
              for (const child of node.children) walk(child);
            } else if (node.nodeType === 11) {
              for (const child of node.children) walk(child);
            }
          };
          walk(document.documentElement);
          return found.filter((text) => /Dot|Copy|Paste|오류|error|manifest|개발자/i.test(text)).slice(0, 50);
        })()`,
        returnByValue: true
      }, sessionId);
      last.extensionList = shadow.result?.value || shadow;
    }
    const pageEvents = browser.events.filter((event) => event.sessionId === sessionId);
    const contexts = pageEvents
      .filter((event) => event.method === "Runtime.executionContextCreated")
      .map((event) => ({
        id: event.params.context.id,
        name: event.params.context.name,
        origin: event.params.context.origin,
        type: event.params.context.auxData?.type || ""
      }));
    const extensionContext = contexts.find((context) => context.type === "isolated" || String(context.origin || "").startsWith("chrome-extension://"));
    let extensionManifest = null;
    if (extensionContext) {
      try {
        const manifest = await browser.send("Runtime.evaluate", {
          expression: "chrome.runtime.getManifest().version",
          contextId: extensionContext.id,
          returnByValue: true
        }, sessionId);
        extensionManifest = manifest.result?.value || manifest;
      } catch (error) {
        extensionManifest = { error: String(error.message || error) };
      }
    }
    const extensionNetwork = pageEvents
      .filter((event) => event.method === "Network.requestWillBeSent")
      .map((event) => event.params)
      .filter((params) => JSON.stringify(params.initiator || {}).includes("chrome-extension://"))
      .map((params) => params.request.url);
    const consoleEvents = pageEvents
      .filter((event) => event.method === "Runtime.exceptionThrown" || event.method === "Runtime.consoleAPICalled")
      .map((event) => ({ method: event.method, text: JSON.stringify(event.params).slice(0, 500) }))
      .filter((event) => event.text.includes("Dot Copy Paste") || event.text.includes("chrome-extension://"));
    report.pages.push({
      url,
      value: last?.result?.value || last,
      extensionList: last?.extensionList || null,
      extensionNetwork,
      consoleEvents,
      contexts,
      extensionManifest
    });
    report.extensionNetwork.push(...extensionNetwork);
    report.console.push(...consoleEvents);
    await browser.send("Target.closeTarget", { targetId: created.targetId });
  }

  await inspect("https://chatgpt.com/dots");
  await inspect("https://www.wikipedia.org/");
  await inspect("chrome://extensions/");
  const extensionId = report.loadUnpacked?.id;
  if (extensionId) await inspect(`chrome-extension://${extensionId}/popup/popup.html`);
  const targets = await browser.send("Target.getTargets");
  report.targets = (targets.targetInfos || []).map((target) => ({ type: target.type, url: target.url, title: target.title }));
  ws.close();
} catch (error) {
  report.fatal = String(error && error.stack || error);
} finally {
  try {
    const preferences = await readFile(join(profile, "Default", "Preferences"), "utf8");
    const parsed = JSON.parse(preferences);
    const settings = parsed.extensions?.settings || {};
    report.installedExtensions = Object.entries(settings).map(([id, value]) => ({
      id,
      path: value.path,
      state: value.state,
      disableReasons: value.disable_reasons,
      location: value.location
    }));
  } catch (error) {
    report.preferencesError = String(error.message || error);
  }
  spawn("taskkill", ["/PID", String(chrome.pid), "/T", "/F"], { stdio: "ignore" });
  await delay(500);
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}

console.log(JSON.stringify(report, null, 2));
