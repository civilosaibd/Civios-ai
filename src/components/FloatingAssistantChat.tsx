import { useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
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
      return Array.isArray(parsed)
        ? parsed.filter((m) => m && ["user", "assistant"].includes(m.role) && typeof m.content === "string").slice(-30)
        : [];
    } catch { return []; }
  });
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(messages.slice(-30))); } catch { /* storage may be unavailable */ }
  }, [messages, storageKey]);
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
      if (sessionError || !session?.access_token) {
        throw new Error(isBangla ? "সেশন শেষ হয়েছে। আবার লগইন করুন।" : "Your session expired. Please sign in again.");
      }

      const baseUrl = import.meta.env.VITE_SUPABASE_URL;
      const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      if (!baseUrl || !publishableKey) throw new Error("Supabase client configuration is missing.");

      const response = await fetch(`${baseUrl.replace(/\/$/, "")}/functions/v1/ai-chat`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          apikey: publishableKey,
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ messages: history }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        const detail = typeof errorBody?.error === "string"
          ? errorBody.error
          : `HTTP ${response.status}`;
        throw new Error(detail);
      }
      if (!response.body) throw new Error(isBangla ? "AI stream পাওয়া যায়নি।" : "The AI response stream was empty.");

      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const payload = await response.json();
        const text = payload?.choices?.[0]?.message?.content ?? payload?.output_text;
        if (typeof text !== "string" || !text.trim()) {
          throw new Error(payload?.error?.message || (isBangla ? "AI কোনো উত্তর দেয়নি।" : "The AI returned an empty response."));
        }
        setMessages((current) => [...current.slice(0, -1), { role: "assistant", content: text }]);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let eventData: string[] = [];
      let answer = "";
      let streamError: string | null = null;

      const consumeEvent = () => {
        const payload = eventData.join("\n").trim();
        eventData = [];
        if (!payload || payload === "[DONE]") return;
        let chunk: any;
        try { chunk = JSON.parse(payload); }
        catch { streamError = isBangla ? "AI-এর response format বোঝা যায়নি।" : "Could not parse the AI response stream."; return; }

        if (chunk.error) {
          streamError = typeof chunk.error === "string" ? chunk.error : chunk.error.message || "AI provider error";
          return;
        }
        const choice = chunk.choices?.[0];
        const delta = choice?.delta?.content ?? choice?.message?.content;
        if (typeof delta === "string" && delta) answer += delta;
        else if (Array.isArray(delta)) {
          answer += delta.map((part: any) => typeof part === "string" ? part : part?.text || "").join("");
        }
        if (typeof chunk.output_text === "string") answer += chunk.output_text;
        if (chunk.type === "response.failed") {
          streamError = chunk.response?.error?.message || chunk.error?.message || "The AI response failed.";
        }
        if (answer) {
          const currentAnswer = answer;
          setMessages((current) => {
            const next = [...current];
            const lastAssistant = next.map((message) => message.role).lastIndexOf("assistant");
            if (lastAssistant >= 0) next[lastAssistant] = { role: "assistant", content: currentAnswer };
            return next;
          });
        }
      };

      const processLine = (rawLine: string) => {
        const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
        if (line === "") consumeEvent();
        else if (line.startsWith("data:")) eventData.push(line.slice(5).trimStart());
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        lines.forEach(processLine);
      }
      buffer += decoder.decode();
      if (buffer) processLine(buffer);
      if (eventData.length) consumeEvent();

      if (streamError) throw new Error(streamError);
      if (!answer.trim()) {
        throw new Error(isBangla
          ? "AI থেকে উত্তর আসেনি। Supabase Edge Function deploy, API key ও model configuration পরীক্ষা করুন।"
          : "No answer came back. Check the deployed Supabase Edge Function, API key, and model configuration.");
      }
      setMessages((current) => {
        const next = [...current];
        const lastAssistant = next.findLastIndex((message) => message.role === "assistant");
        if (lastAssistant >= 0) next[lastAssistant] = { role: "assistant", content: answer };
        return next;
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      const message = error instanceof Error ? error.message : "Chat failed";
      toast.error(message);
      setMessages((current) => current.filter((item, index) => !(item.role === "assistant" && index === current.length - 1 && !item.content)));
    } finally {
      setBusy(false);
      abortRef.current = null;
      inputRef.current?.focus();
    }
  };

  const clear = () => {
    if (busy) return;
    setMessages([]);
    try { localStorage.removeItem(storageKey); } catch { /* storage may be unavailable */ }
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); }
  };
  const onSubmit = (event: FormEvent) => { event.preventDefault(); void send(); };

  return (
    <div className="flex h-[min(19rem,44vh)] min-h-[14rem] flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-2.5" aria-live="polite">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2.5 text-center">
            <div className="grid h-9 w-9 place-items-center rounded-xl border border-cyan-300/20 bg-gradient-to-br from-cyan-400/20 via-blue-500/20 to-fuchsia-500/20">
              <Sparkles className="h-4 w-4 text-cyan-200" />
            </div>
            <div>
              <p className="text-xs font-semibold text-white">{isBangla ? "কী জানতে চান?" : "What can I help you with?"}</p>
              <p className="mt-1 text-[9px] text-slate-400">{isBangla ? "বাংলা বা ইংরেজিতে প্রশ্ন করুন" : "Ask in Bangla or English"}</p>
            </div>
            <div className="grid gap-1.5">
              {suggestions.map((suggestion) => (
                <button key={suggestion} type="button" onClick={() => void send(suggestion)} className="rounded-lg border border-white/10 bg-white/[0.045] px-2.5 py-1.5 text-left text-[9px] leading-relaxed text-slate-200 transition hover:border-cyan-300/30 hover:bg-cyan-400/10">
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : messages.map((message, index) => (
          <div key={index} className={`flex gap-2 ${message.role === "user" ? "flex-row-reverse" : ""}`}>
            <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${message.role === "user" ? "bg-blue-500" : "bg-gradient-to-br from-cyan-400/30 to-violet-500/30 text-cyan-100"}`}>
              {message.role === "user" ? <UserRound className="h-3 w-3 text-white" /> : <Bot className="h-3 w-3" />}
            </span>
            <div className={`max-w-[85%] rounded-xl px-2.5 py-2 text-[10px] leading-relaxed ${message.role === "user" ? "bg-blue-600 text-white" : "border border-white/[0.08] bg-white/[0.06] text-slate-100"}`}>
              {message.role === "assistant"
                ? <div className="prose prose-xs prose-invert max-w-none break-words"><ReactMarkdown>{message.content || "…"}</ReactMarkdown></div>
                : <p className="whitespace-pre-wrap">{message.content}</p>}
            </div>
          </div>
        ))}
        {busy && messages[messages.length - 1]?.content === "" && (
          <div className="flex items-center gap-2 pl-8 text-[9px] text-cyan-200"><Loader2 className="h-3 w-3 animate-spin" />{isBangla ? "উত্তর তৈরি হচ্ছে…" : "Thinking…"}</div>
        )}
      </div>
      <div className="border-t border-white/10 p-2.5">
        <form onSubmit={onSubmit} className="flex items-end gap-1.5 rounded-lg border border-white/10 bg-black/20 p-1 focus-within:border-cyan-300/40">
          <textarea ref={inputRef} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={onKeyDown} rows={1} maxLength={12000} disabled={busy} placeholder={isBangla ? "আপনার প্রশ্ন লিখুন…" : "Message CivilOS AI…"} className="max-h-20 min-h-8 flex-1 resize-y bg-transparent px-2 py-1.5 text-[11px] text-white outline-none placeholder:text-slate-500 disabled:opacity-50" aria-label={isBangla ? "আপনার বার্তা" : "Your message"} />
          <button type="submit" disabled={busy || !input.trim()} aria-label={isBangla ? "পাঠান" : "Send"} className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          </button>
        </form>
        <div className="mt-1.5 flex items-center justify-between gap-2 text-[8px] text-slate-500">
          <span>{isBangla ? "গুরুত্বপূর্ণ হিসাব যাচাই করুন" : "Verify critical calculations."}</span>
          <button type="button" onClick={clear} disabled={busy || messages.length === 0} className="inline-flex items-center gap-1 hover:text-rose-300 disabled:opacity-30"><Trash2 className="h-2.5 w-2.5" />{isBangla ? "মুছুন" : "Clear"}</button>
        </div>
      </div>
    </div>
  );
}
