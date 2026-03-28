import { Avatar } from '@/components/common'
import { formatRelative } from '@/utils/format'
import { feedApi } from '@/services/api'
import type { Post } from '@/types'

export function PostCard({ post, onVote }: { post: Post; onVote?: (id: string, upvotes: number) => void }) {
  async function handleVote(value: 1 | -1) {
    const next = post.user_vote === value ? 0 : value
    try {
      const { data } = await feedApi.vote(post.id, next as 1 | -1 | 0)
      onVote?.(post.id, data.upvotes)
    } catch (err) { console.error(err) }
  }

  return (
    <div style={{ background: '#261C14', border: '1px solid rgba(200,169,110,0.15)', borderRadius: 8, marginBottom: 14, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px 8px' }}>
        <Avatar user={post.author} />
        <div>

          <div style={{ fontSize: 13, fontWeight: 500, color: '#D4C9B5' }}>
            {post.author?.displayName ?? 'Unknown'}
          </div>

          <div style={{ fontSize: 11, color: '#7A6A58' }}>
            {post.location_name && `📍 ${post.location_name} · `}{formatRelative(post.created_at)}
          </div>
        </div>
      </div>
      <div style={{ padding: '0 14px 10px', fontSize: 13, color: '#C0B0A0', lineHeight: 1.6 }}>{post.content}</div>
      {post.tags && post.tags.length > 0 && (
        <div style={{ padding: '0 14px 10px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {post.tags.map(t => (
            <span key={t} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 3, background: 'rgba(200,169,110,0.1)', color: '#9A8A72' }}>#{t}</span>
          ))}
        </div>
      )}
      <div style={{ borderTop: '1px solid rgba(200,169,110,0.1)', display: 'flex', padding: '7px 14px', gap: 14 }}>
        <button onClick={() => handleVote(1)} style={{ fontSize: 12, color: post.user_vote === 1 ? '#7AB050' : '#6A5A48', background: 'none', border: 'none', cursor: 'pointer' }}>
          ↑ {post.upvotes} helpful
        </button>
        <button style={{ fontSize: 12, color: '#6A5A48', background: 'none', border: 'none', cursor: 'pointer' }}>
          💬 {post.comment_count} replies
        </button>
      </div>
    </div>
  )
}
