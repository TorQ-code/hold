import { createServerFn } from "@tanstack/react-start";

/** The original Jarvis — elegant, British. We only turn the volume up. */
const JARVIS_VOICE = "altair";

export const synthesizeVoice = createServerFn({ method: "POST" })
  .validator((input: { text: string }) => input)
  .handler(async ({ data }) => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return { ok: false as const };

    const spoken = data.text.trim().slice(0, 280);
    if (!spoken) return { ok: false as const };

    const res = await fetch("https://api.x.ai/v1/tts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        text: spoken,
        voice_id: JARVIS_VOICE,
        language: "en",
        speed: 1.05,
        text_normalization: true,
      }),
    });

    if (!res.ok) return { ok: false as const };

    const bytes = new Uint8Array(await res.arrayBuffer());
    let binary = "";
    const step = 0x8000;
    for (let i = 0; i < bytes.length; i += step) {
      binary += String.fromCharCode(...bytes.subarray(i, i + step));
    }
    return {
      ok: true as const,
      audio: btoa(binary),
      type: res.headers.get("content-type") || "audio/mpeg",
    };
  });
