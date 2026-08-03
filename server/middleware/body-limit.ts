const MAX_BODY_BYTES = 64 * 1024

export default defineEventHandler((event) => {
  const len = getHeader(event, 'content-length')
  if (len && Number(len) > MAX_BODY_BYTES) {
    throw createError({ statusCode: 413, message: '请求体过大' })
  }
})
