/**
 * Adapts OpenAI Responses API SSE events to the Chat Completions-style chunks
 * already consumed by the CivilOS AI chat clients.
 */
export function toChatCompletionStream(
  source: ReadableStream<Uint8Array>,
  model: string,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const decoderStream = new TextDecoderStream();
  const reader = source.pipeThrough(decoderStream).getReader();
  const id = `civilos-${Date.now().toString(36)}`;
  const created = Math.floor(Date.now() / 1000);
  let buffer = "";
  let eventData: string[] = [];
  let finished = false;

  const chunk = (content: string) => ({
    id,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [{ index: 0, delta: { content }, finish_reason: null }],
  });

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (finished) {
        controller.close();
        return;
      }

      const emit = (value: string) => controller.enqueue(encoder.encode(value));
      const dispatch = (data: string) => {
        if (!data || data === "[DONE]") return;
        let event: Record<string, unknown>;
        try {
          event = JSON.parse(data);
        } catch {
          return;
        }

        if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
          emit(`data: ${JSON.stringify(chunk(event.delta))}\n\n`);
        } else if (event.type === "response.refusal.delta" && typeof event.delta === "string") {
          emit(`data: ${JSON.stringify(chunk(event.delta))}\n\n`);
        } else if (event.type === "response.failed" || event.type === "error") {
          const message = "The AI provider could not complete this response. Please try again.";
          emit(`data: ${JSON.stringify(chunk(message))}\n\n`);
          emit("data: [DONE]\n\n");
          finished = true;
        } else if (event.type === "response.completed") {
          emit("data: [DONE]\n\n");
          finished = true;
        }
      };

      while (!finished) {
        const { value, done } = await reader.read();
        if (done) {
          const remaining = buffer.split("\n");
          for (const line of remaining) {
            if (line.startsWith("data:")) eventData.push(line.slice(5).trimStart());
          }
          dispatch(eventData.join("\n"));
          if (!finished) emit("data: [DONE]\n\n");
          finished = true;
          controller.close();
          return;
        }

        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const rawLine of lines) {
          const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
          if (line === "") {
            dispatch(eventData.join("\n"));
            eventData = [];
            if (finished) break;
          } else if (line.startsWith("data:")) {
            eventData.push(line.slice(5).trimStart());
          }
        }
        // Return control to the consumer after each upstream read to keep the
        // stream responsive without buffering the complete model response.
        if (controller.desiredSize !== null && controller.desiredSize <= 0) return;
      }
      if (finished) controller.close();
    },
    async cancel(reason) {
      finished = true;
      await reader.cancel(reason).catch(() => undefined);
    },
  });
}
