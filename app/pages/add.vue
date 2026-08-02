<script setup lang="ts">
const title = ref('')
const description = ref('')
const price = ref('')
const content = ref('')
const submitting = ref(false)
const error = ref('')
const done = ref(false)

async function submit() {
  submitting.value = true
  error.value = ''
  done.value = false
  try {
    await $fetch('/api/courses', {
      method: 'POST',
      body: { title: title.value, description: description.value, price: Number(price.value) || 0, content: content.value }
    })
    title.value = ''
    description.value = ''
    price.value = ''
    content.value = ''
    done.value = true
  } catch (e: any) {
    error.value = e?.data?.statusMessage || '提交失败，请重试'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="page">
    <div class="page__head">
      <h1 class="page__title">添加课程</h1>
      <p class="page__subtitle">填写课程信息，保存后即上架</p>
    </div>

    <UiCard class="form-card">
      <form @submit.prevent="submit">
        <UiInput v-model="title" label="标题" placeholder="例如：Vue 3 入门到实战" required />
        <UiInput v-model="description" label="描述" placeholder="一句话介绍课程亮点" />
        <UiInput v-model="price" label="价格（元）" type="number" min="0" placeholder="0 表示免费" />
        <UiTextarea v-model="content" label="课程正文" placeholder="付费购买后可见的内容" :rows="8" />

        <div v-if="done" class="form-card__done">保存成功，已上架。</div>
        <div v-if="error" class="form-card__error">{{ error }}</div>

        <div class="form-card__actions">
          <UiButton type="submit" :loading="submitting" :disabled="submitting">
            {{ submitting ? '保存中...' : '保存课程' }}
          </UiButton>
          <NuxtLink to="/"><UiButton type="button" variant="ghost">取消</UiButton></NuxtLink>
        </div>
      </form>
    </UiCard>
  </div>
</template>

<style scoped>
.page {
  max-width: 640px;
  margin: 0 auto;
  padding: var(--space-8) var(--space-6) var(--space-16);
}
.page__head {
  margin-bottom: var(--space-6);
}
.page__title {
  margin: 0;
  font-size: var(--fs-3xl);
  font-weight: 700;
  color: var(--color-ink);
}
.page__subtitle {
  margin: var(--space-2) 0 0;
  color: var(--color-text-secondary);
}
.form-card {
  padding: var(--space-8);
}
.form-card form {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}
.form-card__done {
  color: var(--color-primary);
  font-size: var(--fs-sm);
  font-weight: 500;
}
.form-card__error {
  color: var(--color-danger);
  font-size: var(--fs-sm);
}
.form-card__actions {
  display: flex;
  gap: var(--space-3);
  padding-top: var(--space-2);
}
</style>
