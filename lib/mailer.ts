import nodemailer from "nodemailer";

import { toBoolean } from "@/lib/utils";

type MailAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

let transporter: nodemailer.Transporter | undefined;

function getMailConfig() {
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();

  if (!user || !pass) {
    throw new Error(
      "Email sending is not configured. Add SMTP_USER and SMTP_PASS for your university Google account."
    );
  }

  const port = Number.parseInt(process.env.SMTP_PORT?.trim() ?? "465", 10);

  return {
    host: process.env.SMTP_HOST?.trim() || "smtp.gmail.com",
    port: Number.isNaN(port) ? 465 : port,
    secure: toBoolean(process.env.SMTP_SECURE, port === 465),
    user,
    pass,
    fromEmail: process.env.SMTP_FROM_EMAIL?.trim() || user,
    fromName: process.env.SMTP_FROM_NAME?.trim() || "Vocabulary Explorer"
  };
}

export function isMailConfigured() {
  return Boolean(process.env.SMTP_USER?.trim() && process.env.SMTP_PASS?.trim());
}

function getTransporter() {
  if (transporter) {
    return transporter;
  }

  const config = getMailConfig();

  transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass
    }
  });

  return transporter;
}

type SendEmailOptions = {
  to: string;
  subject: string;
  text: string;
  html: string;
  attachments?: MailAttachment[];
};

export async function sendEmail({ to, subject, text, html, attachments }: SendEmailOptions) {
  const config = getMailConfig();

  await getTransporter().sendMail({
    from: `"${config.fromName}" <${config.fromEmail}>`,
    to,
    replyTo: config.fromEmail,
    subject,
    text,
    html,
    attachments
  });
}
