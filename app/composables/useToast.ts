// 輕量 toast：底部滑入、自動消失。狀態放共用 state，由全域 <Toast> host 渲染。
export interface ToastItem {
  id: number
  message: string
  type: 'success' | 'error' | 'info'
}

export const useToasts = () => useState<ToastItem[]>('toasts', () => [])

let seq = 0

export function useToast() {
  const toasts = useToasts()

  function dismiss(id: number) {
    toasts.value = toasts.value.filter(t => t.id !== id)
  }

  function show(message: string, type: ToastItem['type'] = 'info', duration = 2600) {
    const id = ++seq
    toasts.value = [...toasts.value, { id, message, type }]
    if (import.meta.client) setTimeout(() => dismiss(id), duration)
    return id
  }

  return {
    show,
    success: (m: string, d?: number) => show(m, 'success', d),
    error: (m: string, d?: number) => show(m, 'error', d),
    info: (m: string, d?: number) => show(m, 'info', d),
    dismiss,
  }
}
