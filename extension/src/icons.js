// Icons are drawn here as inline SVG so the extension loads no icon files or fonts.
// Lines use the button's text color; the 16px size and teal tint set them apart from ChatGPT's own gray copy icons.
const SVG_NS = "http://www.w3.org/2000/svg";

const BACK_SHEET = "M9.5 1.5H3A1.5 1.5 0 0 0 1.5 3v6.5";
const FRONT_SHEET = { x: 4, y: 4, width: 10.5, height: 10.5, rx: 1.5 };

const SHAPES = {
  copy: [["path", { d: BACK_SHEET }], ["rect", FRONT_SHEET]],
  // The same two sheets with a small "MD" drawn inside the front one.
  "copy-md": [
    ["path", { d: BACK_SHEET }],
    ["rect", FRONT_SHEET],
    ["path", { d: "M5.9 11.9V7.1l1.5 2.3 1.5-2.3v4.8", "stroke-width": "1.1" }],
    ["path", { d: "M10.3 7.1v4.8h.7a1.6 2.4 0 0 0 0-4.8z", "stroke-width": "1.1" }]
  ],
  check: [["path", { d: "M3 8.5l3.2 3.2L13 4.8", "stroke-width": "1.8" }]],
  warning: [
    ["path", { d: "M8 2.2l6.2 11.1H1.8z" }],
    ["path", { d: "M8 6.4v3.3" }],
    ["path", { d: "M8 11.6v.1", "stroke-width": "1.8" }]
  ]
};

export function createIcon(doc, name) {
  const svg = doc.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "dcp-icon");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.3");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.dataset.dcpIcon = name;
  for (const [tag, attributes] of SHAPES[name] || []) {
    const shape = doc.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attributes)) shape.setAttribute(key, String(value));
    svg.append(shape);
  }
  return svg;
}
