# WhatsApp Bulk Sender 💬

A full-stack app to send WhatsApp messages (with images) to multiple phone numbers via **Twilio**.

## 📁 Project Structure

```
whatsapp-sender/
├── server/          ← Node.js + Express + Twilio backend
│   ├── index.js
│   ├── .env         ← Twilio credentials (never commit this!)
│   └── package.json
└── client/          ← React + Vite frontend
    ├── src/
    │   ├── App.jsx
    │   └── index.css
    └── vite.config.js
```

## 🚀 How to Run

### 1. Start the Backend (Terminal 1)
```bash
cd server
npm start
```
Server runs on **http://localhost:5000**

### 2. Start the Frontend (Terminal 2)
```bash
cd client
npm run dev
```
App runs on **http://localhost:3000**

## ⚠️ Important Notes

### Twilio Trial Account
- You can **only send to verified phone numbers** (numbers you've added in your Twilio console).
- To verify a number: Go to [Twilio Console → Verified Caller IDs](https://console.twilio.com/us1/develop/phone-numbers/manage/verified)

### WhatsApp Sandbox
Twilio trial uses a **WhatsApp Sandbox**. Recipients must first send:
```
join <your-sandbox-word>
```
to your Twilio WhatsApp number (`+14155238886`) before they can receive messages.

### Full Account SID
The Account SID in `.env` may be **truncated** from the screenshot. Please verify the full SID at:
https://console.twilio.com → Dashboard → Account Info

### Phone Number Format
Always include the **country code** with `+`:
- Pakistan: `+92300XXXXXXX`
- USA: `+1202XXXXXXX`
- UK: `+447911XXXXXX`

## 🔧 Environment Variables (`server/.env`)

```env
TWILIO_ACCOUNT_SID=ACf21d41867e9d8f85c2417c...  # Full SID here
TWILIO_AUTH_TOKEN=ac8e17acb74b92bb861850f714
TWILIO_WHATSAPP_NUMBER=+14155238886
PORT=5000
```
