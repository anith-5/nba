import { useState, useRef, useEffect } from "react";
import { api } from "../api.js";

const EXAMPLE_QUESTIONS = [
  "Which teams have the most cap space heading into the offseason?",
  "Find me a stretch big from Europe who fits a pace-and-space system",
  "What happens to a team's identity when they lose their starting center to injury?",
  "Explain the second apron rules and who's affected this season",
  "Which current player has the best clutch shooting stats in the NBA?",
  "What lineup should a team run in the last 2 minutes of a close game?",
];

function Message({ msg }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      <div className={`h-8 w-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold ${
        isUser ? "bg-court/20 text-court" : "bg-slate-700 text-white"
      }`}>
        {isUser ? "GM" : "🏀"}
      </div>
      <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
        isUser
          ? "bg-court/15 text-slate-100 rounded-tr-sm"
          : "bg-slate-800 text-slate-200 rounded-tl-sm"
      }`}>
        {msg.content.split("\n").map((line, i) => (
          line ? <p key={i} className="mb-1 last:mb-0">{line}</p> : <br key={i} />
        ))}
      </div>
    </div>
  );
}

export default function GMAssistant() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send(text) {
    const msg = text || input.trim();
    if (!msg) return;
    setInput("");
    setError(null);

    const newMessages = [...messages, { role: "user", content: msg }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const history = newMessages.slice(0, -1).map(m => ({ role: m.role, content: m.content }));
      const data = await api.gmChat({ message: msg, history });
      setMessages([...newMessages, { role: "assistant", content: data.reply }]);
    } catch (e) {
      setError(e.message);
      setMessages(newMessages.slice(0, -1));
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleKey(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  const showExamples = messages.length === 0 && !loading;

  return (
    <div className="animate-fade-in flex flex-col h-[calc(100vh-8rem)]">
      <header className="flex-shrink-0 mb-4">
        <h1 className="text-3xl font-bold text-white">GM Assistant</h1>
        <p className="mt-1 text-slate-400">
          Ask anything about NBA teams, trades, cap space, player value, or strategy — powered by Claude.
        </p>
      </header>

      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        {showExamples && (
          <div className="space-y-3">
            <p className="stat-label">Example questions</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {EXAMPLE_QUESTIONS.map((q, i) => (
                <button
                  key={i}
                  onClick={() => send(q)}
                  className="card-hover p-3 text-left text-sm text-slate-300 hover:text-white"
                >
                  {q}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-600 mt-4">
              Requires ANTHROPIC_API_KEY in services/api/.env. Context includes current season standings and stats.
            </p>
          </div>
        )}

        {messages.map((m, i) => <Message key={i} msg={m} />)}

        {loading && (
          <div className="flex gap-3">
            <div className="h-8 w-8 rounded-full bg-slate-700 flex items-center justify-center text-xs">🏀</div>
            <div className="bg-slate-800 rounded-2xl rounded-tl-sm px-4 py-3">
              <div className="flex gap-1">
                <span className="h-2 w-2 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="h-2 w-2 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="h-2 w-2 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {error && (
        <div className="flex-shrink-0 mt-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <p className="text-amber-300 text-sm">{error}</p>
          {error.includes("ANTHROPIC_API_KEY") && (
            <p className="text-slate-500 text-xs mt-1">
              Add <code className="bg-slate-800 px-1 rounded">ANTHROPIC_API_KEY=sk-ant-...</code> to{" "}
              <code className="bg-slate-800 px-1 rounded">services/api/.env</code> and restart.
            </p>
          )}
        </div>
      )}

      <div className="flex-shrink-0 mt-3 flex gap-2">
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Ask the GM Assistant anything…"
          rows={2}
          className="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white placeholder-slate-600 resize-none focus:outline-none focus:border-court/50"
        />
        <button
          onClick={() => send()}
          disabled={!input.trim() || loading}
          className="btn-primary px-5 self-end rounded-xl"
        >
          Send
        </button>
      </div>
      <p className="text-xs text-slate-700 mt-1 text-center">Enter to send · Shift+Enter for newline</p>
    </div>
  );
}
