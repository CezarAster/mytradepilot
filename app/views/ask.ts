// Ask Claude: a static page. The MCP setup steps and the tool list are filled in by the MCP server's author
// at the two placeholders below.
import type { View } from '../main.ts';

export const view: View = { title: 'Ask Claude', render };

function render(root: HTMLElement): () => void {
  root.innerHTML = `
    <section class="page-head">
      <h1>Ask Claude</h1>
      <p class="lede">Claude can read this app through a small MCP server that runs on your computer, using your own Claude subscription. Nothing is sent to MyTradePilot.</p>
    </section>
    <section class="panel prose">
      <h2>What this is</h2>
      <p>
        MCP (Model Context Protocol) is how Claude connects to tools on your machine. The Referee ships an MCP server that exposes
        what this app shows: your rules, today's state, the next-trade panel, your breaches, your record and the log. You connect it once in
        Claude Desktop or Claude Code, then ask questions in plain English, such as "what does my record say about a 4th trade today" or
        "which rule did I break most this month".
      </p>
      <p>
        Claude reads. It does not place orders, change your rules or touch enforcement. Every number it quotes is your own record, and every
        rule it cites is one you wrote. The wording is the same as here: your rule says, your record shows.
      </p>
      <p class="muted">You need a Claude subscription that includes Claude Desktop or Claude Code with MCP support. The service must be running on this computer while you ask.</p>
    </section>
    <section class="panel prose">
      <h2>Set up</h2>
      <!-- MCP_SETUP -->
    </section>
    <section class="panel prose">
      <h2>What Claude can see</h2>
      <!-- MCP_TOOLS -->
    </section>`;
  return () => undefined;
}
