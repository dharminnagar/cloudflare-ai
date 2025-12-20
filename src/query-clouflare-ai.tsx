import { ActionPanel, Action, Form, Detail, useNavigation, showToast, Toast, getPreferenceValues } from "@raycast/api";
import { useState, useEffect } from "react";

interface Preferences {
  accountId: string;
  apiToken: string;
  defaultModel: string;
}

interface AIResponse {
  result: {
    response?: string;
    choices?: Array<{ message?: { content?: string } }>;
    output?: Array<{ type?: string; content?: Array<{ text?: string; type?: string }>; role?: string }>;
  } | string | Array<{ content?: string; generated_text?: string }>;
  success: boolean;
  errors: Array<{ message: string }>;
}

interface Model {
  name: string;
  description?: string;
  task?: {
    name: string;
  };
}

interface ModelsResponse {
  result: Model[];
  success: boolean;
  errors: Array<{ message: string }>;
}

async function fetchCloudflareModels(): Promise<Array<{ title: string; value: string }>> {
  const preferences = getPreferenceValues<Preferences>();
  const { accountId, apiToken } = preferences;

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/models/search`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.status}`);
    }

    const data = (await response.json()) as ModelsResponse;

    if (!data.success) {
      throw new Error(data.errors?.[0]?.message || "Failed to fetch models");
    }

    // Filter for text generation models and format for dropdown
    return data.result
      .filter((model) => model.task?.name === "Text Generation" || model.name.includes("llama") || model.name.includes("mistral"))
      .map((model) => ({
        title: formatModelName(model.name),
        value: model.name,
      }));
  } catch (error) {
    console.error("Error fetching models:", error);
    // Return fallback models if API fails
    return [
      { title: "Llama 3.1 8B Instruct", value: "@cf/meta/llama-3.1-8b-instruct" },
      { title: "Llama 3.1 70B Instruct", value: "@cf/meta/llama-3.1-70b-instruct" },
      { title: "Mistral 7B Instruct", value: "@cf/mistral/mistral-7b-instruct-v0.1" },
    ];
  }
}

function formatModelName(name: string): string {
  // Convert @cf/meta/llama-3.1-8b-instruct to "Llama 3.1 8B Instruct"
  const parts = name.split("/");
  const modelName = parts[parts.length - 1];
  return modelName
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

async function queryCloudflareAI(prompt: string, model: string): Promise<string> {
  const preferences = getPreferenceValues<Preferences>();
  const { accountId, apiToken } = preferences;

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;

  // Determine the request body format based on model type
  let requestBody: object;
  
  if (model.includes("gpt-oss")) {
    // GPT-OSS models use "input" field which can be string or array
    requestBody = {
      input: [
        {
          role: "user",
          content: prompt,
        },
      ],
    };
  } else if (model.includes("llama") || model.includes("mistral") || model.includes("granite") || 
             model.includes("qwen") || model.includes("gemma") || model.includes("phi")) {
    // Chat models use "messages" array
    requestBody = {
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    };
  } else {
    // Other models might use "prompt" string
    requestBody = {
      prompt: prompt,
    };
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as AIResponse;

    if (!data.success) {
      throw new Error(data.errors?.[0]?.message || "Unknown error occurred");
    }

    // Handle different response formats from different models
    const result = data.result;
    
    // Format 1: result.response (Qwen, Llama, Mistral and most models)
    if (typeof result === "object" && result !== null && "response" in result && result.response) {
      return result.response;
    }
    
    // Format 2: OpenAI Responses API format (e.g., GPT-OSS models)
    if (typeof result === "object" && result !== null && "output" in result && Array.isArray(result.output)) {
      // Find the message type output with assistant role
      const messageOutput = result.output.find(
        (item: { type?: string; role?: string }) => item.type === "message" && item.role === "assistant"
      );
      if (messageOutput && Array.isArray(messageOutput.content)) {
        const textContent = messageOutput.content.find(
          (c: { type?: string; text?: string }) => c.type === "output_text" && c.text
        );
        if (textContent && textContent.text) {
          return textContent.text;
        }
      }
    }
    
    // Format 3: OpenAI-style chat completion (e.g., Granite models)
    if (typeof result === "object" && result !== null && "choices" in result && Array.isArray(result.choices)) {
      const content = result.choices?.[0]?.message?.content;
      if (content) {
        return content;
      }
    }
    
    // Format 4: result as string directly
    if (typeof result === "string") {
      return result;
    }
    
    // Format 5: result as array with content/generated_text
    if (Array.isArray(result) && result.length > 0) {
      const firstResult = result[0];
      if (typeof firstResult === "object" && firstResult !== null) {
        if ("content" in firstResult && firstResult.content) {
          return firstResult.content;
        }
        if ("generated_text" in firstResult && firstResult.generated_text) {
          return firstResult.generated_text;
        }
      }
    }
    
    // Fallback: Log the structure and return stringified result for debugging
    console.error("Unknown response format:", JSON.stringify(result, null, 2));
    return JSON.stringify(result, null, 2);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to query Cloudflare AI: ${error.message}`);
    }
    throw new Error("Failed to query Cloudflare AI: Unknown error");
  }
}

function ResponseView({ prompt, response, model }: { prompt: string; response: string; model: string }) {
  const markdown = "# " + model + "\n\n## Prompt\n" + prompt + "\n\n## Response\n" + response;

  return (
    <Detail
      markdown={markdown}
      actions={
        <ActionPanel>
          <Action.CopyToClipboard content={response} title="Copy Response" />
          <Action.CopyToClipboard content={markdown} title="Copy Full Conversation" />
        </ActionPanel>
      }
    />
  );
}

export default function Command() {
  const preferences = getPreferenceValues<Preferences>();
  const { push } = useNavigation();
  const [isLoading, setIsLoading] = useState(false);
  const [models, setModels] = useState<Array<{ title: string; value: string }>>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(true);

  useEffect(() => {
    async function loadModels() {
      try {
        const fetchedModels = await fetchCloudflareModels();
        setModels(fetchedModels);
      } catch (error) {
        showToast({
          style: Toast.Style.Failure,
          title: "Failed to load models",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      } finally {
        setIsLoadingModels(false);
      }
    }
    loadModels();
  }, []);

  async function handleSubmit(values: { prompt: string; model: string }) {
    if (!values.prompt.trim()) {
      showToast({
        style: Toast.Style.Failure,
        title: "Error",
        message: "Please enter a prompt",
      });
      return;
    }

    setIsLoading(true);
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Querying Cloudflare AI...",
    });

    try {
      const response = await queryCloudflareAI(values.prompt, values.model);

      toast.style = Toast.Style.Success;
      toast.title = "Response received";

      push(<ResponseView prompt={values.prompt} response={response} model={values.model} />);
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Failed to query AI";
      toast.message = error instanceof Error ? error.message : "Unknown error";
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Form
      isLoading={isLoading || isLoadingModels}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Query AI" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.TextArea
        id="prompt"
        title="Prompt"
        placeholder="Enter your question or prompt..."
        autoFocus
      />
      <Form.Dropdown id="model" title="Model" defaultValue={preferences.defaultModel}>
        {models.map((model) => (
          <Form.Dropdown.Item key={model.value} value={model.value} title={model.title} />
        ))}
      </Form.Dropdown>
    </Form>
  );
}
