import { DurableObject } from 'cloudflare:workers';

export { DIRECTORY_NAME } from './directory-name';

export type Grant = {
  readonly owner: string;
  readonly email: string | null;
  readonly accountId: string;
  readonly accountName: string;
  readonly gateway: string;
  readonly accessToken: string;
  readonly refreshToken: string | null;
  readonly expiresAt: number;
  readonly scope: string;
};

type GrantRow = {
  owner: string;
  email: string | null;
  account_id: string;
  account_name: string;
  gateway: string;
  access_token: string;
  refresh_token: string | null;
  expires_at: number;
  scope: string;
};

export class Directory extends DurableObject {
  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env as never);
    ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS grants (owner TEXT PRIMARY KEY, email TEXT, account_id TEXT NOT NULL, account_name TEXT NOT NULL, gateway TEXT NOT NULL, access_token TEXT NOT NULL, refresh_token TEXT, expires_at INTEGER NOT NULL, scope TEXT NOT NULL, updated_at INTEGER NOT NULL)`,
    );
    ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, owner TEXT NOT NULL, expires_at INTEGER NOT NULL)`,
    );
  }

  saveGrant(grant: Grant): void {
    this.ctx.storage.sql.exec(
      `INSERT INTO grants (owner, email, account_id, account_name, gateway, access_token, refresh_token, expires_at, scope, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(owner) DO UPDATE SET email = excluded.email, account_id = excluded.account_id, account_name = excluded.account_name, gateway = excluded.gateway, access_token = excluded.access_token, refresh_token = COALESCE(excluded.refresh_token, grants.refresh_token), expires_at = excluded.expires_at, scope = excluded.scope, updated_at = excluded.updated_at`,
      grant.owner,
      grant.email,
      grant.accountId,
      grant.accountName,
      grant.gateway,
      grant.accessToken,
      grant.refreshToken,
      grant.expiresAt,
      grant.scope,
      Date.now(),
    );
  }

  grantFor(owner: string): Grant | null {
    const row = this.ctx.storage.sql
      .exec<GrantRow>(
        'SELECT owner, email, account_id, account_name, gateway, access_token, refresh_token, expires_at, scope FROM grants WHERE owner = ?',
        owner,
      )
      .toArray()[0];

    return row === undefined
      ? null
      : {
          owner: row.owner,
          email: row.email,
          accountId: row.account_id,
          accountName: row.account_name,
          gateway: row.gateway,
          accessToken: row.access_token,
          refreshToken: row.refresh_token,
          expiresAt: row.expires_at,
          scope: row.scope,
        };
  }

  dropGrant(owner: string): void {
    this.ctx.storage.sql.exec('DELETE FROM grants WHERE owner = ?', owner);
    this.ctx.storage.sql.exec('DELETE FROM sessions WHERE owner = ?', owner);
  }

  openSession(id: string, owner: string, expiresAt: number): void {
    this.ctx.storage.sql.exec(
      'INSERT OR REPLACE INTO sessions (id, owner, expires_at) VALUES (?, ?, ?)',
      id,
      owner,
      expiresAt,
    );
  }

  sessionOwner(id: string): string | null {
    return (
      this.ctx.storage.sql
        .exec<{ owner: string }>(
          'SELECT owner FROM sessions WHERE id = ? AND expires_at > ?',
          id,
          Date.now(),
        )
        .toArray()[0]?.owner ?? null
    );
  }

  closeSession(id: string): void {
    this.ctx.storage.sql.exec('DELETE FROM sessions WHERE id = ?', id);
  }
}
