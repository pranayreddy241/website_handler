# Lovable Platform Example

This repository contains a simple demonstration of an AI‑powered website generator that integrates with Lovable’s *Build with URL* feature.  It accepts a textual description or reference URL, combines that input with a set of design guidelines and feedback, and produces a shareable link that can be opened in Lovable to view a generated website.  It also supports iterative feedback loops so users can refine their sites until satisfied.

## Structure

  - `backend` – a minimal Node.js HTTP server (built with the native `http` module) that exposes three endpoints:
    - `GET /api/knowledge-base` – returns the design guidelines.
    - `POST /api/generate` – accepts a description (and optional URL) and returns a `sessionId` and a Lovable build link.
    - `POST /api/feedback` – accepts a feedback message and regenerates the build link for the same session.
  Sessions are stored in memory; in a production system you would use a database.
- `frontend` – a static HTML page (`index.html`) with vanilla JavaScript to call the backend APIs, display the generated link, and collect user feedback.  It also lists the design guidelines from the knowledge base.
- `backend/knowledgeBase.json` – a collection of design guidelines distilled from research on web‑design best practices (golden ratio, Hick’s law, Fitts’s law, Gestalt principles, etc.)【334394252146945†L93-L109】【624131682342355†L304-L317】.

## Running the example

1. **Start the backend server.**  From the `backend` directory, run:

   ```sh
   node server.js
   ```

   This starts the server on port 3001.

2. **Open the frontend.**  Open the file `frontend/index.html` in your browser.  This is a plain HTML file with vanilla JavaScript—there is no React or build step.  (You can also serve it via a simple HTTP server or GitHub Pages.)

3. **Generate a site.**  Enter a description (and optionally a source URL) and click **Generate Website**.  The frontend will call the backend to create a session and receive a Lovable build link.  Open that link in a new tab to see the generated site.

4. **Iterate with feedback.**  After reviewing the site, enter feedback (e.g., “make the header bigger”) and click **Send Feedback & Regenerate**.  The backend appends your feedback to the prompt and returns a new Lovable link.  Repeat until satisfied.

## Notes

- The `extractContentFromUrl` function in `server.js` is a stub; network access is disabled in this environment, so it returns an empty string.  In a real system you would fetch and summarise the content of the provided URL.
- The `buildLovableUrl` function constructs a URL of the form `https://lovable.dev/build?prompt=...`.  Lovable’s official API may require additional parameters or authentication; adjust this function accordingly.
- Unique session IDs are generated using Node’s built‑in `crypto.randomUUID()` because external packages cannot be installed offline.

This demo is intended to illustrate how you could wire together a user interface, a simple server, and the Lovable API for an iterative site‑building workflow.