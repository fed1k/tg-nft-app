'use strict'

// Uses X's internal GraphQL API (browser session cookies) to check retweet/comment.
// Configure sessions via env: X_SESSIONS=authtoken1|ct0_1,authtoken2|ct0_2,...
// Or single session: X_AUTH_TOKEN + X_CT0

const BEARER = 'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA'

const GQL = {
  UserByScreenName:     '2qvSHpkWTMS9i0zJAwDNiA',
  UserTweets:           'hr4gzZONlq23okjU8fIe_A',
  UserTweetsAndReplies: '',
  TweetDetail:          'jd3V43oDY9cY7obs1YMfbQ',
}

const GQL_FEATURES = {
  responsive_web_graphql_exclude_directive_enabled: true,
  verified_phone_label_enabled: false,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  tweetypie_unmention_optimization_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  responsive_web_twitter_article_tweet_consumption_enabled: false,
  tweet_awards_web_tipping_enabled: false,
  freedom_of_speech_not_reach_fetch_enabled: true,
  standardized_nudges_misinfo: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: true,
  responsive_web_enhance_cards_enabled: false,
}

// ── Sessions ──────────────────────────────────────────────────────────────────

function loadSessions() {
  const multi = process.env.X_SESSIONS
  if (multi) {
    const parsed = multi.split(',').flatMap(s => {
      const [authToken, ct0] = s.trim().split('|')
      return (authToken && ct0) ? [{ authToken: authToken.trim(), ct0: ct0.trim(), cooldownUntil: 0 }] : []
    })
    if (parsed.length) return parsed
  }
  const authToken = process.env.X_AUTH_TOKEN
  const ct0 = process.env.X_CT0
  if (authToken && ct0) return [{ authToken, ct0, cooldownUntil: 0 }]
  return []
}

const sessions = loadSessions()
let sessionCursor = 0

async function getSession() {
  if (sessions.length === 0) throw new Error('No X sessions configured (set X_SESSIONS or X_AUTH_TOKEN+X_CT0)')
  const now = Date.now()
  for (let i = 0; i < sessions.length; i++) {
    const idx = (sessionCursor + i) % sessions.length
    if (now >= sessions[idx].cooldownUntil) {
      sessionCursor = (idx + 1) % sessions.length
      return sessions[idx]
    }
  }
  const earliest = sessions.reduce((a, b) => a.cooldownUntil < b.cooldownUntil ? a : b)
  const wait = earliest.cooldownUntil - Date.now() + 500
  await sleep(wait)
  return earliest
}

