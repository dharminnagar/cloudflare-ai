import { ActionPanel, Action, Form, Detail, useNavigation, showToast, Toast, getPreferenceValues } from "@raycast/api";
import { useState } from "react";

interface Preferences {
  accountId: string;
  apiToken: string;
  defaultModel: string;
}

interface AIResponse {
  result: {
    response: string;
  };
  success: boolean;
  errors: Array<{ message: string }>;
}

const MODELS = [
  { title: "Llama 3.1 8B Instruct", value: "@cf/meta/llama-3.1-8b-instruct" },
  { title: "Llama 3.1 70B Instruct", value: "@cf/meta/llama-3.1-70b-instruct" },
  { title: "Mistral 7B Instruct", value: "@cf/mistral/mistral-7b-instruct-v0.1" },
  { title: "Qwen 1.5 14B Chat", value: "@cf/qwen/qwen1.5-14b-chat-awq" },
];

async function queryCloudflareAI(prompt: string, model: string): Promise<string> {
  const preferences = getPreferenceValues<Preferences>();
  const { accountId, apiToken } = preferences;

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as AIResponse;

    if (!data.success) {
      throw new Error(data.errors?.[0]?.message || "Unknown error occurred");
    }

    return data.result.response;
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
      isLoading={isLoading}
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
        {MODELS.map((model) => (
          <Form.Dropdown.Item key={model.value} value={model.value} title={model.title} />
        ))}
      </Form.Dropdown>
    </Form>
  );
}
