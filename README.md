## Volley Plus Console

Single Page Application built with **Vite + React Router + Tailwind CSS** to manage the [Volley Plus API](https://github.com/RZB1414/volleyApp-API.git). It exposes auth flows, multipart uploads, pending monitor, and download token generation using the backend contract described in the brief.

### Features
- 🔐 Auth context with login/register + `/auth/me` profile refresh and automatic header injection for `x-user-id` / `x-user-email`.
- 📊 Dashboard showing authenticated user metadata and `/health` heartbeat.
- 📁 Chunked upload manager with progress bars, ETag listing, cancel/finalize workflows, and pending sessions monitor that polls `/upload/multipart/pending`.
- 🎬 Download token generator that embeds the signed streaming URL directly in a `<video>` tag.
- 🎨 Tailwind CSS with responsive, dark-friendly layout plus reusable components.
- ✅ Vitest + Testing Library coverage for the auth provider and multipart helper.

### Tech Stack
- Vite + React (JavaScript, React Compiler enabled)
- React Router v7
- Tailwind CSS + PostCSS + autoprefixer
- Vitest + @testing-library/react

### Getting Started
1. **Install dependencies**
	```bash
	npm install
	```
2. **Configure environment**
	 - Copy `.env.example` to `.env` and set the Volley Plus API base URL:
		 ```bash
		 cp .env.example .env               # macOS/Linux
		 copy .env.example .env             # Windows PowerShell
		 # edit VITE_API_BASE_URL=http://localhost:3000
		 ```
3. **Run locally**
	```bash
	npm run dev
	```
	The dev server defaults to `http://localhost:5173`.

### Scripts
| Command | Description |
| --- | --- |
| `npm run dev` | Start Vite dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |
| `npm run lint` | ESLint via flat config |
| `npm run test` | Run Vitest suite once |
| `npm run test:watch` | Vitest in watch mode |

### Project Structure
```
src/
  components/        # Navbar, protected routes, UI primitives
  context/           # Auth context + provider
  hooks/             # useAuth, useInterval helpers
  pages/             # Login, Register, Dashboard, Upload, Pending, Download, 404
  routes/            # AppRoutes with private routing
  services/          # API client + multipart helper
  utils/             # Form validators and shared helpers
  styles/            # Tailwind pattern overlays
```

### Backend Contract Reference
- `POST /auth/register` – `{ name, email, password, age?, actualTeam?, country? }`
- `POST /auth/login` – `{ email, password }`
- `GET /auth/me` – Bearer token
- `POST /upload/multipart` – requires `x-user-id` header (auto-injected)
- `POST /upload/multipart/complete`
- `POST /upload/multipart/cancel`
- `GET /upload/multipart/pending?limit=n`
- `POST /download/generate` – `{ token }`
- `GET /download/use/:token` – Consumes the single-use token and redirects/streams the asset
- `GET /health`

All fetches are centralized in `src/services/api.js`, which automatically sets `Authorization` + Multipart headers, handles cookies, and produces typed `ApiError`s for field-level validation feedback.

### Testing
```bash
npm run test
```
Includes unit coverage for:
- AuthProvider (state persistence + logout)
- Multipart helper chunk logic and sequential upload orchestration

### Production Build
```bash
npm run build
```
Outputs static assets under `dist/`. Serve with any static host and configure the backend URL through `VITE_API_BASE_URL`.
