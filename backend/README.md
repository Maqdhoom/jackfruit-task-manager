# Backend setup

Copy `.env.example` to `.env`, then configure the MongoDB connection and JWT secret before starting the API.

## Team invitation email

Project invitations are sent using SMTP. Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, and `EMAIL_FROM` in the backend environment. Set `FRONTEND_URL` to the public frontend origin so invitation links point to the deployed app. Never commit real credentials.

If delivery is unavailable, the invitation remains visible with a failed delivery status and can be retried from the project team page. Invitation links are single-use, expire after seven days, and can only be accepted by an account with the invited email address.

## Existing project role migration

Back up the database before deploying the new role model. After deploying the updated backend and configuring its database connection, run:

```powershell
npm run migrate:member-roles
```

The migration is safe to rerun: it converts legacy `Editor` memberships to `Member` and leaves `Viewer` memberships read-only.
