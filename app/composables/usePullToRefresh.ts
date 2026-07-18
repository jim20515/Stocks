// 手機下拉刷新：在頁面捲到最頂端時，向下拉動觸發傳入的 refresh()。
// 指示器狀態放共用 state，由 layout 統一渲染一顆 spinner；桌機不啟用（無 touch）。
export interface PullToRefreshState {
  distance: number
  refreshing: boolean
}

export const usePullToRefreshState = () =>
  useState<PullToRefreshState>('pullToRefresh', () => ({ distance: 0, refreshing: false }))

const THRESHOLD = 70
const MAX = 110

export function usePullToRefresh(refresh: () => Promise<any> | any) {
  if (!import.meta.client) return
  const state = usePullToRefreshState()
  let startY = 0
  let pulling = false

  const atTop = () => (window.scrollY || document.documentElement.scrollTop || 0) <= 0

  function onStart(e: TouchEvent) {
    // 有 BottomSheet 開啟時（body 被鎖捲動）不觸發，避免在彈窗內下拉誤刷新
    if (document.body.style.overflow === 'hidden') { pulling = false; return }
    if (state.value.refreshing || e.touches.length !== 1 || !atTop()) { pulling = false; return }
    startY = e.touches[0].clientY
    pulling = true
  }

  function onMove(e: TouchEvent) {
    if (!pulling || state.value.refreshing) return
    const dy = e.touches[0].clientY - startY
    if (dy <= 0 || !atTop()) { pulling = false; state.value.distance = 0; return }
    // 阻尼：拉動距離折半，並設上限
    state.value.distance = Math.min(MAX, dy * 0.5)
    // 拉動中阻止原生捲動/回彈，讓指示器順暢跟手
    if (state.value.distance > 4 && e.cancelable) e.preventDefault()
  }

  async function onEnd() {
    if (!pulling) return
    pulling = false
    if (state.value.distance >= THRESHOLD && !state.value.refreshing) {
      state.value.refreshing = true
      state.value.distance = THRESHOLD
      try { await refresh() } finally {
        state.value.refreshing = false
        state.value.distance = 0
      }
    } else {
      state.value.distance = 0
    }
  }

  onMounted(() => {
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onEnd, { passive: true })
    window.addEventListener('touchcancel', onEnd, { passive: true })
  })
  onBeforeUnmount(() => {
    window.removeEventListener('touchstart', onStart)
    window.removeEventListener('touchmove', onMove)
    window.removeEventListener('touchend', onEnd)
    window.removeEventListener('touchcancel', onEnd)
    state.value.distance = 0
    state.value.refreshing = false
  })
}
