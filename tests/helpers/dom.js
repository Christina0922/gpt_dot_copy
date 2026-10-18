import { JSDOM } from "jsdom";

export function loadDom(html, url = "https://chatgpt.com/dots") {
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, {
    url,
    pretendToBeVisual: true
  });
  const { window } = dom;
  window.requestAnimationFrame = (callback) => {
    callback(0);
    return 1;
  };
  window.cancelAnimationFrame = () => {};
  window.navigator.clipboard = window.navigator.clipboard || {};
  return dom;
}

export async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

export function createClipboard(initial = { text: "붙여넣을 문장" }) {
  const calls = [];
  const state = { ...initial };
  return {
    calls,
    state,
    writeText(text) {
      calls.push(["write", text]);
      if (state.writeError) {
        const error = new Error("write failed");
        error.name = state.writeError;
        throw error;
      }
      state.written = text;
      return Promise.resolve();
    },
    readText() {
      calls.push(["read"]);
      if (state.readError) {
        const error = new Error("read failed");
        error.name = state.readError;
        return Promise.reject(error);
      }
      return Promise.resolve(state.text);
    }
  };
}
