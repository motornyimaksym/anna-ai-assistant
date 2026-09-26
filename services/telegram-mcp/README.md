# Private Telegram MCP bridge

Pinned source: [chigwell/telegram-mcp](https://github.com/chigwell/telegram-mcp/tree/b0222305aa7b6a6ce8711f5b4e20a78ecd12bd44). Do not replace this with the unrelated `telegram-mcp` package on PyPI.

The Node API authenticates using a Google service identity token. Cloud Run IAM must require authentication; grant invocation only to the Firebase API runtime service account. No CORS or Hosting rewrite. The bridge accepts session material only over this authenticated server-to-server connection, converts it in memory, then launches a short-lived MCP stdio process. Only six tools are registered. The application API, not MCP/model instructions, enforces explicit send confirmation. Do not grant end users direct invocation.

After explicit deployment authorization, build this directory as a container and deploy privately:

```sh
gcloud run deploy telegram-mcp-bridge --source services/telegram-mcp \
  --project anna-ai-assistant --region europe-west1 \
  --no-allow-unauthenticated --concurrency 1 --max-instances 1 \
  --memory 512Mi --timeout 45
```

Get the API runtime service account with `gcloud functions describe api --gen2 --region europe-west1 --project anna-ai-assistant --format='value(serviceConfig.serviceAccountEmail)'`. Grant that identity `roles/run.invoker` on this bridge. Set `TELEGRAM_MCP_BRIDGE_URL` to the returned HTTPS origin when preparing/deploying the Firebase API. Do not set a URL path or trailing slash. Existing Telegram secrets and connected account remain in the Node API, not container configuration.

The existing Firestore account lease serializes use with schedule import/login; each tool finishes within 35 seconds (bridge subprocess timeout 30 seconds), below the lease's 50 seconds. IAM token acquisition should be warmed through normal service credentials. All subprocess stderr and upstream file logging are suppressed. Session directories are temporary. Entity caches are rebuilt in memory from up to 1,000 dialogs, so accounts with larger archives may require usernames or further integration work. Writes use numeric resolved recipients and plain text. Upstream positive acknowledgement is checked exactly against the pinned version; ambiguous results are never automatically retried.

Local checks (no Telegram connection or sends): create a virtual environment, `pip install -r requirements.txt`, then `python -m unittest discover -s services/telegram-mcp -p 'test_*.py'` from the repo root using that environment. Run `uvicorn bridge:app` only on a trusted local interface during development; Cloud Run IAM protects the deployed endpoint.
