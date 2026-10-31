import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, Send, RefreshCw } from "lucide-react";
import { rpc } from "../../shared/backend";
import { money } from "../../shared/money";
import { Button } from "../../shared/components/ui/button";
import { ErrorState, Loading } from "../../shared/components/feedback";
export default function Assistant() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
  }).format(new Date());
  const data = useQuery({
    queryKey: ["assistant-summary", today],
    queryFn: () =>
      rpc<Record<string, number>>("acemar_summary", {
        p_from: today,
        p_to: today,
      }),
  });
  function ask(q: string) {
    if (!data.data) return;
    setQuestion(q);
    const d = data.data;
    setAnswer(
      q.toLowerCase().includes("stock") ||
        q.toLowerCase().includes("inventario")
        ? `Hay ${d.low_stock} productos en el mínimo o por debajo. Revisa Existencias para identificar cuáles necesitan reposición. Esta regla no estima demanda futura.`
        : q.toLowerCase().includes("crédito")
          ? `La deuda pendiente total es ${money(d.debt_total)}. Revisa el detalle de clientes antes de autorizar nuevas operaciones.`
          : `Hoy se registraron ${d.sales_count} ventas por ${money(d.sales_total)}. Ventas al contado: ${money(d.cash_sales)}. Abonos recibidos: ${money(d.payments_total)}. No son una medida de utilidad.`,
    );
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">INFORMACIÓN PARA DECIDIR</span>
          <h1 id="page-title" tabIndex={-1}>
            Asistente
          </h1>
          <p>Consulta indicadores y recomendaciones basadas en reglas.</p>
        </div>
        <span className="badge">Modo local · Reglas</span>
      </div>
      <section className="panel assistant">
        <div className="assistant-intro">
          <Sparkles size={40} />
          <h2>¿Qué quieres revisar?</h2>
          <p>
            Respuestas construidas con los indicadores actuales del negocio.
          </p>
        </div>
        {data.isPending ? (
          <Loading />
        ) : data.error ? (
          <ErrorState error={data.error} retry={() => void data.refetch()} />
        ) : (
          <>
            <div className="suggestions">
              {["Resumen de hoy", "Revisar stock", "Revisar créditos"].map(
                (q) => (
                  <Button variant="secondary" key={q} onClick={() => ask(q)}>
                    {q}
                  </Button>
                ),
              )}
            </div>
            {answer && (
              <div className="assistant-answer" role="status">
                <strong>{question}</strong>
                <p>{answer}</p>
                <small>Fuente: registros de ACEMAR · {today}</small>
              </div>
            )}
            <form
              className="assistant-input"
              onSubmit={(e) => {
                e.preventDefault();
                ask(question);
              }}
            >
              <label className="sr-only" htmlFor="question">
                Consulta
              </label>
              <input
                id="question"
                maxLength={500}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Pregunta por ventas, stock o créditos…"
              />
              <Button type="submit" disabled={!question.trim()}>
                <Send size={18} />
                Consultar
              </Button>
            </form>
            <Button
              variant="ghost"
              onClick={() => {
                setQuestion("");
                setAnswer("");
              }}
            >
              <RefreshCw size={17} />
              Nueva consulta
            </Button>
          </>
        )}
      </section>
      <p className="muted small">
        La consulta a Gemini no está configurada. Este modo no utiliza un modelo
        de IA ni envía datos fuera del sistema.
      </p>
    </>
  );
}
