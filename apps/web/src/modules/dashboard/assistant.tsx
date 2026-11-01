import { useState } from "react";
import { askAssistant } from "./assistant-api";
import { Sparkles, Send, RefreshCw } from "lucide-react";
import { Button } from "../../shared/components/ui/button";
import { ErrorState, Loading } from "../../shared/components/feedback";
export default function Assistant() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [source, setSource] = useState("");
  async function ask(q: string) {
    if (busy || q.trim().length < 2) return;
    setBusy(true);
    setError("");
    setAnswer("");
    setQuestion(q);
    try {
      const result = await askAssistant(q);
      setAnswer(result.answer);
      setSource(`${result.model} · Datos de ACEMAR al ${result.date}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">INFORMACIÓN PARA DECIDIR</span>
          <h1 id="page-title" tabIndex={-1}>
            Asistente
          </h1>
          <p>Consulta tus indicadores y recibe recomendaciones con Gemini.</p>
        </div>
        <span className="badge">Gemini · IA</span>
      </div>
      <section className="panel assistant">
        <div className="assistant-intro">
          <Sparkles size={40} />
          <h2>¿Qué quieres revisar?</h2>
          <p>
            Respuestas generadas con los indicadores actuales y productos con
            stock bajo.
          </p>
        </div>
        <>
          {busy && (
            <div role="status">
              <Loading />
              Consultando Gemini…
            </div>
          )}
          {error && <ErrorState error={new Error(error)} />}
          <div className="suggestions">
            {["Resumen de hoy", "Revisar stock", "Revisar créditos"].map(
              (q) => (
                <Button
                  variant="secondary"
                  key={q}
                  disabled={busy}
                  onClick={() => void ask(q)}
                >
                  {q}
                </Button>
              ),
            )}
          </div>
          {answer && (
            <div className="assistant-answer" role="status">
              <strong>{question}</strong>
              <p style={{ whiteSpace: "pre-wrap" }}>{answer}</p>
              <small>{source}</small>
            </div>
          )}
          <form
            className="assistant-input"
            onSubmit={(e) => {
              e.preventDefault();
              void ask(question);
            }}
          >
            <label className="sr-only" htmlFor="question">
              Consulta
            </label>
            <input
              id="question"
              disabled={busy}
              maxLength={500}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Pregunta por ventas, stock o créditos…"
            />
            <Button type="submit" disabled={busy || question.trim().length < 2}>
              <Send size={18} />
              {busy ? "Consultando…" : "Consultar"}
            </Button>
          </form>
          <Button
            disabled={busy}
            variant="ghost"
            onClick={() => {
              setQuestion("");
              setAnswer("");
              setError("");
            }}
          >
            <RefreshCw size={17} />
            Nueva consulta
          </Button>
        </>
      </section>
      <p className="muted small">
        Gemini recibe tu consulta, indicadores agregados y hasta diez productos
        con stock bajo. No se envían nombres de clientes, contactos ni
        credenciales. Revisa las recomendaciones antes de actuar. Límite: 20
        consultas por hora y 100 al día por administrador.
      </p>
    </>
  );
}
