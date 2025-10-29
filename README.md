---
## ⚙️ 3️⃣ **Backend Repo – `Romish-backend`**
**File:** `/README.md`
```markdown
# ⚙️ Romish.gg Backend

The Romish.gg backend powers all matchmaking logic, user management, and server integration for the CS2 10-man system.

---

## 🧠 What It Does
- Handles **login, queue, and match lifecycle**
- Uses **WebSockets** for real-time player updates
- Integrates with **DatHost API** to spin up CS2 servers
- Manages ELO, bans, and trust scores in MongoDB
- Provides REST endpoints for the Vue frontend

---

## 💡 Why I Built It
To replace the limitations of existing Discord pug bots — which lacked control over match states, ready checks, and full API integration.  
This backend centralizes all matchmaking logic so that both the **web app** and **Discord bot** can operate on the same synchronized state.

---

## 🧱 Tech Stack
- **Node.js + Express.js**
- **MongoDB (Mongoose)**
- **WebSockets**
- **JWT Authentication**
- **DatHost API integration**

---
