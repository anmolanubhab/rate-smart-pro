import { useEffect, useState } from "react";
import { Sparkles, User } from "lucide-react";

const QA = [
  { q: "What is today's profit?", a: "₹1,42,350" },
  { q: "Which stock is running low?", a: "Brake Pad — only 32 units left" },
  { q: "What should I purchase?", a: "Recommended Purchase: 125 units of Engine Oil 5W" },
];

type Msg = { role: "user" | "ai"; text: string; typing?: boolean };

export function RdAiChat() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (step >= QA.length) return;
    const { q, a } = QA[step];
    const t1 = setTimeout(() => setMsgs((m) => [...m, { role: "user", text: q }]), 200);
    const t2 = setTimeout(() => setMsgs((m) => [...m, { role: "ai", text: "", typing: true }]), 900);
    const t3 = setTimeout(() => {
      setMsgs((m) => {
        const copy = [...m];
        copy[copy.length - 1] = { role: "ai", text: a };
        return copy;
      });
      setStep((s) => s + 1);
    }, 2100);
    return () => {
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
    };
  }, [step]);

  // restart loop
  useEffect(() => {
    if (step === QA.length) {
      const t = setTimeout(() => { setMsgs([]); setStep(0); }, 3500);
      return () => clearTimeout(t);
    }
  }, [step]);

  return (
    <div className="rounded-3xl border border-border bg-card p-5 shadow-elevated">
      <div className="flex items-center gap-3 border-b border-border pb-4">
        <div className="bg-brand-gradient grid h-10 w-10 place-items-center rounded-xl text-primary-foreground shadow-elevated">
          <Sparkles className="h-5 w-5" />
        </div>
        <div>
          <div className="text-sm font-bold text-foreground">RD AI</div>
          <div className="text-[12px] text-muted-foreground">Your business co-pilot</div>
        </div>
        <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-600">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-blink" /> online
        </span>
      </div>

      <div className="min-h-[320px] space-y-3 py-4">
        {msgs.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex items-start justify-end gap-2 animate-fade-up">
              <div className="bg-brand-gradient max-w-[80%] rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm text-primary-foreground shadow-soft">
                {m.text}
              </div>
              <div className="grid h-8 w-8 place-items-center rounded-full bg-muted text-muted-foreground">
                <User className="h-4 w-4" />
              </div>
            </div>
          ) : (
            <div key={i} className="flex items-start gap-2 animate-fade-up">
              <div className="bg-brand-gradient grid h-8 w-8 place-items-center rounded-full text-primary-foreground">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="max-w-[80%] rounded-2xl rounded-tl-sm border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground">
                {m.typing ? (
                  <span className="inline-flex gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-blink" />
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-blink [animation-delay:150ms]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-blink [animation-delay:300ms]" />
                  </span>
                ) : (
                  m.text
                )}
              </div>
            </div>
          )
        )}
      </div>

      <div className="flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2.5">
        <input
          readOnly
          placeholder="Ask RD AI anything about your business…"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        <button className="bg-brand-gradient rounded-lg px-3 py-1.5 text-xs font-semibold text-primary-foreground">
          Ask
        </button>
      </div>
    </div>
  );
}
