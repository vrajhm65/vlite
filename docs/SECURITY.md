# VLITE Security

## Authentication

- **Host authentication**: JWT token with `role: 'host'`
- **Participant sessions**: Server-generated JWT tokens
- **Token storage**: Backend JWT secret never exposed to frontend
- **Authorization**: Server verifies role and room membership on every request

## Security Headers

- Helmet.js for HTTP header security
- CORS configured with explicit origin
- Rate limiting on all public endpoints
- Input validation with express-validator

## Authorization Rules

1. Participants can NEVER become hosts via frontend modification
2. All room access verified server-side
3. All score calculations performed server-side
4. All answer validation performed server-side
5. All expert queue ordering performed server-side
6. No secret keys in frontend code

## Environment Variables

Never commit `.env`. Use `.env.example` as template.

Secrets:
- `MONGODB_URI` - Database connection
- `JWT_SECRET` - JWT signing
- `RECAPTCHA_SECRET_KEY` - CAPTCHA verification
- `CLOUDINARY_API_SECRET` - Storage credentials

## Rate Limiting

- General API: 100 requests per minute
- Auth endpoints: 10 requests per 15 minutes
- Answer submissions: 5 per 10 seconds

## Input Validation

All inputs validated with express-validator:
- Email format
- Name length
- LRN format (4 digits)
- Option indices within bounds
- Session tokens verified

## Do NOT

- Expose database URI in frontend
- Commit `.env` to Git
- Use `origin: "*"` in CORS for production
- Trust client-side timers for scoring
- Trust client-side scores
- Allow client-side role switching
