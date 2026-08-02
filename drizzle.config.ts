import {defineConfig} from 'drizzle-kit'
export default defineConfig({
  out: './drizzle',
  schema: './server/db/schema.ts',
  dialect: 'mysql',
  dbCredentials: {
    host: '127.0.0.1',
    port: 3306,
    user: 'mycourse',
    password: 'mycourse_pass',
    database: 'mycourse'
  }
})