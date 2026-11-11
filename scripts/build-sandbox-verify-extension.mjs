import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "extension");
const output = join(root, "sandbox-verify", "extension");
const overrides = join(root, "sandbox-verify", "overrides");

export function buildSandboxVerifyExtension() {
  const saleSource = readFileSync(join(source, "src", "sale.js"), "utf8");
  const entitlementSource = readFileSync(join(source, "src", "entitlement.js"), "utf8");
  const popupSource = readFileSync(join(source, "src", "popup-controller.js"), "utf8");
  if (saleSource.includes("sandboxExport") || entitlementSource.includes("sandbox-verify") || popupSource.includes("sandbox-verify")) {
    throw new Error("sale package already contains the sandbox verify path");
  }
  rmSync(output, { recursive: true, force: true });
  mkdirSync(output, { recursive: true });
  cpSync(source, output, { recursive: true });
  writeFileSync(join(output, "src", "sale.js"), readFileSync(join(overrides, "sale.js")));
  writeFileSync(join(output, "src", "entitlement.js"), readFileSync(join(overrides, "entitlement.js")));
  const popup = popupSource.replace(
    'if (entitlement.state !== "entitled") {',
    'if (entitlement.state !== "sandbox-verify") {'
  );
  if (popup === popupSource) throw new Error("popup verify patch was not applied");
  writeFileSync(join(output, "src", "popup-controller.js"), popup);
  const i18nPath = join(output, "src", "i18n.js");
  const i18n = readFileSync(i18nPath, "utf8")
    .replace('purchaseSandbox: "A Sandbox purchase is not a live purchase.",', 'purchaseSandbox: "A Sandbox purchase is not a live purchase.",\n    purchaseSandboxVerify: "Sandbox verify export is available for loaded messages.",')
    .replace('purchaseSandbox: "Sandbox 구매는 실구매로 사용되지 않습니다.",', 'purchaseSandbox: "Sandbox 구매는 실구매로 사용되지 않습니다.",\n    purchaseSandboxVerify: "Sandbox 검증용 내보내기를 사용할 수 있습니다.",');
  writeFileSync(i18nPath, i18n);
  const manifest = JSON.parse(readFileSync(join(output, "manifest.json"), "utf8"));
  manifest.name = "Dot Copy Paste Sandbox Verify";
  manifest.description = "Local Sandbox purchase verification build. Not for the Chrome Web Store.";
  manifest.host_permissions = ["http://127.0.0.1:8787/*"];
  writeFileSync(join(output, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  const bundled = spawnSync(process.execPath, [join(root, "scripts", "bundle-content.mjs")], {
    cwd: root,
    env: { ...process.env, DCP_EXTENSION_ROOT: output },
    encoding: "utf8"
  });
  if (bundled.status !== 0) throw new Error(bundled.stderr || bundled.stdout || "bundle failed");
  return output;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const built = buildSandboxVerifyExtension();
  console.log(`sandbox_verify_extension=${built}`);
}
