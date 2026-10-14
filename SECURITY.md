# Security

Report a vulnerability privately through GitHub Security Advisories on this repository.

hark signs people in with Cloudflare OAuth and keeps their tokens in a Durable Object. The browser only ever holds a signed session cookie. Every model call is made by the Worker, on the signed-in person's account, through their own authenticated AI Gateway. Local-only switches that skip sign-in or point at a fake Cloudflare work only on loopback hosts, and the gate fails if they appear in the deployed config.
