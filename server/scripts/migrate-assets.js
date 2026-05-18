import 'dotenv/config'
import mongoose from 'mongoose'

const MONGODB_URI = process.env.MONGODB_URI?.trim()?.replace(/^['"]|['"]$/g, '')
if (!MONGODB_URI) {
  throw new Error('MONGODB_URI is required')
}

const assetSchema = new mongoose.Schema(
  {
    category: { type: String },
    marketTab: { type: String },
    title: { type: String },
  },
  { strict: false, collection: 'adminassets' },
)
const AdminAsset = mongoose.models.AdminAsset || mongoose.model('AdminAsset', assetSchema)

function inferCategory(title = '') {
  const t = String(title).toLowerCase()
  if (t.includes('game') || t.includes('cyber')) return 'Gaming'
  if (t.includes('cube') || t.includes('crystal') || t.includes('3d')) return '3D Art'
  return 'Collectibles'
}

async function run() {
  await mongoose.connect(MONGODB_URI)
  const rows = await AdminAsset.find({}, { _id: 1, category: 1, marketTab: 1, title: 1 }).lean()

  let updated = 0
  for (const row of rows) {
    const patch = {}
    if (!row.category) patch.category = inferCategory(row.title)
    if (!row.marketTab) patch.marketTab = 'Explore'
    if (Object.keys(patch).length) {
      await AdminAsset.updateOne({ _id: row._id }, { $set: patch })
      updated += 1
    }
  }

  console.log(`Migration complete. Updated ${updated} asset records.`)
  await mongoose.disconnect()
}

run().catch((err) => {
  console.error('Migration failed', err)
  process.exit(1)
})
