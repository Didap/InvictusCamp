<script setup lang="ts">
// An email as it arrives, isolated in a sandboxed frame: no scripts, no forms, no navigation of the
// page. The frame grows with its content, so the page keeps a single scroll.
const props = defineProps<{ html: string; title: string }>()

const frame = ref<HTMLIFrameElement>()
const height = ref(420)

/** The height of the email's content (the body, so the frame can shrink as well as grow). */
function fit() {
  const body = frame.value?.contentDocument?.body
  if (body) height.value = Math.max(200, Math.ceil(body.scrollHeight))
}

useResizeObserver(frame, () => fit())
watch(
  () => props.html,
  () => nextTick(fit),
)
</script>

<template>
  <iframe
    ref="frame"
    :srcdoc="html"
    :title="title"
    sandbox="allow-same-origin"
    referrerpolicy="no-referrer"
    class="block w-full rounded-lg border border-default bg-default"
    :style="{ height: `${height}px` }"
    @load="fit"
  />
</template>
