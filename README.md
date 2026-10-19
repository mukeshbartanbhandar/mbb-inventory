# MBB Stock Management (MERN)

Responsive stock-entry app for Mukesh Bartan Bhandar.

## Features
- Admin login with JWT authentication
- Password hash stored in MongoDB (bcrypt)
- Protected stock API
- Search by product name
- Add, edit, delete stock entries
- Auto-calculated Total and Cost per Piece
- Responsive table and mobile card layout
- MongoDB persistence

## Requirements
- Node.js 18+
- MongoDB local instance or MongoDB Atlas connection string

## 1. Configure the backend
```bash
cd server
cp .env.example .env
```
Edit `.env` and set `MONGO_URI`, `JWT_SECRET`, `ADMIN_USERNAME`, and `ADMIN_PASSWORD`.

## 2. Install and seed the admin
```bash
npm install
npm run seed:admin
npm run dev
```
The API runs on http://localhost:5000.

## 3. Run the frontend (second terminal)
```bash
cd client
npm install
cp .env.example .env
npm run dev
```
Open the Vite URL shown (usually http://localhost:5173).

## Notes
- The seed command creates/updates the admin from `ADMIN_USERNAME` and `ADMIN_PASSWORD`.
- Do not commit `.env` files. Use a long, unique `JWT_SECRET` in production.
- For deployment, configure environment variables on the hosting provider, use HTTPS, and set `CLIENT_ORIGIN`.
- This is a solid starter project, but add backups, audit logs, rate limiting, and a deployment review before relying on it for critical business records.
