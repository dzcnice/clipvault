// Official persistence contract; all durable bytes go through the main-process vault.
import { SessionPersistence, materializeCreateHeader, materializeAppendBatch, assertStoredId, assertVersion, assertContiguous, validateStoredEvents, SessionAlreadyOwnedError, SessionHandleClosedError, SessionReadOnlyError, SessionPersistenceNotFoundError, SessionPersistenceRevision } from '@deepseek-ai/dsh-session-persistence'

export default class VaultPersistence extends SessionPersistence {
  writers = new Map()
  constructor(ctx) {
    super(ctx)
    ctx.on('session/event', (session, event) => { this.writers.get(session.id)?.live(event) })
    ctx.on('dispose', () => this.flush())
  }
  async request(operation, payload = {}) {
    const response = await fetch(`${process.env.CV_BRIDGE_URL}/session`, { method: 'POST', headers: { authorization: `Bearer ${process.env.CV_BRIDGE_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ id: process.env.CV_SESSION_ID, operation, ...payload }), signal: AbortSignal.timeout(30_000) })
    if (!response.ok) throw new Error('Encrypted session storage unavailable')
    return response.json()
  }
  assertId(id) { if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new Error('Session scope mismatch') }
  async create(header, options) {
    options?.signal?.throwIfAborted(); this.assertId(header.id)
    const snapshot = materializeCreateHeader(header); assertVersion(snapshot)
    if (snapshot.isSeeded || options?.inheritedEventCount) throw new Error('Forked sessions are not enabled')
    await this.request('create', { id: header.id, header: snapshot })
    return this.handle(snapshot, 'write')
  }
  async open(id, access, options) {
    options?.signal?.throwIfAborted(); this.assertId(id)
    const stored = await this.request('read', { id })
    if (!stored) throw new SessionPersistenceNotFoundError(id)
    assertStoredId(id, stored.header); assertVersion(stored.header)
    validateStoredEvents(stored.header, stored.events)
    return this.handle(stored.header, access)
  }
  handle(header, access) {
    const id = header.id
    if (access === 'write' && this.writers.has(id)) throw new SessionAlreadyOwnedError(id)
    let closed = false, pending = Promise.resolve(), failure
    const check = (operation, write = false) => {
      if (closed) throw new SessionHandleClosedError(id, operation)
      if (write && access !== 'write') throw new SessionReadOnlyError(id, operation)
      if (failure) throw failure
    }
    const append = (events, options) => {
      check('append', true); options?.signal?.throwIfAborted()
      const batch = materializeAppendBatch(events)
      const next = pending.then(async () => {
        if (failure) throw failure
        const stored = await this.request('count', { id })
        assertContiguous(id, batch, stored.count)
        validateStoredEvents(header, [...batch])
        await this.request('append', { id, cursor: stored.count, events: batch })
      })
      pending = next.catch(error => { failure = error })
      return next
    }
    const handle = {
      id, header, access, inheritedEventCount: 0,
      read: async (offset = 0, length, options) => {
        check('read'); options?.signal?.throwIfAborted(); await pending; check('read')
        if (!Number.isSafeInteger(offset) || offset < 0 || (length !== undefined && (!Number.isSafeInteger(length) || length < 0))) throw new Error('Invalid session range')
        const stored = await this.request('read', { id })
        const events = validateStoredEvents(header, stored.events)
        return { eventState: 'detached', events: events.slice(offset, length === undefined ? undefined : offset + length) }
      },
      append,
      live: event => { void append([event]).catch(() => {}) },
      flush: async options => { check('flush', true); options?.signal?.throwIfAborted(); await pending; check('flush', true) },
      close: async () => {
        if (closed) return
        await pending
        closed = true
        if (this.writers.get(id) === handle) this.writers.delete(id)
        if (failure) throw failure
      },
      [Symbol.asyncDispose]: async () => handle.close()
    }
    if (access === 'write') this.writers.set(id, handle)
    return handle
  }
  async flush() { await Promise.all([...this.writers.values()].map(handle => handle.flush())) }
  async stat(id, options) {
    this.assertId(id); options?.signal?.throwIfAborted(); await this.flush()
    const stored = await this.request('read', { id })
    return stored ? { header: stored.header, revision: SessionPersistenceRevision(String(stored.events.length)), eventCount: stored.events.length } : undefined
  }
  async list(options) {
    const ids = process.env.CV_HARNESS_UTILITY === '1' ? [process.env.CV_SESSION_ID] : await this.request('list')
    const items = await Promise.all(ids.map(id => this.stat(id, options)))
    return items.filter(Boolean)
  }
}
