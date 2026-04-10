# 🤖 Model Context Protocol (MCP) Integration

CSM includes a built-in **MCP Server** that allowed AI agents (like Claude Desktop, Cursor, or Gemini) to interact directly with your workflows. This turns CSM from a manual orchestration tool into an AI-powered operational brain.

---

## 🚀 How it Works
The MCP server in CSM exposes your existing workflows as **Tools** that an AI model can call. 
If you have a workflow named `Deploy Staging`, the AI can:
1.  **Discover**: See that `Deploy Staging` exists and what inputs it requires.
2.  **Execute**: Trigger the workflow with specific parameters based on your conversation.
3.  **Monitor**: Track the logs and status of the execution to report back to you.

## 🔌 Connection Details

To connect an external AI tool to CSM, use the following settings:

| Setting | Value |
| :--- | :--- |
| **Transport Type** | `SSE` (Server-Sent Events) |
| **Endpoint URL** | `http://<your-csm-domain>/api/mcp` |
| **Auth Header** | `X-API-Key` |

### 🔑 Authentication
1.  Log in to the CSM Dashboard.
2.  Go to your **Profile** (top right) -> **API Keys**.
3.  Generate a new API Key.
4.  **CRITICAL**: Ensure you check the **"Enable MCP"** checkbox for this key.
5.  Use this key in the `X-API-Key` header of your MCP client.

## 🛠️ Available AI Tools

Once connected, the AI will have access to:

-   `list_workflows`: Fetches all available workflows with their descriptions and input requirements.
-   `run_workflow`: Executes a specific workflow.
-   `get_execution_log`: Views real-time or historical logs of an execution.
-   `schedule_workflow`: Sets up one-time or recurring schedules.
-   `get_tags`: Lists tags to help the AI filter workflows.

## 📝 Best Practices for AI
To help the AI use your workflows effectively:
-   **Add Descriptions**: Fill in the "Description" field for your workflows.
-   **Use AI Guide**: Use the **"AI Guide"** field in the Workflow settings to give specific instructions to the AI on when and how to use that specific workflow.
-   **Clear Input Labels**: Use descriptive names for your workflow inputs (e.g., `git_branch` instead of `var1`).

---

> [!TIP]
> **Example Configuration for Claude Desktop:**
> Check your CSM instance for a pre-generated configuration snippet in the **API Keys** section.
