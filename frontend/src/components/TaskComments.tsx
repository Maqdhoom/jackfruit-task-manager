import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { getErrorMessage } from '../auth/AuthContext'
import {
  addPersonalTaskComment,
  addProjectTaskComment,
  listPersonalTaskComments,
  listProjectTaskComments,
  listTransferredPrivateTaskNotes,
  notifyProjectActivityChanged,
  type TaskComment as TaskCommentData,
} from '../services/collaborationService'

type Props = {
  taskId: string
  projectId?: string
  canComment: boolean
  privateArchive?: boolean
}

function displayTimestamp(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export default function TaskComments({ taskId, projectId, canComment, privateArchive = false }: Props) {
  const [comments, setComments] = useState<TaskCommentData[]>([])
  const [privateNotes, setPrivateNotes] = useState<TaskCommentData[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [privateNotesNextCursor, setPrivateNotesNextCursor] = useState<string | null>(null)
  const [body, setBody] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [isLoadingPrivateNotes, setIsLoadingPrivateNotes] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const loadPage = useCallback(async (cursor?: string, privateCursor?: string) => {
    if (projectId) return listProjectTaskComments(projectId, taskId, cursor, privateCursor)
    if (privateArchive) return listTransferredPrivateTaskNotes(taskId, cursor)
    return listPersonalTaskComments(taskId, cursor)
  }, [privateArchive, projectId, taskId])

  useEffect(() => {
    let active = true
    setIsLoading(true)
    setError('')
    void loadPage().then((page) => {
      if (!active) return
      setComments(page.comments)
      setPrivateNotes(page.privateNotes ?? [])
      setNextCursor(page.nextCursor)
      setPrivateNotesNextCursor(page.privateNotesNextCursor ?? null)
    }).catch((requestError: unknown) => {
      if (active) setError(getErrorMessage(requestError, 'Unable to load comments.'))
    }).finally(() => {
      if (active) setIsLoading(false)
    })
    return () => { active = false }
  }, [loadPage])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = body.trim()
    if (!text) {
      setError('Write a comment before posting.')
      return
    }

    setError('')
    setIsSubmitting(true)
    try {
      const comment = projectId
        ? await addProjectTaskComment(projectId, taskId, text)
        : await addPersonalTaskComment(taskId, text)
      setComments((current) => [comment, ...current])
      setBody('')
      if (projectId) notifyProjectActivityChanged(projectId)
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Unable to post comment.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function loadMore(privateOnly = false) {
    const cursor = privateOnly ? privateNotesNextCursor : nextCursor
    if (!cursor) return
    if (privateOnly) setIsLoadingPrivateNotes(true)
    else setIsLoadingMore(true)
    setError('')
    try {
      const page = await loadPage(privateOnly ? undefined : cursor, privateOnly ? cursor : undefined)
      if (privateOnly) {
        setPrivateNotes((current) => [...current, ...(page.privateNotes ?? [])])
        setPrivateNotesNextCursor(page.privateNotesNextCursor ?? null)
      } else {
        setComments((current) => [...current, ...page.comments])
        setNextCursor(page.nextCursor)
      }
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Unable to load older comments.'))
    } finally {
      setIsLoadingMore(false)
      setIsLoadingPrivateNotes(false)
    }
  }

  function renderComments(items: TaskCommentData[]) {
    if (!items.length) return <p className="muted">No comments yet.</p>
    return (
      <ol className="comment-list">
        {items.map((comment) => (
          <li className="comment-item" key={comment.id}>
            <div className="comment-meta">
              <strong>{comment.author.name || 'Former member'}</strong>
              <time dateTime={comment.createdAt}>{displayTimestamp(comment.createdAt)}</time>
            </div>
            <p>{comment.body}</p>
          </li>
        ))}
      </ol>
    )
  }

  return (
    <section aria-label="Task comments" className="task-comments">
      <h4>{privateArchive ? 'Your private notes' : 'Comments'}</h4>
      {error && <p className="form-error" role="alert">{error}</p>}
      {isLoading ? <p className="muted" role="status">Loading comments...</p> : renderComments(comments)}
      {nextCursor && (
        <button className="text-button" disabled={isLoadingMore} onClick={() => void loadMore()} type="button">
          {isLoadingMore ? 'Loading...' : privateArchive ? 'Load older private notes' : 'Load older comments'}
        </button>
      )}
      {projectId && privateNotes.length > 0 && (
        <section aria-label="Your private notes" className="private-comment-archive">
          <h5>Your private notes <span className="muted">(only you can see these)</span></h5>
          {renderComments(privateNotes)}
          {privateNotesNextCursor && (
            <button className="text-button" disabled={isLoadingPrivateNotes} onClick={() => void loadMore(true)} type="button">
              {isLoadingPrivateNotes ? 'Loading...' : 'Load older private notes'}
            </button>
          )}
        </section>
      )}
      {canComment ? (
        <form className="comment-form" onSubmit={(event) => void handleSubmit(event)}>
          <label>
            Add a comment
            <textarea
              maxLength={5000}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Share an update or ask a question..."
              required
              rows={3}
              value={body}
            />
          </label>
          <div className="comment-form-footer">
            <span className="muted">{body.length}/5000</span>
            <button className="button button-secondary" disabled={isSubmitting || !body.trim()} type="submit">
              {isSubmitting ? 'Posting...' : 'Post comment'}
            </button>
          </div>
        </form>
      ) : privateArchive
        ? <p className="muted">These notes are private to you.</p>
        : <p className="muted">You can read comments but cannot post as a Viewer.</p>}
    </section>
  )
}
