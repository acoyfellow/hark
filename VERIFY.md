# Verify the demo build

Everything here runs locally against fakes. Nothing calls real Cloudflare or a real MCP server.

## Run it

```sh
bun run check
node scripts/verify-demo.mjs
```

`verify-demo.mjs` starts its own wrangler dev on port 8795 (state in `/tmp/hark-loop/verify-state`), `scripts/fake-ax-mcp.mjs` on 8798, and `scripts/fake-cloudflare.mjs` on 8799 if nothing is there. It writes `receipts/demo-verify.json` and `receipts/shots/workspace-desktop.png`, and exits 0 only if every check passes. The first run after a Dockerfile change rebuilds the computer image and takes a few minutes.

If a run fails with `Address already in use`, kill leftovers first:

```sh
lsof -ti tcp:8795,9333,8798 | xargs kill -9
```

## What each check proves

| Check | How |
| --- | --- |
| No `cf_voice_messages` error on a fresh or reused Durable Object | Wakes hark on a fresh state dir, reloads, wakes again, reads the page for the error |
| Any MCP server connects, list is names only | `mcp connect` to the fake, `mcp list` has no schemas |
| OAuth server goes to authenticating with a link in Settings | Cmd K, Tools, finds Sign in; the link has PKCE S256, `redirect_uri` on `http://127.0.0.1:<port>/callback`, and `resource` equal to the server's origin |
| Finishing sign-in makes it ready with tools | Follows the link through the fake's authorize, then `mcp list` shows `jira_get_issue, request_person`; `mcp describe` returns one schema |
| A call carries the bearer token and the origin resource | The fake refuses tokens whose resource is not its origin and logs each authorized `tools/call` |
| A redirect off the allowlist fails clearly | The fake's authorize answers 400 "not on the allowlist" |
| An expired token goes back to authenticating | The fake drops all tokens; the next call answers "sign in again, the link is in Settings" |
| The coding workspace works | Opens Your computer, sees `demo/hello.js` in the tree, reads it in the code view, types `echo hark-terminal-$((40+2))` into the live terminal and sees `hark-terminal-42` |
| `open_computer` opens the workspace by voice | Calls the tool and sees the file in the code view |

## Try it yourself

`bun run dev`, open http://127.0.0.1:8790, tap the ear, then:

- Press the terminal icon in the header, or Cmd K, Tools, Open the workspace, or say "open my computer".
- Cmd K, Tools, paste any MCP URL, Connect. If it needs OAuth, press Sign in on its row.

## Not covered here

- Interrupting `run_code` in the middle of an `mcp_call`. The turn's signal is passed to `mcp.callTool` and the bench refuses new `mcp_call`s after an interrupt, but no check drives a real interruption.
- The e2e suite. Run `bun run e2e` yourself when you want it.
- Real ax-mcp. Its redirect allowlist must include the production callback first.

## Production callback to allowlist

```
https://hark.coey.dev/mcp/callback
```

Loopback dev uses `http://127.0.0.1:<port>/callback`, which already matches the existing loopback rule.
