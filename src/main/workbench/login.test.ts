// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
vi.mock('electron', () => ({ BrowserWindow: class {}, dialog: {}, session: {} }))
vi.mock('../../db/workbench-store', () => ({}))
import { loginTarget, loginFillScript } from './login'

describe('login target and controlled filling', () => {
  it('rejects insecure and embedded authentication destinations', () => {
    expect(() => loginTarget('http://fixture.test/login')).toThrow()
    expect(() => loginTarget('https://name:pass@fixture.test/login')).toThrow()
    expect(loginTarget('https://fixture.test/login').origin).toBe('https://fixture.test')
  })
  it('fills only one visible login form, handles quoted values as data, and never submits', () => {
    document.body.innerHTML = '<form><input name="username"><input type="password"><button>Submit</button></form>'
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
    const submit = vi.fn(); document.querySelector('form')!.addEventListener('submit', submit)
    const secret = 'quote";window.unwanted=1;//'
    expect(window.eval(loginFillScript('fixture-user', secret))).toEqual({ filled: true })
    expect(document.querySelector<HTMLInputElement>('input[type=password]')!.value).toBe(secret)
    expect(submit).not.toHaveBeenCalled()
    expect((window as unknown as { unwanted?: number }).unwanted).toBeUndefined()
    document.body.innerHTML = '<input type="password"><input type="password">'
    expect(window.eval(loginFillScript('fixture', secret)).filled).toBe(false)
    vi.restoreAllMocks()
  })
})
