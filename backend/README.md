# Backend setup

Copy `.env.example` to `.env`, then configure the MongoDB connection and JWT secret before starting the API.

## Team invitation email

Project invitations are sent using SMTP. Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, and `EMAIL_FROM` in the backend environment. Set `FRONTEND_URL` to the public frontend origin so invitation links point to the deployed app. Never commit real credentials.

If delivery is unavailable, the invitation remains visible with a failed delivery status and can be retried from the project team page. Invitation links are single-use, expire after seven days, and can only be accepted by an account with the invited email address.

## Project task assignment

Project Owners and Admins can create and fully manage project tasks and assign them to active Owners, Admins, or Members. Members may create tasks (automatically assigned to themselves) and update status only on tasks assigned to them. Viewers remain read-only. Removing or downgrading a teammate removes their assignments.

Personal tasks remain private. A task owner can move one of their tasks into a project they belong to; this atomically removes the personal copy and assigns the task to its creator in the project. A project Owner/Admin can instead request a transfer from an active project member. The member sees the request without exposing personal task details, chooses a task, and explicitly approves before that task is moved. Transfer requests expire after seven days.

Task transfer relies on MongoDB transactions so that a personal task cannot be duplicated or lost if a transfer fails. Use a replica-set deployment such as MongoDB Atlas.

## Task comments and project activity

Comments are immutable after posting and limited to 5,000 characters. Owners, Admins, and Members may comment on project tasks; Viewers may read but not post. Personal task comments are private to the task owner. Comment lists are returned newest-first in pages of 20.

When a personal task is transferred into a project, its existing comments remain private to the task owner and appear separately from the shared project discussion. The transfer confirmation explains this. If the project task is later deleted, the owner can still view those notes from its deletion entry. Project activity never includes private comment text.

Project activity records task creation, task field and assignment changes, shared comments being added, task transfers, and task deletion. Entries include the actor, timestamp, task title, and changed fields where applicable. Deleting a project task removes its shared comments but leaves the deletion event in project history. Activity is visible to current project members, including Viewers, and is returned newest-first in pages of 20.

Project task changes and their activity entries are committed together using MongoDB transactions. Use a replica-set deployment such as MongoDB Atlas.

After deploying this feature, backfill creation history for existing project tasks by running `npm run migrate:project-task-activity` from the backend directory. The migration is safe to rerun and does not create a duplicate task-created entry.

## In-app notifications and deadline reminders

Authenticated users can use these endpoints with the existing JWT cookie or bearer token:

- `GET /api/notifications?cursor=<notification-id>` — first/newest page (20 items), unread count, and optional next cursor.
- `PATCH /api/notifications/:notificationId/read` — mark one notification read.
- `PATCH /api/notifications/read-all` — mark all of the current user's notifications read.
- `DELETE /api/notifications/:notificationId` — hide one of the current user's notifications.

Every operation is scoped to the signed-in user. Deletion hides a notification while preserving its reminder idempotency record, so a deleted reminder is not recreated by a scheduler retry.

The backend starts a `node-cron` reminder job after connecting to MongoDB. It checks project tasks every minute and notifies each active assignee once for each deadline stage: 24 hours before the deadline, when it is due, and shortly after it becomes overdue. Completed tasks and unassigned tasks do not receive reminders. Personal tasks are not included. A unique per-user reminder key prevents duplicates; the job checkpoint and lock support catch-up after downtime and prevent concurrent server instances from duplicating work.

Changing a task deadline generates reminders for the new deadline; completing a task or removing an assignee clears their unread task reminders. No additional environment variables are required.

## Calendar and live updates

The authenticated `GET /api/tasks/calendar` endpoint returns the signed-in user's personal tasks and tasks from projects they currently belong to or own, including task deadlines and project labels. It does not expose tasks from projects the user cannot access. Tasks without a deadline are omitted.

The Calendar page displays tasks by due date in a month grid, with previous/next month navigation and a shortcut back to the current month. The dashboard, project list, project workspace, and Calendar refresh task data every 30 seconds while visible; notification counts and lists refresh every 60 seconds. Refreshing pauses in background tabs and runs when a tab becomes visible again.

## Existing project role migration

Back up the database before deploying the new role model. After deploying the updated backend and configuring its database connection, run:

```powershell
npm run migrate:member-roles
```

The migration is safe to rerun: it converts legacy `Editor` memberships to `Member` and leaves `Viewer` memberships read-only.
