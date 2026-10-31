import { ScriptedProvider } from "./scripted-provider.js";
import { OpenAIProvider } from "./openai-provider.js";

const providerConfigs = [
  {
    id: "scripted-standard",
    label: "Scripted Standard",
    description: "A practice provider with explanatory responses.",
    style: "standard",
  },
  {
    id: "scripted-brief",
    label: "Scripted Brief",
    description: "A practice provider with shorter responses.",
    style: "brief",
  },
  {
    id: "openai",
    label: "OpenAI API",
    description: "A real OpenAI model. Requires OPENAI_API_KEY in your terminal.",
    type: "openai",
  },
];

export function listProviderModels() {
  return providerConfigs.map(({ id, label, description }) => ({
    id,
    label,
    description,
  }));
}

export function createProvider(modelId) {
  const config = providerConfigs.find((provider) => provider.id === modelId);

  if (!config) {
    throw new Error(`Unknown model: ${modelId}`);
  }

  if (config.type === "openai") {
    return new OpenAIProvider();
  }

  const provider = new ScriptedProvider({
    name: config.id,
    style: config.style,
  });

  provider.modelId = config.id;
  return provider;
}
