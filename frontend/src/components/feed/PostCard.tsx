import { useState, useEffect } from 'react'
import { Avatar } from '@/components/common'
import { formatRelative } from '@/utils/format'
import { feedApi, type ReactionType, type ReactionCounts } from '@/services/api'
import { useAuthStore } from '@/store'
import type { Post, Comment } from '@/types'

const REACTIONS: { type: ReactionType; emoji: string; label: string }[] = [
  { type: 'helpful',   emoji: '👍', label: 'Helpful'   },
  { type: 'inspiring', emoji: '❤️', label: 'Inspiring' },
  { type: 'wow',       emoji: '😮', label: 'Wow'       },
]

interface PostCardProps {
  post: Post
  onVote?: (id: string, upvotes: number) => void
}

export function PostCard({ post }: PostCardProps) {
  const { user } = useAuthStore()
  const [reactions, setReactions]         = useState<ReactionCounts>({ helpful: 0, inspiring: 0, wow: 0 })
  const [userReaction, setUserReaction]   = useState<ReactionType | null>(null)
  const [showComments, setShowComments]   = useState(false)
  const [comments, setComments]           = useState<Comment[]>([])
  const [commentCount, setCommentCount]   = useState(post.comment_count)
  const [loadingComments, setLoadingComments] = useState(false)
  const [newComment, setNewComment]       = useState('')
  const [submitting, setSubmitting]       = useState(false)

  // Load reactions on mount
  useEffect(() => {
    feedApi.getReactions(post.id)
      .then(({ data }) => {
        setReactions(data.counts)
        setUserReaction(data.userReaction)
      })
      .catch(() => {})
  }, [post.id])

  async function handleReaction(type: ReactionType) {
    try {
      let res
      if (userReaction === type) {
        // Toggle off
        res = await feedApi.unreact(post.id)
      } else {
        res = await feedApi.react(post.id, type)
      }
      setReactions(res.data.counts)
      setUserReaction(res.data.userReaction)
    } catch (err) { console.error(err) }
  }

  async function toggleComments() {
    if (!showComments && comments.length === 0) {
      setLoadingComments(true)
      try {
        const { data } = await feedApi.comments(post.id)
        setComments(data)
      } catch (err) { console.error(err) }
      finally { setLoadingComments(false) }
    }
    setShowComments(prev => !prev)
  }

  async function handleAddComment(e: React.FormEvent) {
    e.preventDefault()
    if (!newComment.trim()) return
    setSubmitting(true)
    try {
      const { data } = await feedApi.addComment(post.id, newComment.trim())
      setComments(prev => [...prev, data])
      setCommentCount(prev => prev + 1)
      setNewComment('')
    } catch (err) { console.error(err) }
    finally { setSubmitting(false) }
  }

  async function handleDeleteComment(commentId: string) {
    try {
      await feedApi.deleteComment(post.id, commentId)
      setComments(prev => prev.filter(c => c.id !== commentId))
      setCommentCount(prev => prev - 1)
    } catch (err) { console.error(err) }
  }

  const totalReactions = reactions.helpful + reactions.inspiring + reactions.wow

  return (
    <div style={{ background: '#261C14', border: '1px solid rgba(200,169,110,0.15)', borderRadius: 8, marginBottom: 14, overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px 8px' }}>
        {post.author && <Avatar user={post.author} />}
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#D4C9B5' }}>
            {post.author?.displayName ?? 'Unknown'}
          </div>
          <div style={{ fontSize: 11, color: '#7A6A58' }}>
            {post.location_name && `📍 ${post.location_name} · `}
            {formatRelative(post.created_at)}
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '0 14px 10px', fontSize: 13, color: '#C0B0A0', lineHeight: 1.6 }}>
        {post.content}
      </div>

      {/* Tags */}
      {post.tags && post.tags.length > 0 && (
        <div style={{ padding: '0 14px 10px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {post.tags.map(t => (
            <span key={t} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 3, background: 'rgba(200,169,110,0.1)', color: '#9A8A72' }}>#{t}</span>
          ))}
        </div>
      )}

      {/* Reactions + comments bar */}
      <div style={{ borderTop: '1px solid rgba(200,169,110,0.1)', display: 'flex', alignItems: 'center', padding: '7px 14px', gap: 6, flexWrap: 'wrap' }}>

        {/* Reaction buttons */}
        {REACTIONS.map(r => (
          <button
            key={r.type}
            onClick={() => handleReaction(r.type)}
            title={r.label}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '3px 8px', borderRadius: 20, fontSize: 12,
              border: `1px solid ${userReaction === r.type ? 'rgba(200,169,110,0.5)' : 'rgba(200,169,110,0.15)'}`,
              background: userReaction === r.type ? 'rgba(200,169,110,0.12)' : 'transparent',
              color: userReaction === r.type ? '#C8A96E' : '#6A5A48',
              cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            <span>{r.emoji}</span>
            {reactions[r.type] > 0 && <span>{reactions[r.type]}</span>}
          </button>
        ))}

        {/* Total reactions label */}
        {totalReactions > 0 && (
          <span style={{ fontSize: 11, color: '#6A5A48', marginLeft: 2 }}>
            {totalReactions} reaction{totalReactions !== 1 ? 's' : ''}
          </span>
        )}

        {/* Comments toggle */}
        <button
          onClick={toggleComments}
          style={{
            marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 12, color: showComments ? '#C8A96E' : '#6A5A48',
            background: 'none', border: 'none', cursor: 'pointer', padding: '3px 6px',
          }}
        >
          💬 {commentCount} {commentCount === 1 ? 'reply' : 'replies'}
        </button>
      </div>

      {/* Comments section */}
      {showComments && (
        <div style={{ borderTop: '1px solid rgba(200,169,110,0.08)', background: 'rgba(0,0,0,0.15)' }}>

          {/* Comment list */}
          {loadingComments ? (
            <div style={{ padding: '12px 14px', fontSize: 12, color: '#6A5A48' }}>Loading…</div>
          ) : (
            comments.map(c => (
              <div key={c.id} style={{ display: 'flex', gap: 8, padding: '10px 14px', borderBottom: '1px solid rgba(200,169,110,0.06)' }}>
                {c.author && <Avatar user={c.author} size="sm" />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#C8A96E' }}>
                      {c.author?.displayName ?? 'Unknown'}
                    </span>
                    <span style={{ fontSize: 11, color: '#6A5A48' }}>{formatRelative(c.created_at)}</span>
                    {user && c.author && user.id === (c.author as any).id && (
                      <button
                        onClick={() => handleDeleteComment(c.id)}
                        style={{ marginLeft: 'auto', fontSize: 11, color: '#6A5A48', background: 'none', border: 'none', cursor: 'pointer' }}
                      >
                        delete
                      </button>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: '#A09080', lineHeight: 1.5 }}>{c.content}</div>
                </div>
              </div>
            ))
          )}

          {comments.length === 0 && !loadingComments && (
            <div style={{ padding: '10px 14px', fontSize: 12, color: '#6A5A48' }}>
              No replies yet. Be the first!
            </div>
          )}

          {/* Add comment */}
          <form onSubmit={handleAddComment} style={{ display: 'flex', gap: 8, padding: '10px 14px', alignItems: 'center' }}>
            <input
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              placeholder="Add a reply…"
              style={{
                flex: 1, padding: '7px 10px', borderRadius: 6, fontSize: 12,
                border: '1px solid rgba(200,169,110,0.2)', background: 'rgba(255,255,255,0.04)',
                color: '#E8E0D0',
              }}
            />
            <button
              type="submit"
              disabled={!newComment.trim() || submitting}
              style={{
                padding: '7px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                background: newComment.trim() ? '#E8622A' : 'rgba(232,98,42,0.2)',
                color: newComment.trim() ? '#fff' : '#6A5A48',
                border: 'none', cursor: newComment.trim() ? 'pointer' : 'not-allowed',
                transition: 'all 0.15s', flexShrink: 0,
              }}
            >
              {submitting ? '…' : 'Reply'}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}