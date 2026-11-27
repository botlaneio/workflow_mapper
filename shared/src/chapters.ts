export const CHAPTERS = [
  { id: 1, title: "Your business", clientTitle: "Your business" },
  { id: 2, title: "How work arrives", clientTitle: "How work arrives" },
  { id: 3, title: "Walk us through one", clientTitle: "Walk us through one" },
  { id: 4, title: "Where it hurts", clientTitle: "Where it hurts" },
  { id: 5, title: "What good looks like", clientTitle: "What good looks like" },
] as const;

export const CHANNELS = [
  { id: "whatsapp", label: "WhatsApp" },
  { id: "phone", label: "Phone" },
  { id: "email", label: "Email" },
  { id: "indiamart", label: "IndiaMART" },
  { id: "distributors", label: "Distributors" },
  { id: "walkins", label: "Walk-ins" },
] as const;

export function promptCount(chapter: number, stepCount: number): number {
  if (chapter === 1) return 6;
  if (chapter === 2) return 3;
  if (chapter === 3) return Math.max(stepCount, 1) + 1;
  if (chapter === 4) return Math.max(stepCount, 1) + 1;
  return 1;
}

export function questionText(chapter: number, prompt: number, stepTitle?: string): string {
  if (chapter === 1) {
    return [
      "What's the company called?",
      "What do you make?",
      "Which city are you in?",
      "How big is the team?",
      "What's your role?",
      "Which of these happen in your business?",
    ][prompt] ?? "Your business";
  }
  if (chapter === 2) {
    return [
      "How does new work arrive?",
      "Roughly how many of those a week?",
      "Who picks it up after hours?",
    ][prompt] ?? "How work arrives";
  }
  if (chapter === 3) {
    if (!stepTitle && prompt === 0) return "What's the first thing that happens?";
    return stepTitle ? `What happens here: ${stepTitle}?` : "Is there another step after this?";
  }
  if (chapter === 4) {
    return stepTitle ? `Does this slow you down: ${stepTitle}?` : "In your words, where does it hurt?";
  }
  return "If this ran itself, what would change for you?";
}
