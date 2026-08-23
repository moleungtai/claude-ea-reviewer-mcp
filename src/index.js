import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";
import OpenAI from "openai";

function createServer(env) {
  const server = new McpServer({
    name: "claude-ea-reviewer-mcp",
    version: "1.0.0",
  });

  server.registerTool(
    "review_ea_code",
    {
      title: "Review MQL5 EA Code",
      description:
        "Send MQL5/MT5 Expert Advisor source code to OpenAI for an independent technical, trading-strategy and risk review.",
      inputSchema: {
        code: z.string().describe("Complete MQL5 EA source code"),
        request: z
          .string()
          .optional()
          .describe(
            "Optional instructions about what should be reviewed or investigated"
          ),
      },
    },
    async ({ code, request }) => {
      if (!env.OPENAI_API_KEY) {
        return {
          content: [
            {
              type: "text",
              text: "ERROR: OPENAI_API_KEY is not configured.",
            },
          ],
          isError: true,
        };
      }

      const openai = new OpenAI({
        apiKey: env.OPENAI_API_KEY,
      });

      const prompt = `
You are an independent senior MQL5 Expert Advisor reviewer,
quantitative trading-system analyst and risk-control specialist.

Another AI, usually Claude, may have written or modified this EA.

Your job is NOT to agree automatically with the other AI.
Act as an independent second reviewer.

Review the supplied MQL5 Expert Advisor carefully.

Focus on:

1. EA trading logic and entry logic
2. Exit / TP / SL logic
3. Grid, martingale and recovery behaviour
4. Hedging behaviour
5. Position sizing and lot escalation
6. Maximum drawdown risk
7. Runaway order / duplicate order risks
8. Trend-market failure scenarios
9. Range-market behaviour
10. Spread, slippage and execution risks
11. Group TP / basket closing logic
12. Recovery logic
13. Trading-session filters
14. Indicator implementation
15. MQL5 coding errors or suspicious logic
16. Possible bugs
17. Logical conflicts between different modules
18. Long-term survivability
19. Backtest risks and overfitting
20. Improvements that Claude should consider

Do not rewrite the whole EA unless specifically requested.

Clearly separate:

- CRITICAL PROBLEMS
- HIGH-RISK ISSUES
- BUGS / CODE ISSUES
- TRADING LOGIC REVIEW
- RISK MANAGEMENT REVIEW
- POSITIVE FEATURES
- RECOMMENDED CHANGES
- FINAL SCORE / 10
- MESSAGE TO CLAUDE

Be precise and technical.

User / Claude additional request:
${request || "Perform a complete independent review."}

MQL5 EA CODE:

${code}
`;

      try {
        const response = await openai.responses.create({
          model: "gpt-5.6",
          input: prompt,
        });

        return {
          content: [
            {
              type: "text",
              text:
                response.output_text ||
                "OpenAI completed the request but returned no text.",
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `OpenAI API ERROR: ${
                error instanceof Error ? error.message : String(error)
              }`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  return server;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Simple health check
    if (url.pathname === "/") {
      return new Response(
        JSON.stringify(
          {
            status: "online",
            service: "Claude EA Reviewer MCP",
            mcp_endpoint: "/mcp",
            openai_key_configured: Boolean(env.OPENAI_API_KEY),
          },
          null,
          2
        ),
        {
          headers: {
            "content-type": "application/json; charset=UTF-8",
          },
        }
      );
    }

    // MCP endpoint
    if (url.pathname === "/mcp") {
      const handler = createMcpHandler(
        () => createServer(env),
        {
          route: "/mcp",
        }
      );

      return handler(request, env, ctx);
    }

    return new Response("Not Found", {
      status: 404,
    });
  },
};
