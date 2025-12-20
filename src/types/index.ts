// Re-export model-specific types
export * from "./get-all-model";

// Application preferences
export interface Preferences {
  accountId: string;
  apiToken: string;
  defaultModel: string;
}

// AI Response types
export interface AIResponse {
  result:
    | {
        response?: string;
        choices?: Array<{ message?: { content?: string } }>;
        output?: Array<{ type?: string; content?: Array<{ text?: string; type?: string }>; role?: string }>;
      }
    | string
    | Array<{ content?: string; generated_text?: string }>;
  success: boolean;
  errors: Array<{ message: string }>;
}

// Model types
export interface Model {
  name: string;
  description?: string;
  task?: {
    name: string;
  };
}

export interface ModelsResponse {
  result: Model[];
  success: boolean;
  errors: Array<{ message: string }>;
}

export interface ModelDropdownItem {
  title: string;
  value: string;
}
