import { normalizeEmail } from "./login.js";

export function mailReady(env = {}) {
  return Boolean(cleanFrom(env.DCP_EMAIL_FROM) && cleanSecret(env.DCP_EMAIL_API_KEY));
}

export async function sendLoginMail({ to, link, env = {}, transport } = {}) {
  const recipient = normalizeEmail(to);
  if (!recipient || typeof link !== "string" || !/^https:\/\/[^\s]+$/.test(link)) {
    return { sent: false, reason: "not-sent" };
  }
  if (typeof transport === "function") {
    const result = await transport({ to: recipient, link });
    return result?.sent === true ? { sent: true } : { sent: false, reason: result?.reason || "not-sent" };
  }
  const from = cleanFrom(env.DCP_EMAIL_FROM);
  const pass = cleanSecret(env.DCP_EMAIL_API_KEY);
  if (!from || !pass) return { sent: false, reason: "mail-not-configured" };
  try {
    const nodemailer = await import("nodemailer");
    const port = Number(env.DCP_EMAIL_SMTP_PORT || 465);
    const transporter = nodemailer.createTransport({
      host: env.DCP_EMAIL_SMTP_HOST || "smtp.gmail.com",
      port,
      secure: port === 465,
      auth: { user: from, pass }
    });
    await transporter.sendMail({
      from,
      to: recipient,
      subject: "Dot Copy Paste purchase restore",
      text: [
        "Dot Copy Paste 구매 복원 링크입니다.",
        "이 링크는 15분 동안 한 번만 사용할 수 있습니다.",
        "링크를 열어도 새 결제는 만들어지지 않습니다.",
        "",
        link
      ].join("\n")
    });
    return { sent: true };
  } catch {
    return { sent: false, reason: "mail-failed" };
  }
}

function cleanFrom(value) {
  return normalizeEmail(value);
}

function cleanSecret(value) {
  if (typeof value !== "string") return "";
  const secret = value.replace(/\s+/g, "");
  return secret.length >= 8 ? secret : "";
}
