import type { OrderIntent } from "@/lib/domain";

export type ExecutionResult = {
  accepted: boolean;
  mode: "paper" | "live";
  message: string;
  providerOrderId?: string;
};

export interface ExecutionProvider {
  submit(intent: OrderIntent): Promise<ExecutionResult>;
}

export class PaperExecutionProvider implements ExecutionProvider {
  async submit(intent: OrderIntent): Promise<ExecutionResult> {
    await new Promise((resolve) => setTimeout(resolve, 240));

    return {
      accepted: true,
      mode: "paper",
      message: `${intent.action.toUpperCase()} ${intent.quantity} ${intent.ticker} recorded in paper mode`,
    };
  }
}

export class ApiExecutionProvider implements ExecutionProvider {
  async submit(intent: OrderIntent): Promise<ExecutionResult> {
    const response = await fetch("/api/execution", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(intent),
    });
    const result = (await response.json()) as ExecutionResult & {
      error?: string;
    };
    if (!response.ok) {
      return {
        accepted: false,
        mode: "paper",
        message: result.error ?? "Execution request failed",
      };
    }
    return result;
  }
}
