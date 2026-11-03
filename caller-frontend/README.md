# Caller Workspace Frontend

This is a separate React/Vite application for field callers. It can be built
and deployed independently from the main Electoral Intelligence dashboard.

```bash
cd caller-frontend
npm install
cp .env.example .env.local
npm run dev
```

The caller app runs at `http://localhost:5174` by default.

Set `VITE_CALLER_API_URL` to the deployed Caller Service URL at build time.
The production host must serve `index.html` for unknown paths so refreshes work
on the app route. Build with `npm run build`; the static site is written to
`dist/`.
