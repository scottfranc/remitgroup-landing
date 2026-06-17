import { handleInquiry, handleInquiryOptions } from "./api/inquiry";
import type { Env } from "./api/inquiry";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname === "/api/inquiry") {
      if (request.method === "OPTIONS") {
        return handleInquiryOptions();
      }

      if (request.method === "POST") {
        return handleInquiry(request, env);
      }

      return new Response("Method Not Allowed", { status: 405 });
    }

    return new Response("Not Found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
