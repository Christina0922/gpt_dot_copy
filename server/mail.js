import { normalizeEmail } from "./login.js";

export function mailReady(env = {}) {
  return Boolean(mailConfig(env).fromPresent && mailConfig(env).passwordPresent);
}

export function mailConfig(env = {}) {
  const port = Number(env.DCP_EMAIL_SMTP_PORT || 465);
  return {
    host: typeof env.DCP_EMAIL_SMTP_HOST === "string" && env.DCP_EMAIL_SMTP_HOST ? env.DCP_EMAIL_SMTP_HOST : "smtp.gmail.com",
    port: Number.isInteger(port) && port > 0 ? port : 465,
    secure: (Number.isInteger(port) && port > 0 ? port : 465) === 465,
    fromPresent: Boolean(cleanFrom(env.DCP_EMAIL_FROM)),
    passwordPresent: Boolean(smtpPassword(env))
  };
}

export function loginMailContent(link) {
  return {
    subject: "Dot Copy Paste 구매 복원 · Purchase restore",
    text: [
      "Dot Copy Paste 구매 복원 링크입니다.",
      "이 링크는 15분 동안 한 번만 사용할 수 있습니다.",
      "메일 보안 검사가 링크를 미리 열어도 로그인되지 않습니다. 페이지의 확인 버튼을 눌러야 이 브라우저에 기록됩니다.",
      "링크를 열어도 새 결제는 만들어지지 않습니다.",
      "",
      "This is the Dot Copy Paste purchase restore link.",
      "The link works once and expires after 15 minutes.",
      "A mail security check that opens the link does not sign you in. Press the confirm button on the page.",
      "Opening the link does not create a new payment.",
      "",
      link
    ].join("\n")
  };
}

export async function sendLoginMail({ to, link, env = {}, transport } = {}) {
  const recipient = normalizeEmail(to);
  if (!recipient || typeof link !== "string" || !/^https:\/\/[^\s]+$/.test(link)) {
    return { sent: false, reason: "not-sent" };
  }
  const message = loginMailContent(link);
  if (typeof transport === "function") {
    const result = await transport({ to: recipient, link, subject: message.subject, text: message.text });
    return result?.sent === true ? { sent: true } : { sent: false, reason: result?.reason || "not-sent" };
  }
  const from = cleanFrom(env.DCP_EMAIL_FROM);
  const pass = smtpPassword(env);
  const config = mailConfig(env);
  if (!from || !pass) return { sent: false, reason: "mail-not-configured" };
  try {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: from, pass }
    });
    await transporter.sendMail({
      from,
      to: recipient,
      subject: message.subject,
      text: message.text
    });
    return { sent: true };
  } catch {
    return { sent: false, reason: "mail-failed" };
  }
}

function cleanFrom(value) {
  return normalizeEmail(value);
}

function smtpPassword(env) {
  const value = env.DCP_EMAIL_SMTP_PASSWORD;
  if (typeof value !== "string") return "";
  const password = value.replace(/\s+/g, "");
  return password.length >= 8 ? password : "";
}
