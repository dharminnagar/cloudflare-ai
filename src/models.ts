export enum ModelType {
  GPT_OSS = "gpt-oss",
  CHAT = "chat",
  TEXT_GENERATION = "text-generation",
}

export function detectModelType(model: string): ModelType {
  if (model.includes("gpt-oss")) {
    return ModelType.GPT_OSS;
  }

  if (
    model.includes("llama") ||
    model.includes("mistral") ||
    model.includes("granite") ||
    model.includes("qwen") ||
    model.includes("gemma") ||
    model.includes("phi")
  ) {
    return ModelType.CHAT;
  }

  return ModelType.TEXT_GENERATION;
}

export function buildRequestBody(prompt: string, modelType: ModelType): object {
  switch (modelType) {
    case ModelType.GPT_OSS:
      return {
        input: [
          {
            role: "user",
            content: prompt,
          },
        ],
      };

    case ModelType.CHAT:
      return {
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      };

    case ModelType.TEXT_GENERATION:
      return {
        prompt: prompt,
      };
  }
}

export function formatModelName(name: string): string {
  const parts = name.split("/");
  const modelName = parts[parts.length - 1];
  return modelName
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
