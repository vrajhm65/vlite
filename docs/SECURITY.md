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
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` - Cloudinary configuration

## CAPTCHA

- `CAPTCHA_PROVIDER`: `none` (dev), `recaptcha-v3`, `hcaptcha`
- `RECAPTCHA_SITE_KEY`: Public key (safe for frontend)
- `RECAPTCHA_SECRET_KEY`: Private key (NEVER expose to frontend)
- CAPTCHA verification always server-side
- Failed CAPTCHA rejects join request

## Rate Limiting

- General API: 100 requests per minute
- Auth endpoints: 10 requests per 15 minutes
- Answer submissions: 5 per 10 seconds
- Room creation: 5 per minute

## Image Storage

- Images stored in Cloudinary (or S3-compatible storage)
- Only image URL stored in MongoDB
- File size limited to 5MB
- File types restricted: JPEG, PNG, GIF, WebP
- Upload endpoint requires host authentication

## Do NOT

- Expose database URI in frontend
- Commit `.env` to Git
- Use `origin: "*"` in CORS for production
- Trust client-side timers for scoring
- Trust client-side scores
- Allow client-side role switching
- Store images directly in MongoDB
- Store secrets in frontend code
