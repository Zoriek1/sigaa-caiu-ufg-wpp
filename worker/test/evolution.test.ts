import { describe, expect, it, vi } from "vitest";
import {
  ProviderRequestError,
  normalizeEvolutionBaseUrl,
  parseEvolutionGroups,
  sendEvolutionText,
} from "../src/evolution";

const config = {
  baseUrl: "https://evolution.example.com",
  apiKey: "secret",
  instanceName: "sigaa-caiu-ufg",
};

describe("Evolution client", () => {
  it("normalizes the base URL", () => {
    expect(normalizeEvolutionBaseUrl(" https://evolution.example.com/// ")).toBe(
      "https://evolution.example.com"
    );
  });

  it("parses and deduplicates group responses from supported shapes", () => {
    expect(
      parseEvolutionGroups({
        data: [
          { id: "123@g.us", subject: "Turma A" },
          { JID: "456@g.us", Name: "Turma B" },
          { id: "123@g.us", subject: "Turma A atualizada" },
          { id: "5511999999999@s.whatsapp.net", subject: "Contato" },
        ],
      })
    ).toEqual([
      { id: "123@g.us", name: "Turma A atualizada" },
      { id: "456@g.us", name: "Turma B" },
    ]);
  });

  it("uses the documented nested text payload", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ key: { id: "message-1" } }), {
        status: 200,
      })
    );

    await expect(
      sendEvolutionText(config, "123@g.us", "alerta", fetchMock)
    ).resolves.toBe("message-1");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://evolution.example.com/message/sendText/sigaa-caiu-ufg"
    );
    expect((init as RequestInit).headers).toMatchObject({ apikey: "secret" });
    expect(JSON.parse(String((init as RequestInit).body))).toMatchObject({
      number: "123@g.us",
      textMessage: { text: "alerta" },
    });
  });

  it("falls back to the Evolution 2.x flat text payload after a 400", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("invalid payload", { status: 400 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ messageId: "legacy-1" }), { status: 200 })
      );

    await expect(
      sendEvolutionText(config, "123@g.us", "alerta", fetchMock)
    ).resolves.toBe("legacy-1");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondInit = fetchMock.mock.calls[1][1] as RequestInit;
    expect(JSON.parse(String(secondInit.body))).toMatchObject({
      number: "123@g.us",
      text: "alerta",
    });
  });

  it("classifies 5xx responses as retryable", async () => {
    const fetchMock = vi.fn(async () =>
      new Response("origin unavailable", { status: 503 })
    );

    const error = await sendEvolutionText(
      config,
      "123@g.us",
      "alerta",
      fetchMock
    ).catch((caught) => caught);

    expect(error).toBeInstanceOf(ProviderRequestError);
    expect(error.retryable).toBe(true);
    expect(error.status).toBe(503);
  });
});
