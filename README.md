# Lovable Platform Example

This repository contains a demonstration of an AI‑powered website generator that integrates with Lovable’s *Build with URL* feature.  It accepts a textual description or reference URL, fetches and summarises external pages, queries a search engine for inspiration, and combines those inputs with a set of design guidelines and your feedback to produce a prompt.  The resulting prompt is encoded into a shareable link that can be opened in Lovable to view a generated website.  The platform supports iterative feedback loops and even includes a basic evaluator to give you an at‑a‑glance quality score before you share the site.

## Structure

  - `backend` – a Node.js HTTP server (built with the native `http` module) that exposes several endpoints:
    - `GET /api/knowledge-base` – returns the design guidelines.
    - `POST /api/generate` – accepts a description (and optional reference URL) and returns a session identifier, a Lovable build link and a summary of the source and similar sites.  The server fetches the content of the provided URL (title, description, first paragraphs) and queries DuckDuckGo for a couple of related website titles to enrich the prompt.
    - `POST /api/feedback` – accepts a feedback message and regenerates the build link for the same session.
    - `POST /api/evaluate` – accepts a URL and returns a basic quality score and suggestions (counts headings, images and checks for responsiveness).  This can help you decide whether a site is ready before sharing it with a user.
  Sessions are stored in memory; in a production system you would persist them in a database.
- `frontend` – a static HTML page (`index.html`) with vanilla JavaScript to call the backend APIs, display the generated link, and collect user feedback.  It also lists the design guidelines from the knowledge base.
- `backend/knowledgeBase.json` – a collection of design guidelines distilled from research on web‑design best practices (golden ratio, Hick’s law, Fitts’s law, Gestalt principles, etc.)【334394252146945†L93-L109】【624131682342355†L304-L317】.

## Running the example

1. **Start the backend server.**  From the `backend` directory, run:

   ```sh
   node server.js
   ```

   This starts the server on port 3001.

2. **Open the frontend.**  Open `frontend/index.html` in your browser.  It is a static page that communicates with the backend via fetch()—no build step is required.  The interface lets you enter a description or reference URL, generates a Lovable link, displays a summary of the source and similar sites, and offers an *Evaluate Site* button to run the server’s basic quality check.

3. **Generate a site.**  Enter a description (and optionally a source URL) and click **Generate Website**.  The frontend will call the backend to create a session and receive a Lovable build link.  Open that link in a new tab to see the generated site.

4. **Iterate with feedback.**  After reviewing the site, enter feedback (e.g., “make the header bigger”) and click **Send Feedback & Regenerate**.  The backend appends your feedback to the prompt and returns a new Lovable link.  Repeat until satisfied.

## Notes

- The `extractContentFromUrl` function in `server.js` is a stub; network access is disabled in this environment, so it returns an empty string.  In a real system you would fetch and summarise the content of the provided URL.
- The `buildLovableUrl` function constructs a URL of the form `https://lovable.dev/build?prompt=...`.  Lovable’s official API may require additional parameters or authentication; adjust this function accordingly.
- Unique session IDs are generated using Node’s built‑in `crypto.randomUUID()` because external packages cannot be installed offline.

This demo is intended to illustrate how you could wire together a user interface, a simple server, and the Lovable API for an iterative site‑building workflow.