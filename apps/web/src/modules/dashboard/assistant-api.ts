import { client } from "../../shared/backend";
export interface AssistantAnswer {
  answer: string;
  model: string;
  date: string;
}
export async function askAssistant(question: string): Promise<AssistantAnswer> {
  const { data, error } = await client().functions.invoke("acemar-assistant", {
    body: { question },
  });
  if (error || !data || typeof data.answer !== "string")
    throw new Error(
      typeof data?.error === "string"
        ? data.error
        : "No se pudo consultar la IA. Revisa tu sesión y la cuota disponible antes de reintentar.",
    );
  return data as AssistantAnswer;
}
