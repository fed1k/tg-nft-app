/**
 * Add / update main owner in live MongoDB (AdminStaff).
 * Loads MONGODB_URI from project root .env (or server/.env).
 *
 * Usage (from repo root):
 *   cd server && npm run seed:owner
 *
 * Or with explicit id:
 *   cd server && OWNER_TELEGRAM_IDS=7435118437 npm run seed:owner
 */
import dotenv from 'dotenv'
import mongoose from 'mongoose'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../.env') })
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const MONGODB_URI = process.env.MONGODB_URI?.trim()?.replace(/^['"]|['"]$/g, '')
if (!MONGODB_URI) {
  console.error(
    'Missing MONGODB_URI. Add it to .env (copy from Vercel → Project → Settings → Environment Variables).',
  )
  process.exit(1)
}

const OWNER_IDS = String(process.env.OWNER_TELEGRAM_IDS || '7435118437')
  .split(/[\s,]+/)
  .map((s) => parseInt(s, 10))
  .filter((n) => Number.isFinite(n) && n > 0)

const staffSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true },
    username: { type: String, required: true },
    telegramId: { type: Number, index: true },
    roles: { type: [String], default: ['owner'] },
    online: { type: Boolean, default: false },
  },
  { timestamps: true },
)

const AdminStaff = mongoose.models.AdminStaff || mongoose.model('AdminStaff', staffSchema)

async function main() {
  console.log(`Connecting to MongoDB… (owners: ${OWNER_IDS.join(', ')})`)
  await mongoose.connect(MONGODB_URI)
  for (const tgId of OWNER_IDS) {
    const username = `@user${tgId}`
    const existing = await AdminStaff.findOne({ $or: [{ telegramId: tgId }, { username }] })
    if (existing) {
      await AdminStaff.updateOne(
        { _id: existing._id },
        { $set: { telegramId: tgId, roles: ['owner'] } },
      )
      console.log(`✓ Updated owner: telegramId=${tgId} username=${existing.username}`)
    } else {
      await AdminStaff.create({
        name: `Owner ${tgId}`,
        email: `owner${tgId}@giftedforge.local`,
        username,
        telegramId: tgId,
        roles: ['owner'],
      })
      console.log(`✓ Created owner: telegramId=${tgId} username=${username}`)
    }
  }
  const all = await AdminStaff.find({}).select('name username telegramId roles').lean()
  console.log('\nAll admins in DB:', all.length)
  all.forEach((r) => {
    console.log(`  - ${r.name} ${r.username} id=${r.telegramId ?? '—'} roles=${(r.roles || []).join(',')}`)
  })
  await mongoose.disconnect()
  console.log('\nDone. Open Mini App → Admin Portal with that Telegram account.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
