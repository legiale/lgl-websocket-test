# 🟢 Realtime Order Board (WebSocket Demo)

A simple full-stack application demonstrating **real-time updates using WebSockets** with a Go backend.

This project simulates a small business use case (e.g. kitchen / order management system), where multiple clients see updates instantly without refreshing.

---

## 🚀 Features

- Create orders
- Update order status (`Pending → Preparing → Ready`)
- Real-time synchronization across all connected clients
- No page refresh required
- Lightweight in-memory data store (no DB)

---

## 🧠 Why this project?

This project demonstrates:

- Real-time communication using WebSockets
- Backend concurrency handling in Go
- Simple but realistic business logic
- Production mindset (deployment, reverse proxy, process management)

---

## 🏗️ Tech Stack

**Backend**
- Go
- Gin
- Gorilla WebSocket

**Frontend**
- HTML / CSS / Vanilla JavaScript

**Deployment**
- DigitalOcean Droplet
- Apache (reverse proxy)
- systemd (process management)

---

## 📦 Project Structure
├── main.go # Go server (API + WebSocket)
├── go.mod
├── web/
│ ├── index.html # UI
│ └── app.js # Frontend logic + WebSocket




---

## ⚙️ How It Works

1. Client connects to `/ws` via WebSocket
2. Server maintains active connections
3. When an order is created/updated:
   - Update in-memory data
   - Broadcast event to all clients
4. All connected clients update UI instantly

---

## 🖥️ Run Locally

### 1. Clone repo

```bash
git clone git@github.com:legiale/lgl-websocket-test.git
cd lgl-websocket-test
```
### 2. Install dependencies
```bash
go mod tidy
```

###3. Run server
```bash
go run main.go
```

###4. Open browser
http://localhost:8080


###5. Test realtime
Open 2 tabs
Create/update orders
Verify instant sync

==========================================
📊 Example Use Cases

Restaurant kitchen dashboard

Order tracking system

Admin monitoring panel

Live operations board


🔧 Future Improvements

Add Redis Pub/Sub for scaling

Add database (PostgreSQL/MySQL)

Add authentication (JWT)

Add Docker + CI/CD

Add role-based UI


📌 Key Takeaways

Demonstrates WebSocket-based real-time architecture

Shows Go concurrency handling

Includes production deployment setup

Clean and minimal implementation for interviews

