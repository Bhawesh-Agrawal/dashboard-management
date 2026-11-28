import { getAssistantModel, getFastModel } from "@/lib/ai/openrouter";

interface OpenRouterModelInfo {
  id: string;
  name?: string;
  supported_parameters?: string[];
}

async function main() {
  const configured = getAssistantModel();
  const fastModel = getFastModel();

  const res = await fetch("https://openrouter.ai/api/v1/models", {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    console.error(`Failed to fetch OpenRouter models (${res.status})`);
    process.exit(1);
  }

  const body = (await res.json()) as { data?: OpenRouterModelInfo[] };
  const models = body.data ?? [];

  for (const [label, modelId] of [
    ["OPENROUTER_MODEL", configured],
    ["OPENROUTER_MODEL_FAST", fastModel],
  ] as const) {
    const found = models.find((m) => m.id === modelId);
    if (!found) {
      console.log(`${label}=${modelId}: NOT FOUND in OpenRouter catalog`);
      continue;
    }
    const supportsTools = Array.isArray(found.supported_parameters)
      ? found.supported_parameters.includes("tools")
      : false;
    console.log(
      `${label}=${modelId}: supportsTools=${supportsTools} (supported_parameters=${(
        found.supported_parameters ?? []
      ).join(", ")})`
    );
  }

  const primary = models.find((m) => m.id === configured);
  if (!primary?.supported_parameters?.includes("tools")) {
    const candidates = models
      .filter((m) => m.supported_parameters?.includes("tools"))
      .slice(0, 5)
      .map((m) => m.id);
    console.warn(
      `\nWARNING: Configured OPENROUTER_MODEL (${configured}) does NOT advertise tool support.\nSet OPENROUTER_MODEL in env to a tool-capable model, e.g.: ${candidates.join(", ")}`
    );
  }
}

void main();
