import { createServerFn } from "@tanstack/react-start";

export const transcribeCommand = createServerFn({ method: "POST" })
  .validator((input: { audio: string; type: string }) => input)
  .handler(async ({ data }) => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return { ok: false as const, text: "" };

    const bytes = Buffer.from(data.audio, "base64");
    if (bytes.length < 200) return { ok: false as const, text: "" };

    const type = data.type || "audio/webm";
    const ext = type.includes("mp4") || type.includes("m4a") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
    const form = new FormData();
    form.set("language", "en");
    form.set("format", "true");
    form.set("keyterm", "start stop pause resume timer dead hang plank wall sit reminder");
    form.set("file", new Blob([bytes], { type }), `clip.${ext}`);

    const res = await fetch("https://api.x.ai/v1/stt", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    if (!res.ok) return { ok: false as const, text: "" };

    const body = (await res.json()) as { text?: string };
    const text = (body.text ?? "").trim();
    return text ? { ok: true as const, text } : { ok: false as const, text: "" };
  });
