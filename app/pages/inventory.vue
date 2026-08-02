<script setup lang="ts">
const courses = ref([])           // 课程列表
const loading = ref(true)

onMounted(async () => {
  courses.value = await $fetch('/api/courses')
  loading.value = false
})

async function save(course) {
  await $fetch(`/api/courses/${course.id}`, {
    method: 'PUT',
    body: { stock: course.stock }
  })
}
</script>

<template>
  <table>
    <tr v-for="c in courses" :key="c.id">
      <td>{{ c.title }}</td>
      <td>
        <input v-model.number="c.stock" type="number" />
      </td>
      <td><button @click="save(c)">保存</button></td>
    </tr>
  </table>
</template>