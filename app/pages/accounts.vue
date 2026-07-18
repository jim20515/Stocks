<script setup lang="ts">
const { authHeaders } = useAuth()
const { isGuest, promptLogin } = useGuestGate()

const { data: accounts, refresh } = await useAppData<{ id: number; name: string }[]>('/api/accounts', {}, DEMO_ACCOUNTS)

const newName = ref('')
const adding = ref(false)
const error = ref('')
const editingId = ref<number | null>(null)
const editingName = ref('')
// ── 拖曳排序 ──
const dragIndex = ref<number | null>(null)   // 拖曳來源 index
const overIndex = ref<number | null>(null)   // 目前經過的目標 index
const handleGrabbed = ref(false)             // 只允許從漢堡把手發起拖曳

function onDragStart(index: number, e: DragEvent) {
  if (!handleGrabbed.value) { e.preventDefault(); return }  // 非從把手 → 取消拖曳
  dragIndex.value = index
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(index))     // Firefox 需要才會啟動拖曳
  }
}
function onDragOver(index: number, e: DragEvent) {
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  overIndex.value = index
}
function onDrop(index: number) {
  const from = dragIndex.value
  resetDrag()
  if (from === null || from === index) return
  reorderAndSave(from, index)
}
function resetDrag() {
  dragIndex.value = null
  overIndex.value = null
  handleGrabbed.value = false
}

// 把第 from 個帳戶移到第 to 個位置（插入語意），並立即儲存新順序。
// 此順序會套用到全系統的帳戶下拉選單。
async function reorderAndSave(from: number, to: number) {
  if (isGuest.value) return promptLogin()
  const list = [...(accounts.value ?? [])]
  const [moved] = list.splice(from, 1)
  list.splice(to, 0, moved)
  accounts.value = list          // 樂觀更新，畫面立即換位
  error.value = ''
  try {
    await $fetch('/api/accounts/reorder', {
      method: 'POST',
      headers: authHeaders.value as HeadersInit,
      body: { ids: list.map(a => a.id) },
    })
    await refresh()
  } catch (e: any) {
    error.value = e?.data?.message ?? '排序儲存失敗'
    await refresh()               // 失敗則還原成伺服器順序
  }
}

async function addAccount() {
  if (isGuest.value) return promptLogin()
  if (!newName.value.trim()) return
  adding.value = true
  error.value = ''
  try {
    await $fetch('/api/accounts', {
      method: 'POST',
      headers: authHeaders.value as HeadersInit,
      body: { name: newName.value.trim() },
    })
    newName.value = ''
    await refresh()
  } catch (e: any) {
    error.value = e?.data?.message ?? '新增失敗'
  } finally {
    adding.value = false
  }
}

async function deleteAccount(id: number) {
  if (isGuest.value) return promptLogin()
  if (!confirm('確定刪除此帳戶別名？')) return
  await $fetch(`/api/accounts/${id}`, {
    method: 'DELETE',
    headers: authHeaders.value as HeadersInit,
  })
  await refresh()
}

function startEdit(acc: { id: number; name: string }) {
  if (isGuest.value) return promptLogin()
  editingId.value = acc.id
  editingName.value = acc.name
}

function cancelEdit() {
  editingId.value = null
  editingName.value = ''
}

async function saveEdit(id: number) {
  if (!editingName.value.trim()) return
  await $fetch(`/api/accounts/${id}`, {
    method: 'PATCH',
    headers: authHeaders.value as HeadersInit,
    body: { name: editingName.value.trim() },
  })
  editingId.value = null
  await refresh()
}
</script>

<template>
  <div class="p-6 max-w-lg">
    <h1 class="text-lg font-semibold text-slate-800 mb-1">帳戶管理</h1>
    <p class="text-xs text-slate-400 mb-6">新增帳戶別名，並拖曳左側把手調整順序；此順序會套用到全系統的帳戶下拉選單</p>

    <!-- 新增 -->
    <div class="flex gap-2 mb-6">
      <input
        v-model="newName"
        @keyup.enter="(e) => !e.isComposing && addAccount()"
        type="text"
        placeholder="輸入帳戶別名，例如：老婆、小孩"
        class="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
      />
      <button
        @click="addAccount"
        :disabled="adding || !newName.trim()"
        class="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition"
      >
        新增
      </button>
    </div>
    <p v-if="error" class="text-xs text-red-500 -mt-4 mb-4">{{ error }}</p>

    <!-- 清單 -->
    <div v-if="accounts?.length" class="space-y-2">
      <div
        v-for="(acc, index) in accounts"
        :key="acc.id"
        :draggable="editingId !== acc.id"
        @dragstart="onDragStart(index, $event)"
        @dragover="onDragOver(index, $event)"
        @drop="onDrop(index)"
        @dragend="resetDrag"
        class="flex items-center gap-2 px-4 py-3 bg-white border rounded-lg transition"
        :class="[
          dragIndex === index ? 'opacity-40' : '',
          overIndex === index && dragIndex !== null && dragIndex !== index
            ? 'border-indigo-400 bg-indigo-50/50'
            : 'border-slate-200',
        ]"
      >
        <!-- 編輯中 -->
        <template v-if="editingId === acc.id">
          <input
            v-model="editingName"
            @keyup.enter="(e) => !e.isComposing && saveEdit(acc.id)"
            @keyup.escape="cancelEdit"
            autofocus
            class="flex-1 px-2 py-1 text-sm border border-indigo-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          <button @click="saveEdit(acc.id)" class="text-xs text-indigo-600 hover:text-indigo-700 font-medium transition">儲存</button>
          <button @click="cancelEdit" class="text-xs text-slate-400 hover:text-slate-600 transition">取消</button>
        </template>
        <!-- 一般狀態 -->
        <template v-else>
          <!-- 拖曳把手（漢堡三條線，桌機用）-->
          <span
            @mousedown="handleGrabbed = true"
            class="hidden sm:inline-flex shrink-0 -ml-1 px-1 text-slate-300 hover:text-indigo-500 cursor-grab active:cursor-grabbing select-none transition"
            title="拖曳調整順序"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </span>
          <span class="flex-1 text-sm text-slate-700">{{ acc.name }}</span>
          <!-- 上下移動（手機用，觸控友善）-->
          <button @click="reorderAndSave(index, index - 1)" :disabled="index === 0" title="上移"
            class="sm:hidden shrink-0 p-1 text-slate-300 hover:text-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed transition">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" />
            </svg>
          </button>
          <button @click="reorderAndSave(index, index + 1)" :disabled="index === accounts.length - 1" title="下移"
            class="sm:hidden shrink-0 p-1 text-slate-300 hover:text-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed transition">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <button @click="startEdit(acc)" class="text-slate-300 hover:text-indigo-400 transition" title="編輯">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
          <button @click="deleteAccount(acc.id)" class="text-slate-300 hover:text-red-400 transition" title="刪除">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </template>
      </div>
    </div>
    <p v-else class="text-sm text-slate-400 text-center py-8">尚無帳戶別名</p>
  </div>
</template>
