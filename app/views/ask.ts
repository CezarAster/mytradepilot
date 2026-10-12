// Ask Claude: how to connect Claude Desktop or Claude Code to the Referee through its MCP server (src/mcp/main.ts).
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
      <p>Both setups point Claude at <code>src/mcp/main.ts</code> in your MyTradePilot folder. Replace the path with yours. The Referee must be running (<code>npm start</code>) while you ask.</p>
      <h3>Claude Code</h3>
      <pre><code>claude mcp add mytradepilot -- node /full/path/to/mytradepilot/src/mcp/main.ts</code></pre>
      <h3>Claude Desktop</h3>
      <p>Settings, Developer, Edit Config, then add this to <code>claude_desktop_config.json</code> and restart Claude Desktop:</p>
      <pre><code>{
  "mcpServers": {
    "mytradepilot": {
      "command": "node",
      "args": ["/full/path/to/mytradepilot/src/mcp/main.ts"]
    }
  }
}</code></pre>
      <p class="muted">If the Referee runs on another port, add <code>"env": { "MYTRADEPILOT_URL": "http://127.0.0.1:4343" }</code> next to <code>"args"</code>. Node 22.18 or newer must be on your PATH.</p>
      <h3>Try asking</h3>
      <ul>
        <li>"What does my record say about taking a 4th trade right now?"</li>
        <li>"Check NVDA long against my setup."</li>
        <li>"Which rule did I break most this month, and what did it cost?"</li>
        <li>"Walk me through today's trades and breaches."</li>
      </ul>
    </section>
    <section class="panel prose">
      <h2>What Claude can see</h2>
      <table class="plain">
        <thead><tr><th>Tool</th><th>What Claude gets</th></tr></thead>
        <tbody>
          <tr><td><code>get_next_trade</code></td><td>The next-trade panel: trade number of the day, blockers with clear times, context, your record lines with confidence and intervals, open positions and stops, lock status, today's totals.</td></tr>
          <tr><td><code>get_rules</code></td><td>Your rulebook, today's plan and the enforcement mode.</td></tr>
          <tr><td><code>get_record</code></td><td>The full record report: edges, leaks and every breakdown, with confidence labels.</td></tr>
          <tr><td><code>get_today</code></td><td>Today's trades, breaches and referee actions.</td></tr>
          <tr><td><code>get_trades</code></td><td>Closed trades over the last N days.</td></tr>
          <tr><td><code>get_breaches</code></td><td>Rule breaches over the last N days.</td></tr>
          <tr><td><code>get_strategy</code></td><td>Your plain-English strategy and the setup thresholds.</td></tr>
          <tr><td><code>check_setup</code></td><td>A symbol measured against your strategy right now, plus what the rules say about the next trade.</td></tr>
          <tr><td><code>declare_trade</code></td><td>Stamps "I'm taking this" for you, only when you ask Claude to declare.</td></tr>
        </tbody>
      </table>
      <p class="muted">Not exposed on purpose: changing rules, toggling enforcement, the kill switch, closing positions, and your Alpaca keys.</p>
    </section>`;
  return () => undefined;
}
