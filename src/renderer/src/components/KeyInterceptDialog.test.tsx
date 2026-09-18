// @vitest-environment jsdom
/**
 * KeyInterceptDialog formKey：content / promptId 变化时强制重挂载
 * 默认名格式：智能标签 · YYYY-MM-DD（见 suggestCredentialName）
 */
import { describe, it, expect } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { KeyInterceptDialog, suggestCredentialName } from './KeyInterceptDialog'

const noop = (): void => undefined

describe('KeyInterceptDialog formKey', () => {
  it('content 变化时 InterceptForm 重新挂载（默认 name 取新类型标签）', () => {
    const { rerender, queryByDisplayValue } = render(
      <KeyInterceptDialog
        open
        onOpenChange={noop}
        content="AAAA-first-secret"
        detectedType="AWS_ACCESS_KEY"
        onShareAsCredential={noop}
        onSaveLocalOnly={noop}
        onCancel={noop}
      />
    )

    const input = queryByDisplayValue(/^AWS · /)
    expect(input).toBeTruthy()
    fireEvent.change(input!, { target: { value: 'my edited name' } })
    expect(queryByDisplayValue('my edited name')).toBeTruthy()

    rerender(
      <KeyInterceptDialog
        open
        onOpenChange={noop}
        content="BBBB-second-secret"
        detectedType="GITHUB_PAT"
        onShareAsCredential={noop}
        onSaveLocalOnly={noop}
        onCancel={noop}
      />
    )

    expect(queryByDisplayValue('my edited name')).toBeFalsy()
    expect(queryByDisplayValue(/^GitHub · /)).toBeTruthy()
  })

  it('promptId 作为 key 主导时 content 不变也能强制重置', () => {
    const { rerender, queryByDisplayValue } = render(
      <KeyInterceptDialog
        open
        onOpenChange={noop}
        content="same"
        detectedType="TOKEN"
        promptId="p-1"
        onShareAsCredential={noop}
        onSaveLocalOnly={noop}
        onCancel={noop}
      />
    )

    const input = queryByDisplayValue(/^Token · /)
    fireEvent.change(input!, { target: { value: 'edited' } })
    expect(queryByDisplayValue('edited')).toBeTruthy()

    rerender(
      <KeyInterceptDialog
        open
        onOpenChange={noop}
        content="same"
        detectedType="TOKEN"
        promptId="p-2"
        onShareAsCredential={noop}
        onSaveLocalOnly={noop}
        onCancel={noop}
      />
    )
    expect(queryByDisplayValue('edited')).toBeFalsy()
    expect(queryByDisplayValue(/^Token · /)).toBeTruthy()
  })

  it('默认名不含密钥片段（sk- / 头尾切片）', () => {
    const name = suggestCredentialName('OPENAI_API_KEY', 'sk-0abcDEF123a5d')
    expect(name).toMatch(/^OpenAI · \d{4}-\d{2}-\d{2}$/)
    expect(name).not.toMatch(/sk-/i)
    expect(name).not.toContain('a5d')
    expect(name).not.toContain('0abc')

    const aws = suggestCredentialName('AWS_ACCESS_KEY', 'AAAA-first-secret')
    expect(aws).toMatch(/^AWS · \d{4}-\d{2}-\d{2}$/)
    expect(aws).not.toContain('AAAA')

    const { queryByDisplayValue } = render(
      <KeyInterceptDialog
        open
        onOpenChange={noop}
        content="sk-proj-abcdefghijk"
        detectedType="OPENAI"
        onShareAsCredential={noop}
        onSaveLocalOnly={noop}
        onCancel={noop}
      />
    )
    const input = queryByDisplayValue(/^OpenAI · \d{4}-\d{2}-\d{2}$/) as HTMLInputElement | null
    expect(input).toBeTruthy()
    expect(input!.value).not.toMatch(/sk-/i)
  })
})
