import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Bot, Loader2, Send, Trash2, UserRound, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Message = { role: "user" | "assistant"; content: string };
const suggestions = [
  "BNBC অনুযায়ী RCC slab design-এর গুরুত্বপূর্ণ বিষয়গুলো কী?",
  "Prepare a BOQ checklist for a two-storey RCC house.",
  "Explain BBS calculation with a simple example.",
];

export default function FloatingAssistantChat({ userId, isBangla }: { userId: string; isBangla: boolean }) {
  const storageKey = `civilos-floating-chat:${userId}`;
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed.filter((m) => m && ["user", "assistant"].includes(m.role) && typeof m.content === "string").slice(-30) : [];
    } catch { return []; }
  });
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => { localStorage.setItem(storageKey, JSON.stringify(messages.slice(-30))); }, [messages, storageKey]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages, busy]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const send = async (value = input) => {
    const content = value.trim();
    if (!content || busy) return;
    const history: Message[] = [...messages, { role: "user", content }].slice(-30);
    setMessages([...history, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session?.access_token) throw new Error(isBangla ? "সেশন শেষ হয়েছে। আবার লগইন করুন।" : "Your session expired. Please sign in again.");
      const baseUrl = import.meta.env.VITE_SUPABASE_URL;
      const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      if (!baseUrl || !publishableKey) throw new Error("Supabase client configuration is missing.");
      const response = await fetch(`${baseUrl}/functions/v1/ai-chat`, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", apikey: publishableKey, Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ messages: history }),
      });
      if (!response.ok || !response.body) {
        const errorBody = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error(errorBody.error || (isBangla ? "AI উত্তর দিতে পারেনি।" : "The AI request failed."));
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let answer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const chunk = JSON.parse(payload);
            const delta = chunk.choices?.[0]?.delta?.content;
            if (typeof delta === "string" && delta) {
              answer += delta;
              setMessages((current) => {
                const next = [...current];
                if (next[next.length - 1]?.role === "assistant") next[next.length - 1] = { role: "assistant", content: answer };
                return next;
              });
            }
            if (chunk.error?.message) throw new Error(chunk.error.message);
          } catch (error) {
            if (error instanceof Error && error.message !== "Unexpected end of JSON input") {
              if (error.message !== "Unexpected token") throw error;
            }
          }
        }
      }
      if (!answer.trim()) throw new Error(isBangla ? "কোনো উত্তর পাওয়া যায়নি। আবার চেষ্টা করুন।" : "No response was returned. Please try again.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error(error instanceof Error ? error.message : "Chat failed");
      setMessages((current) => current.slice(0, -1));
    } finally {
      setBusy(false);
      abortRef.current = null;
      inputRef.current?.focus();
    }
  };

  const clear = () => {
    if (busy) return;
    setMessages([]);
    localStorage.removeItem(storageKey);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); }
  };
  const onSubmit = (event: FormEvent) => { event.preventDefault(); void send(); };

  return (
    <div className="flex h-[min(27rem,65vh)] min-h-[18rem] flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3" aria-live="polite">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-2xl border border-cyan-300/20 bg-gradient-to-br from-cyan-400/20 via-blue-500/20 to-fuchsia-500/20 shadow-[0_0_30px_rgba(34,211,238,.12)]">
              <Sparkles className="h-6 w-6 text-cyan-200" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">{isBangla ? "কী জানতে চান?" : "What can I help you with?"}</p>
              <p className="mt-1 text-[10px] text-slate-400">{isBangla ? "বাংলা বা ইংরেজিতে প্রশ্ন করুন" : "Ask in Bangla or English"}</p>
            </div>
            <div className="grid gap-1.5">
              {suggestions.map((suggestion) => (
                <button key={suggestion} type="button" onClick={() => void send(suggestion)} className="rounded-xl border border-white/10 bg-white/[0.045] px-3 py-2 text-left text-[10px] leading-relaxed text-slate-200 transition hover:border-cyan-300/30 hover:bg-cyan-400/10">
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : messages.map((message, index) => (
          <div key={index} className={`flex gap-2 ${message.role === "user" ? "flex-row-reverse" : ""}`}>
            <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${message.role === "user" ? "bg-blue-500" : "bg-gradient-to-br from-cyan-400/30 to-violet-500/30 text-cyan-100"}`}>
              {message.role === "user" ? <UserRound className="h-3.5 w-3.5 text-white" /> : <Bot className="h-3.5 w-3.5" />}
            </span>
            <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-[11px] leading-relaxed ${message.role === "user" ? "bg-blue-600 text-white" : "border border-white/[0.08] bg-white/[0.06] text-slate-100"}`}>
              {message.role === "assistant" ? <div className="prose prose-xs prose-invert max-w-none break-words"><ReactMarkdown>{message.content || "…"}</ReactMarkdown></div> : <p className="whitespace-pre-wrap">{message.content}</p>}
            </div>
          </div>
        ))}
        {busy && messages[messages.length - 1]?.content === "" && <div className="flex items-center gap-2 pl-9 text-[10px] text-cyan-200"><Loader2 className="h-3 w-3 animate-spin" />{isBangla ? "উত্তর তৈরি হচ্ছে…" : "Thinking…"}</div>}
      </div>
      <div className="border-t border-white/10 p-3">
        <form onSubmit={onSubmit} className="flex items-end gap-2 rounded-xl border border-white/10 bg-black/20 p-1.5 focus-within:border-cyan-300/40">
          <textarea ref={inputRef} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={onKeyDown} rows={1} maxLength={12000} disabled={busy} placeholder={isBangla ? "আপনার প্রশ্ন লিখুন…" : "Message CivilOS AI…"} className="max-h-24 min-h-9 flex-1 resize-y bg-transparent px-2 py-2 text-xs text-white outline-none placeholder:text-slate-500 disabled:opacity-50" aria-label={isBangla ? "আপনার বার্তা" : "Your message"} />
          <button type="submit" disabled={busy || !input.trim()} aria-label={isBangla ? "পাঠান" : "Send"} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-lg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </form>
        <div className="mt-2 flex items-center justify-between gap-2 text-[9px] text-slate-500">
          <span>{isBangla ? "গুরুত্বপূর্ণ হিসাব যাচাই করে নিন" : "Verify critical engineering calculations."}</span>
          <button type="button" onClick={clear} disabled={busy || messages.length === 0} className="inline-flex items-center gap-1 hover:text-rose-300 disabled:opacity-30"><Trash2 className="h-3 w-3" />{isBangla ? "মুছুন" : "Clear"}</button>
        </div>
      </div>
    </div>
  );
}
