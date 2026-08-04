const MAX_BODY_BYTES = 64 * 1024

// 真正读取 body 并限制字节数，防 chunked / 无 Content-Length 绕过。
// readRawBody 结果会缓存到 event.node.req，后续 readBody 复用，不会重复消费流。
export default defineEventHandler(async (event) => {
  const method = getMethod(event)
  if (method !== 'POST' && method !== 'PUT' && method !== 'PATCH' && method !== 'DELETE') {
    return
  }
  const len = getHeader(event, 'content-length')
  if (len && Number(len) > MAX_BODY_BYTES) {
    throw createError({ statusCode: 413, message: '请求体过大' })
  }
  const raw = await readRawBody(event)
  if (raw && Buffer.byteLength(raw) > MAX_BODY_BYTES) {
    throw createError({ statusCode: 413, message: '请求体过大' })
  }
})
