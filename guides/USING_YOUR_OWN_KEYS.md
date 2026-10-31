# Use Your Own API Keys and Pay for Your Own Usage

## Short answer

Yes. If you clone this project and choose the OpenAI model, you must supply **your own OpenAI API key**. Your requests are billed to the OpenAI API account or project that owns that key.

You do **not** use the repository author's OpenAI tokens or API budget. The repository deliberately does not include anyone's real API key.

## Key vocabulary

| Term | What it means |
| --- | --- |
| **API key** | A secret credential that lets this local app make requests using your API account. Treat it like a password. |
| **Token** | A small unit of text that the model reads or writes. API usage is measured and billed using input and output tokens. |
| **API billing / credits** | The payment method, credit balance, and spending limits on your own OpenAI API account or project. |
| **Model** | The AI system selected in the app. Different models can have different usage prices. |

The OpenAI API pricing page shows the current input and output token rates. Prices can change, so always use the live page rather than an old screenshot or README number: [OpenAI API pricing](https://platform.openai.com/pricing).

## Set up OpenAI for this project

1. Create an API key in your own [OpenAI API key settings](https://platform.openai.com/api-keys).
2. Make sure your own API account/project has billing or credits configured for the usage you intend.
3. In the Terminal where you will run this project, set the key without saving it in the repository:

   ```bash
   read -s "OPENAI_API_KEY?Paste your OpenAI API key: "
   export OPENAI_API_KEY
   ```

4. Start the interface:

   ```bash
   npm run web
   ```

5. In the browser UI, select **OpenAI API** as the model.

The key exists only in that Terminal session. If you close the Terminal or open a new one, set it again.

## What gets charged?

When you choose the OpenAI provider, the app sends your messages, relevant conversation context, tool definitions, and tool results to the OpenAI API. The API reports usage for the request, and this project displays it in its token-status UI.

Your cost depends on:

- the model you select
- how much conversation/tool context is sent as input
- how long the model's answer is
- how often you make requests

This project also has a scripted practice provider. It is local, uses no OpenAI key, and costs nothing. It is useful for learning the harness flow before using a real model.

## Optional Airbnb key

The Airbnb search demonstration uses a separate HasData API key. It is optional and has its own account, credits, and terms. Set it in the same secure way:

```bash
read -s "HASDATA_API_KEY?Paste your HasData API key: "
export HASDATA_API_KEY
```

Without that key, the project still runs; it simply leaves the Airbnb MCP server disabled.

## Keep keys private

Never:

- paste a real key into a GitHub file, issue, pull request, or chat message
- commit `.env` files
- send your key to another person so they can run the project
- put a real key in `mcp_config.json` or `.env.example`

This repository's `.gitignore` excludes `.env` files and transcripts. The MCP manager also avoids passing `OPENAI_API_KEY` to third-party MCP server processes.

If you accidentally expose a key, revoke it in the provider's dashboard and create a replacement before running the project again.
