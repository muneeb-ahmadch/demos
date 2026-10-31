# Relay public showcase

An additive portfolio example for AI automation buyers. Static HTML/CSS/JavaScript; no build step, credentials, browser storage, model requests or platform writes.

The interactive reviewer walkthrough uses synthetic examples. The supported draft and source excerpt come from the saved hosted-model application acceptance run. Its approval and receipt transitions are simulated. The recovery example illustrates the service's rate-limit behaviour: HubSpot retries while the already completed Slack handoff remains at one attempt.

`assets/console.png` is an unchanged real application screenshot. `assets/cover.png` is browser-rendered original HTML artwork (source: `stage2/portfolio-set/relay.html`, updated 31 Oct 2026). Both use synthetic business data. The application itself uses local sandbox receipts; separate MCP test-workspace writes were verified independently.

`downloads/` includes the actual credential-free n8n workflow exports and a scoped summary of recorded verification. The exports require the Relay backend and separately configured credentials. They are not standalone n8n agent templates.

Public route: `https://muneeb-ahmadch.github.io/demos/relay-ai-automation/`.

The main personal site links this page from its existing Demos section. Existing RAG positioning, hero, service packages and experiments remain in place.