function buildHeaders(session) {
  return {
    Authorization: `Bearer ${BEARER}`,
    Cookie: `auth_token=${session.authToken}; ct0=${session.ct0}`,
    'x-csrf-token': session.ct0,
    'x-twitter-active-user': 'yes',
    'x-twitter-client-language': 'en',
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Referer': 'https://x.com/',
    'Origin': 'https://x.com',
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const sleep = ms => new Promise(r => setTimeout(r, ms))
const TWITTER_EPOCH = 1288834974657n

function dateToSnowflake(date) {
  return (BigInt(date.getTime()) - TWITTER_EPOCH) << 22n
}

function unwrapTweet(result) {
  if (!result) return null
  if (result.__typename === 'TweetWithVisibilityResults') return result.tweet
  return result
}

function tweetScreenName(tweet) {
  const u = tweet?.core?.user_results?.result
  return (u?.core?.screen_name ?? u?.legacy?.screen_name)?.toLowerCase()
}

function bottomCursor(entries) {
  for (const e of entries) {
    if (e.content?.cursorType === 'Bottom') return e.content.value
    if (e.entryId?.includes('cursor-bottom') && e.content?.value) return e.content.value
  }
  return null
}

function timelineInstructions(data) {
  return data?.data?.user?.result?.timeline?.timeline?.instructions ?? []
}

// ── Query ID management ───────────────────────────────────────────────────────

let idsRefreshed = false

async function doRefreshIds() {
  process.stderr.write('[engage-checker] Refreshing GQL query IDs...\n')
  const fresh = await refreshIds()
  Object.assign(GQL, fresh)
  idsRefreshed = true
}

// ── API client ────────────────────────────────────────────────────────────────

const userIdCache = new Map()

async function gqlGet(operationName, variables) {
  await sleep(300)

  if (!GQL[operationName] && !idsRefreshed) await doRefreshIds()
  if (!GQL[operationName]) {
    const e = new Error(`QueryId for ${operationName} not found`)
    e.isQueryIdMissing = true
    throw e
  }

  for (let attempt = 0; attempt <= sessions.length; attempt++) {
    const session = await getSession()
    const url = `https://x.com/i/api/graphql/${GQL[operationName]}/${operationName}?` +
      `variables=${encodeURIComponent(JSON.stringify(variables))}&features=${encodeURIComponent(JSON.stringify(GQL_FEATURES))}`
    try {
      const res = await fetch(url, { headers: buildHeaders(session) })
      if (res.status === 429) {
        session.cooldownUntil = Date.now() + 15 * 60 * 1000
        process.stderr.write(`[engage-checker] rate-limited, rotating session\n`)
        if (attempt < sessions.length) continue
        const e = new Error('All sessions rate-limited.')
        e.isRateLimit = true
        throw e
      }
      if (res.status === 400 && !idsRefreshed) {
        await doRefreshIds()
        continue
      }
      if (!res.ok) {
        const e = new Error(`X API error ${res.status}`)
        e.status = res.status
        throw e
      }
      return await res.json()
    } catch (err) {
      if (err.isRateLimit || err.isQueryIdMissing) throw err
      if (attempt < sessions.length) continue
      throw err
    }
  }
}

async function getUserId(screenName) {
  const key = screenName.toLowerCase()
  if (userIdCache.has(key)) return userIdCache.get(key)
  const data = await gqlGet('UserByScreenName', { screen_name: screenName, withSafetyModeUserFields: true })
  const id = data?.data?.user?.result?.rest_id
  if (!id) throw new Error(`User not found: ${screenName}`)
  userIdCache.set(key, id)
  return id
}

// ── Retweet check ─────────────────────────────────────────────────────────────

async function checkRetweeted(tweetId, userId, sinceId) {
  const targetIdBig = BigInt(tweetId)
  const cutoffId = sinceId && sinceId > targetIdBig ? sinceId : targetIdBig
  let cursor

  for (let page = 0; page < 50; page++) {
    const data = await gqlGet('UserTweets', {
      userId, count: 100,
      ...(cursor && { cursor }),
      includePromotedContent: false,
      withQuickPromoteEligibilityTweetFields: false,
      withVoice: true, withV2Timeline: true,
    })

    const instructions = timelineInstructions(data)
    let nextCursor = null
    let hadEntries = false

    for (const instr of instructions) {
      if (instr.type !== 'TimelineAddEntries') continue
      const entries = instr.entries ?? []
      hadEntries = hadEntries || entries.some(e => e.entryId && !e.entryId.includes('cursor'))

      for (const entry of entries) {
        const tweet = unwrapTweet(entry.content?.itemContent?.tweet_results?.result)
        if (!tweet) continue
        const entryIdBig = BigInt(tweet.legacy?.id_str ?? '0')
        if (entryIdBig > 0n && entryIdBig < cutoffId) return false
        const rtId = tweet.legacy?.retweeted_status_id_str
          ?? unwrapTweet(tweet.legacy?.retweeted_status_result?.result)?.rest_id
          ?? tweet.legacy?.retweeted_status_result?.result?.rest_id
        if (rtId === tweetId) return true
      }
      nextCursor = bottomCursor(entries)
    }

    if (!nextCursor || nextCursor === cursor || !hadEntries) break
    cursor = nextCursor
  }
  return false
}

// ── Comment check ─────────────────────────────────────────────────────────────

async function checkCommentedViaUserReplies(tweetId, targetUser, userId, sinceId) {
  const targetIdBig = BigInt(tweetId)
  const cutoffId = sinceId && sinceId > targetIdBig ? sinceId : targetIdBig
  let cursor

  for (let page = 0; page < 50; page++) {
    const data = await gqlGet('UserTweetsAndReplies', {
      userId, count: 100,
      ...(cursor && { cursor }),
      includePromotedContent: false,
      withCommunity: true,
      withQuickPromoteEligibilityTweetFields: false,
      withVoice: true, withV2Timeline: true,
    })

    const instructions = timelineInstructions(data)
    let nextCursor = null
    let hadEntries = false

    for (const instr of instructions) {
      if (instr.type !== 'TimelineAddEntries') continue
      const entries = instr.entries ?? []
      hadEntries = hadEntries || entries.some(e => e.entryId && !e.entryId.includes('cursor'))

      for (const entry of entries) {
        const tweet = unwrapTweet(entry.content?.itemContent?.tweet_results?.result)
        if (tweet) {
          const entryIdBig = BigInt(tweet.legacy?.id_str ?? '0')
          if (entryIdBig > 0n && entryIdBig < cutoffId) return false
          if (tweetScreenName(tweet) === targetUser && tweet.legacy?.in_reply_to_status_id_str === tweetId) return true
        }
        for (const item of entry.content?.items ?? []) {
          const t = unwrapTweet(item.item?.itemContent?.tweet_results?.result)
          if (t && tweetScreenName(t) === targetUser && t.legacy?.in_reply_to_status_id_str === tweetId) return true
        }
      }
      nextCursor = bottomCursor(entries)
    }

    if (!nextCursor || nextCursor === cursor || !hadEntries) break
    cursor = nextCursor
  }
  return false
}

async function checkCommentedViaThread(tweetId, targetUser, sinceId) {
  let cursor

  for (let page = 0; page < 50; page++) {
    const data = await gqlGet('TweetDetail', {
      focalTweetId: tweetId, count: 100,
      ...(cursor && { cursor }),
      referrer: 'tweet', with_rux_injections: false,
      includePromotedContent: true, withCommunity: true,
      withQuickPromoteEligibilityTweetFields: true,
      withBirdwatchNotes: true, withVoice: true, withV2Timeline: true,
    })

    const instructions = data?.data?.threaded_conversation_with_injections_v2?.instructions ?? []
    let nextCursor = null

    for (const instr of instructions) {
      if (instr.type !== 'TimelineAddEntries') continue
      const entries = instr.entries ?? []

      for (const entry of entries) {
        const tweet = unwrapTweet(entry.content?.itemContent?.tweet_results?.result)
        if (tweet) {
          const idBig = BigInt(tweet.legacy?.id_str ?? '0')
          const afterCutoff = !sinceId || idBig >= sinceId
          if (afterCutoff && tweetScreenName(tweet) === targetUser && tweet.legacy?.in_reply_to_status_id_str === tweetId) return true
        }
        for (const item of entry.content?.items ?? []) {
          const t = unwrapTweet(item.item?.itemContent?.tweet_results?.result)
          if (t) {
            const idBig = BigInt(t.legacy?.id_str ?? '0')
            const afterCutoff = !sinceId || idBig >= sinceId
            if (afterCutoff && tweetScreenName(t) === targetUser && t.legacy?.in_reply_to_status_id_str === tweetId) return true
          }
        }
      }
      nextCursor = bottomCursor(entries)
    }

    if (!nextCursor || nextCursor === cursor) break
    cursor = nextCursor
  }
  return false
}

async function checkCommented(tweetId, targetUser, userId, sinceId) {
  try {
    return await checkCommentedViaUserReplies(tweetId, targetUser, userId, sinceId)
  } catch (err) {
    if (!err.isQueryIdMissing && err.status !== 404 && err.status !== 400) throw err
    process.stderr.write('[engage-checker] UserTweetsAndReplies unavailable, scanning thread...\n')
    return checkCommentedViaThread(tweetId, targetUser, sinceId)
  }
}

// ── Query ID refresh ──────────────────────────────────────────────────────────

async function refreshIds() {
  const res = await fetch('https://x.com', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
  })
  const html = await res.text()
  const urls = [...html.matchAll(/https:\/\/abs\.twimg\.com\/responsive-web\/client-web\/[^"']+\.js/g)]
    .map(m => m[0]).filter((v, i, a) => a.indexOf(v) === i)

  const found = {}
  for (const url of urls) {
    const r = await fetch(url).catch(() => null)
    if (!r?.ok) continue
    const js = await r.text()
    for (const [, id, name] of js.matchAll(/queryId:"([^"]+)",operationName:"([^"]+)"/g)) found[name] = id
    for (const [, name, id] of js.matchAll(/operationName:"([^"]+)",queryId:"([^"]+)"/g)) if (!found[name]) found[name] = id
  }

  const relevant = ['UserByScreenName', 'UserTweets', 'UserTweetsAndReplies', 'TweetDetail']
  const result = {}
  for (const k of relevant) if (found[k]) result[k] = found[k]
  return result
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function checkEngage(username, tweetId, sinceDate) {
  const targetUser = username.toLowerCase().replace(/^@/, '')
  const userId = await getUserId(targetUser)
  const sinceId = sinceDate ? dateToSnowflake(new Date(sinceDate)) : null

  const [retweeted, commented] = await Promise.all([
    checkRetweeted(tweetId, userId, sinceId),
    checkCommented(tweetId, targetUser, userId, sinceId),
  ])

  return { retweeted, commented }
}
