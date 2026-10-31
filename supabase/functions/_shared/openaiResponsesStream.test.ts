import { describe, expect, it } from "vitest";
import { toChatCompletionStream } from "./openaiResponsesStream";

const encoder = new TextEncoder();

async function readAll(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let output = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    output += decoder.decode(value, { stream: true });
  }
  return output;
}

describe("toChatCompletionStream", () => {
  it("maps Responses text deltas to the existing chat chunk format", async () => {
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(
          'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"Hello"}\n\n' +
          'event: response.completed\ndata: {"type":"response.completed"}\n\n',
        ));
        controller.close();
      },
    });

    const output = await readAll(toChatCompletionStream(source, "gpt-5.5"));
    expect(output).toContain('"content":"Hello"');
    expect(output).toContain('"object":"chat.completion.chunk"');
    expect(output).toContain("data: [DONE]");
  });

  it("handles fragmented SSE events", async () => {
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"type":"response.output_text.'));
        controller.enqueue(encoder.encode('delta","delta":"Bangla"}\n\n'));
        controller.enqueue(encoder.encode('data: {"type":"response.completed"}\n\n'));
        controller.close();
      },
    });

    const output = await readAll(toChatCompletionStream(source, "gpt-5.5"));
    expect(output).toContain('"content":"Bangla"');
  });
});
