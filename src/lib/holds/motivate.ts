const TIME_CUES: Record<number, string> = {
  15: "Fifteen seconds. Stay with it.",
  30: "Thirty seconds. Well held.",
  45: "Forty-five. Keep going.",
  60: "One minute. Impressive.",
  75: "Seventy-five. Don't let go.",
  90: "Ninety seconds. Outstanding.",
  105: "Keep the form. You're strong.",
  120: "Two minutes. Remarkable.",
  150: "Two and a half. Extraordinary.",
  180: "Three minutes. That is excellent.",
};

const ROTATE = [
  "Stay with it.",
  "Good. Hold.",
  "That's it.",
  "Steady now.",
  "Keep the form.",
  "Don't let go.",
  "You're doing well.",
  "Breathe. Hold.",
  "Still strong.",
  "Well held.",
];

export function cueForSeconds(sec: number): string {
  if (TIME_CUES[sec]) return TIME_CUES[sec];
  if (sec > 0 && sec % 60 === 0) {
    const mins = sec / 60;
    return `${mins} minutes. Extraordinary.`;
  }
  return ROTATE[Math.floor(sec / 15) % ROTATE.length] ?? "Stay with it.";
}
