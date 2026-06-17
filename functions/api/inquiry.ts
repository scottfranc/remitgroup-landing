interface Env {
  DB: D1Database;
  BREVO_API_KEY: string;
  SENDER_NAME: string;
  SENDER_EMAIL: string;
  NOTIFY_NAME: string;
  NOTIFY_EMAIL: string;
}

interface InquiryPayload {
  name?: string;
  company?: string;
  email?: string;
  message?: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

async function sendBrevoEmail(env: Env, inquiry: Required<Pick<InquiryPayload, "name" | "email">> & InquiryPayload): Promise<void> {
  const company = inquiry.company?.trim() || "Not provided";
  const message = inquiry.message?.trim() || "Not provided";

  const htmlContent = `
    <html>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #111;">
        <h2>New acquisition inquiry — remitgroup.com</h2>
        <p><strong>Name:</strong> ${escapeHtml(inquiry.name!.trim())}</p>
        <p><strong>Company:</strong> ${escapeHtml(company)}</p>
        <p><strong>Email:</strong> ${escapeHtml(inquiry.email!.trim())}</p>
        <p><strong>Message:</strong></p>
        <p>${escapeHtml(message).replaceAll("\n", "<br>")}</p>
        <hr>
        <p style="color:#666;font-size:12px;">Submitted via remitgroup.com acquisition form</p>
      </body>
    </html>
  `.trim();

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "api-key": env.BREVO_API_KEY,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender: {
        name: env.SENDER_NAME,
        email: env.SENDER_EMAIL,
      },
      to: [
        {
          email: env.NOTIFY_EMAIL,
          name: env.NOTIFY_NAME,
        },
      ],
      replyTo: {
        email: inquiry.email!.trim(),
        name: inquiry.name!.trim(),
      },
      subject: `Acquisition Inquiry — ${inquiry.name!.trim()} (${company})`,
      htmlContent,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Brevo API error (${response.status}): ${errorText}`);
  }
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const { BREVO_API_KEY, NOTIFY_EMAIL, SENDER_EMAIL } = context.env;

    if (!BREVO_API_KEY || BREVO_API_KEY === "YOUR_BREVO_API_KEY") {
      return jsonResponse({ ok: false, error: "Email service is not configured." }, 503);
    }

    if (!NOTIFY_EMAIL || NOTIFY_EMAIL.startsWith("YOUR_")) {
      return jsonResponse({ ok: false, error: "Notification email is not configured." }, 503);
    }

    if (!SENDER_EMAIL || SENDER_EMAIL.startsWith("YOUR_")) {
      return jsonResponse({ ok: false, error: "Sender email is not configured." }, 503);
    }

    const body = await context.request.json<InquiryPayload>();
    const name = body.name?.trim() ?? "";
    const email = body.email?.trim() ?? "";
    const company = body.company?.trim() ?? "";
    const message = body.message?.trim() ?? "";

    if (!name || name.length > 120) {
      return jsonResponse({ ok: false, error: "Please provide a valid name." }, 400);
    }

    if (!email || !isValidEmail(email) || email.length > 254) {
      return jsonResponse({ ok: false, error: "Please provide a valid email address." }, 400);
    }

    if (company.length > 200) {
      return jsonResponse({ ok: false, error: "Company name is too long." }, 400);
    }

    if (message.length > 5000) {
      return jsonResponse({ ok: false, error: "Message is too long." }, 400);
    }

    await context.env.DB.prepare(
      `INSERT INTO inquiries (name, company, email, message) VALUES (?, ?, ?, ?)`
    )
      .bind(name, company || null, email, message || null)
      .run();

    await sendBrevoEmail(context.env, { name, email, company, message });

    return jsonResponse({ ok: true });
  } catch (error) {
    console.error("Inquiry submission failed:", error);
    return jsonResponse({ ok: false, error: "Unable to submit inquiry. Please try again later." }, 500);
  }
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
};
