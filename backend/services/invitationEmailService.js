const nodemailer = require('nodemailer');

function getTransporter() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD } = process.env;
  const port = Number(SMTP_PORT);

  if (
    !SMTP_HOST ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    !SMTP_USER ||
    !SMTP_PASSWORD ||
    !process.env.EMAIL_FROM
  ) {
    throw new Error('Invitation email is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, and EMAIL_FROM.');
  }

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE === 'true',
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
  });
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

async function sendProjectInvitation({ email, projectName, inviterName, role, inviteUrl }) {
  const transporter = getTransporter();
  const safeProjectName = escapeHtml(projectName);
  const safeInviterName = escapeHtml(inviterName);
  const safeRole = escapeHtml(role);
  const parsedInviteUrl = new URL(inviteUrl);

  if (
    !['http:', 'https:'].includes(parsedInviteUrl.protocol) ||
    (process.env.NODE_ENV === 'production' && parsedInviteUrl.protocol !== 'https:')
  ) {
    throw new Error('Invitation links must use HTTPS in production and HTTP or HTTPS otherwise.');
  }

  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: email,
    subject: 'You are invited to join a project',
    text: `${inviterName} invited you to join "${projectName}" as a ${role}. Accept the invitation within 7 days: ${inviteUrl}`,
    html: `<p>${safeInviterName} invited you to join <strong>${safeProjectName}</strong> as a ${safeRole}.</p><p><a href="${escapeHtml(inviteUrl)}">Accept invitation</a></p><p>This link expires in 7 days. If you weren't expecting this invitation, you can ignore this email.</p>`,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
}

module.exports = { sendProjectInvitation };
