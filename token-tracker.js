/**
 * A local estimate for learning and UI feedback. Real model providers should
 * replace this with the exact usage numbers returned by their APIs.
 */
export class TokenTracker {
  constructor() {
    this.sessionInputTokens = 0;
    this.sessionOutputTokens = 0;
    this.sessionCachedInputTokens = 0;
    this.providerCalls = 0;
    this.providerReportedCalls = 0;
  }

  estimateText(text) {
    const words = text.trim().split(/\s+/).filter(Boolean).length;

    if (words === 0) {
      return 0;
    }

    // A rough English-text estimate. It is deliberately shown as approximate.
    return Math.ceil(words * 1.3);
  }

  estimateMessage(message) {
    const messageOverhead = 4;
    const toolNameOverhead = message.name ? 2 : 0;

    return (
      messageOverhead +
      toolNameOverhead +
      this.estimateText(message.content)
    );
  }

  estimateContext(messages) {
    const byRole = {
      user: 0,
      assistant: 0,
      tool: 0,
    };

    for (const message of messages) {
      const estimate = this.estimateMessage(message);
      byRole[message.role] = (byRole[message.role] ?? 0) + estimate;
    }

    return {
      total: Object.values(byRole).reduce((total, value) => total + value, 0),
      byRole,
    };
  }

  recordProviderCall(messages, responseText, providerUsage) {
    const hasProviderUsage =
      Number.isFinite(providerUsage?.inputTokens) &&
      Number.isFinite(providerUsage?.outputTokens);

    if (hasProviderUsage) {
      this.sessionInputTokens += providerUsage.inputTokens;
      this.sessionOutputTokens += providerUsage.outputTokens;
      this.sessionCachedInputTokens += providerUsage.cachedInputTokens || 0;
      this.providerReportedCalls += 1;
    } else {
      this.sessionInputTokens += this.estimateContext(messages).total;
      this.sessionOutputTokens += this.estimateText(responseText) + 4;
    }

    this.providerCalls += 1;
  }

  getStatus(messages) {
    const context = this.estimateContext(messages);

    let method = "estimated from local text; not provider-reported usage";

    if (this.providerReportedCalls === this.providerCalls && this.providerCalls > 0) {
      method = "provider-reported usage from the API";
    } else if (this.providerReportedCalls > 0) {
      method = "mixed: API-reported usage plus local estimates";
    }

    return {
      method,
      context,
      session: {
        providerCalls: this.providerCalls,
        inputTokens: this.sessionInputTokens,
        outputTokens: this.sessionOutputTokens,
        cachedInputTokens: this.sessionCachedInputTokens,
        totalTokens: this.sessionInputTokens + this.sessionOutputTokens,
      },
    };
  }
}
