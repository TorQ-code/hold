import { createFileRoute } from "@tanstack/react-router";

const JARVIS_VOICE = "altair";

export const Route = createFileRoute("/api/tts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.XAI_API_KEY;
        if (!apiKey) return new Response(null, { status: 204 });

        let text = "";
        try {
          const body = (await request.json()) as { text?: string };
          text = String(body.text ?? "").trim().slice(0, 280);
        } catch {
          return new Response(null, { status: 400 });
        }
        if (!text) return new Response(null, { status: 204 });

        const res = await fetch("https://api.x.ai/v1/tts", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            text,
            voice_id: JARVIS_VOICE,
            language: "en",
            speed: 1.05,
            text_normalization: true,
          }),
        });

        if (!res.ok) return new Response(null, { status: 502 });
        return new Response(res.body, {
          status: 200,
          headers: {
            "content-type": res.headers.get("content-type") || "audio/mpeg",
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});
