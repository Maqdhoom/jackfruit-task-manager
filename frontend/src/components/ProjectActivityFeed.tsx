import { useCallback, useEffect, useState } from 'react'
import { getErrorMessage } from '../auth/AuthContext'
import TaskComments from './TaskComments'
import {
  listProjectActivity,
  type ProjectTaskActivity,
} from '../services/collaborationService'

type Props = { projectId: string }

function describeActivity(activity: ProjectTaskActivity): string {
  const actor = activity.actor.name || 'Former member'
  const task = `"${activity.task.title}"`

  if (activity.type === 'task_created') return `${actor} created ${task}`
  if (activity.type === 'task_transferred') return `${actor} moved ${task} into the project`
  if (activity.type === 'task_deleted') return `${actor} deleted ${task}`
  if (activity.type === 'comment_added') return `${actor} commented on ${task}`

  const fields = activity.changes.map((change) => {
    if (change.field === 'status' && change.from !== change.to) {
      return `status (${String(change.from)} → ${String(change.to)})`
    }
    if (change.field === 'assigneeIds') return 'assignees'
    if (change.field === 'deadline') return 'deadline'
    return change.field
  })
  return `${actor} updated ${fields.join(', ') || 'task details'} on ${task}`
}

export default function ProjectActivityFeed({ projectId }: Props) {
  const [activities, setActivities] = useState<ProjectTaskActivity[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  const refresh = useCallback(async () => {
    setError('')
    try {
      const page = await listProjectActivity(projectId)
      setActivities(page.activities)
      setNextCursor(page.nextCursor)
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Unable to load project activity.'))
    } finally {
      setIsLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void refresh()
    const handleUpdate = (event: Event) => {
      if ((event as CustomEvent<{ projectId: string }>).detail?.projectId === projectId) {
        void refresh()
      }
    }
    window.addEventListener('project-activity-updated', handleUpdate)
    return () => window.removeEventListener('project-activity-updated', handleUpdate)
  }, [projectId, refresh])

  async function loadMore() {
    if (!nextCursor) return
    setIsLoadingMore(true)
    setError('')
    try {
      const page = await listProjectActivity(projectId, nextCursor)
      setActivities((current) => [...current, ...page.activities])
      setNextCursor(page.nextCursor)
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Unable to load older activity.'))
    } finally {
      setIsLoadingMore(false)
    }
  }

  return (
    <section aria-labelledby="project-activity-heading" className="project-activity">
      <div className="project-activity-heading">
        <div>
          <p className="eyebrow">PROJECT HISTORY</p>
          <h2 id="project-activity-heading">Recent activity</h2>
        </div>
        <button className="text-button" disabled={isLoading} onClick={() => void refresh()} type="button">
          Refresh
        </button>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {isLoading ? <p className="muted" role="status">Loading activity...</p> : activities.length ? (
        <ol className="activity-list">
          {activities.map((activity) => (
            <li className="activity-item" key={activity.id}>
              <span className="activity-dot" aria-hidden="true" />
              <div>
                <p>{describeActivity(activity)}</p>
                <time dateTime={activity.createdAt}>
                  {new Date(activity.createdAt).toLocaleString(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </time>
                {activity.type === 'task_deleted' && activity.hasPrivateNotes && (
                  <TaskComments
                    canComment={false}
                    privateArchive
                    taskId={activity.task.id}
                  />
                )}
              </div>
            </li>
          ))}
        </ol>
      ) : <p className="muted">No project activity yet.</p>}
      {nextCursor && (
        <button className="text-button" disabled={isLoadingMore} onClick={() => void loadMore()} type="button">
          {isLoadingMore ? 'Loading...' : 'Load older activity'}
        </button>
      )}
    </section>
  )
}
